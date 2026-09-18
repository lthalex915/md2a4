import { llmChat } from "./llm-proxy.ts";
import { mergeYamlFields } from "./front-matter.ts";
import { collectOddDollarLines } from "./math-repair.ts";
import { applyStructureHints, collectStructureCandidates, type StructureHint } from "./structure.ts";
import { isFaithful } from "./fidelity.ts";
import { parseModelJson } from "./json.ts";
import type { Change } from "./types.ts";
import {
  enabledAiFeatures,
  hasLlmKey,
  type AiFeatureId,
  type LlmSettings,
} from "./llm-settings.ts";

const SYS = "JSON only. Copy words from the notes. Do not add sentences.";

async function ask(
  settings: LlmSettings,
  user: string,
): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  const res = await llmChat({
    data: {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: user },
      ],
    },
  });
  if (!res.ok) return res;
  const json = parseModelJson(res.text);
  if (json == null) return { ok: false, error: "The model did not return JSON." };
  return { ok: true, json };
}

function leftoverHtml(md: string): string | null {
  if (!/<[a-z][\s/][^>]*>/i.test(md)) return null;
  const m = md.match(/<[^>]+>[\s\S]{0,360}/i);
  return m ? m[0].slice(0, 420) : null;
}

export type AiEnhanceResult = {
  markdown: string;
  changes: Change[];
  used: AiFeatureId[];
  error: string | null;
};

export async function enhanceWithAi(
  source: string,
  localMarkdown: string,
  localChanges: Change[],
  settings: LlmSettings,
): Promise<AiEnhanceResult> {
  const used: AiFeatureId[] = [];
  const changes = [...localChanges];
  let md = localMarkdown;
  const errors: string[] = [];
  const on = enabledAiFeatures(settings).filter((id) => id !== "fidelity");

  if (!hasLlmKey(settings) || on.length === 0) {
    return { markdown: md, changes, used, error: null };
  }

  if (on.includes("import")) {
    const frag = leftoverHtml(md);
    if (frag) {
      const res = await ask(
        settings,
        `Strip tags. Keep the same words. Return JSON {"md":"..."}\n\n${frag}`,
      );
      if (res.ok && res.json && typeof res.json === "object" && "md" in res.json) {
        const next = String((res.json as { md: unknown }).md ?? "");
        if (next && isFaithful(frag, next).ok) {
          md = md.replace(frag, next.trim());
          used.push("import");
          changes.push({
            id: "ai-import",
            kind: "import",
            summary: "AI stripped leftover HTML tags.",
          });
        }
      } else if (!res.ok) errors.push(res.error);
    }
  }

  if (on.includes("math")) {
    const odd = collectOddDollarLines(md);
    if (odd.length) {
      const res = await ask(
        settings,
        `Each line has a stray $. Classify math or currency. JSON object of index→label.\n${odd.map((l, i) => `${i}: ${l}`).join("\n")}`,
      );
      if (res.ok && res.json && typeof res.json === "object") {
        const labels = res.json as Record<string, unknown>;
        let n = 0;
        odd.forEach((line, i) => {
          if (String(labels[String(i)] || labels[i] || "") === "currency") return;
          if (String(labels[String(i)] || labels[i] || "") !== "math") return;
          if (!line.startsWith("$") || line.endsWith("$")) return;
          const closed = `${line}$`;
          if (md.includes(line)) {
            md = md.replace(line, closed);
            n += 1;
          }
        });
        if (n) {
          used.push("math");
          changes.push({
            id: "ai-math",
            kind: "math",
            summary: `AI closed ${n} unmatched $ math span${n === 1 ? "" : "s"}.`,
          });
        }
      } else if (!res.ok) errors.push(res.error);
    }
  }

  if (on.includes("structure")) {
    const cands = collectStructureCandidates(md);
    if (cands.length) {
      const res = await ask(
        settings,
        `Classify each title that sits above a list. Values: list, aside, skip. JSON object title→value.\n${cands.map((c) => c.title).join("\n")}`,
      );
      if (res.ok && res.json && typeof res.json === "object") {
        const hints: Record<string, StructureHint> = {};
        for (const c of cands) {
          const v = String(
            (res.json as Record<string, unknown>)[c.title] ?? "",
          ).toLowerCase();
          if (v === "list" || v === "aside" || v === "skip") hints[c.title] = v;
        }
        const next = applyStructureHints(md, hints);
        if (next !== md) {
          md = next;
          used.push("structure");
          changes.push({
            id: "ai-structure",
            kind: "structure",
            summary: "AI labeled extra titled lists already in the notes.",
          });
        }
      } else if (!res.ok) errors.push(res.error);
    }
  }

  if (on.includes("frontMatter")) {
    const head = source
      .replace(/^---[\s\S]*?---\s*/, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 10)
      .join("\n")
      .slice(0, 500);
    if (head) {
      const res = await ask(
        settings,
        `Copy title and chapter number if present. JSON {"title":string|null,"chapter":string|null}. Chapter must be like "4" or "4A".\n${head}`,
      );
      if (res.ok && res.json && typeof res.json === "object") {
        const rec = res.json as { title?: unknown; chapter?: unknown };
        const next = mergeYamlFields(md, {
          title: typeof rec.title === "string" ? rec.title : null,
          chapter: typeof rec.chapter === "string" ? rec.chapter : null,
        });
        if (next !== md) {
          md = next;
          used.push("frontMatter");
          changes.push({
            id: "ai-fm",
            kind: "front-matter",
            summary: "AI copied title/chapter from the opening lines.",
          });
        }
      } else if (!res.ok) errors.push(res.error);
    }
  }

  const faithful = isFaithful(source, md);
  if (!faithful.ok) {
    return {
      markdown: localMarkdown,
      changes: localChanges,
      used: [],
      error: faithful.reason || "AI proposed wording that is not in the source.",
    };
  }

  return {
    markdown: md,
    changes,
    used,
    error: errors.length ? errors[0] : null,
  };
}
