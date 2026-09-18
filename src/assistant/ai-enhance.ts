import { llmChat } from "./llm-proxy.ts";
import { mergeYamlFields } from "./front-matter.ts";
import { applyStructureHints, collectStructureCandidates, type StructureHint } from "./structure.ts";
import { isFaithful } from "./fidelity.ts";
import { parseModelJson, takeMd } from "./json.ts";
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

async function askNotes(
  settings: LlmSettings,
  instruction: string,
  md: string,
): Promise<{ ok: true; md: string } | { ok: false; error: string }> {
  const res = await ask(
    settings,
    `${instruction}\n\nReturn JSON {"md":"<the complete notes>"}.\n\n${md}`,
  );
  if (!res.ok) return res;
  const next = takeMd(res.json);
  if (!next) return { ok: false, error: "The model did not return notes." };
  const faithful = isFaithful(md, next);
  if (!faithful.ok) return { ok: false, error: faithful.reason || "AI proposed wording that is not in the source." };
  return { ok: true, md: next };
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

  if (on.includes("import") && /<[a-z][\s/][^>]*>/i.test(md)) {
    const res = await askNotes(
      settings,
      "Strip leftover HTML tags. Keep the same words. Return the complete notes.",
      md,
    );
    if (res.ok && res.md !== md) {
      md = res.md;
      used.push("import");
      changes.push({
        id: "ai-import",
        kind: "import",
        summary: "AI stripped leftover HTML tags.",
      });
    } else if (!res.ok) errors.push(res.error);
  }

  if (on.includes("math")) {
    const res = await askNotes(
      settings,
      "Repair math delimiters ($…$, $$…$$, unclosed TeX). Keep currency like $100. Do not rewrite formulas. Return the complete notes.",
      md,
    );
    if (res.ok && res.md !== md) {
      md = res.md;
      used.push("math");
      changes.push({
        id: "ai-math",
        kind: "math",
        summary: "AI repaired math delimiters in the notes.",
      });
    } else if (!res.ok) errors.push(res.error);
  }

  if (on.includes("structure")) {
    const cands = collectStructureCandidates(md);
    const hintLine = cands.length
      ? `Titles that sit above lists:\n${cands.map((c) => c.title).join("\n")}\n`
      : "";
    const res = await ask(
      settings,
      `Wrap titled lists already in the notes as :::list or :::aside. Values for each title: list, aside, skip. You may also return the complete notes.\n${hintLine}JSON {"hints":{"<title>":"list"|"aside"|"skip"}, "md"?: "<complete notes>"}.\n\n${md}`,
    );
    if (res.ok && res.json && typeof res.json === "object") {
      const rec = res.json as { hints?: unknown; md?: unknown };
      const hints: Record<string, StructureHint> = {};
      const rawHints =
        rec.hints && typeof rec.hints === "object" && !Array.isArray(rec.hints)
          ? (rec.hints as Record<string, unknown>)
          : (res.json as Record<string, unknown>);
      for (const c of cands) {
        const v = String(rawHints[c.title] ?? "").toLowerCase();
        if (v === "list" || v === "aside" || v === "skip") hints[c.title] = v;
      }
      let next = Object.keys(hints).length ? applyStructureHints(md, hints) : md;
      const full = takeMd(res.json);
      if (full && isFaithful(md, full).ok) next = full;
      if (next !== md) {
        md = next;
        used.push("structure");
        changes.push({
          id: "ai-structure",
          kind: "structure",
          summary: "AI labeled titled lists already in the notes.",
        });
      }
    } else if (!res.ok) errors.push(res.error);
  }

  if (on.includes("frontMatter")) {
    const res = await ask(
      settings,
      `Copy title and chapter number if present. JSON {"title":string|null,"chapter":string|null}. Chapter must be like "4" or "4A".\n\n${md}`,
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
          summary: "AI copied title/chapter from the notes.",
        });
      }
    } else if (!res.ok) errors.push(res.error);
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
