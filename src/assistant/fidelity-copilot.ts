import { compile, type ThemeId, type ValidationIssue } from "../compiler/index.ts";
import { isFaithful } from "./fidelity.ts";
import { parseModelJson } from "./json.ts";
import { llmChat } from "./llm-proxy.ts";
import { hasLlmKey, type LlmSettings } from "./llm-settings.ts";
import { collectOddDollarLines, repairMath } from "./math-repair.ts";
import { protectRegions } from "./protect.ts";

/** Validation codes that can be addressed by editing the Markdown source. */
export const SOURCE_FIXABLE = new Set([
  "emoji",
  "dollar-math",
  "empty-box",
  "fidelity",
  "placeholder",
]);

export type CopilotPatch = { from: string; to: string };

export type CopilotResult = {
  markdown: string;
  summaries: string[];
  usedAi: boolean;
  error: string | null;
  before: number;
  after: number;
  remaining: ValidationIssue[];
};

function looksLikeUnclosedTex(after: string): boolean {
  const t = after.trim();
  if (!t || t.length > 80) return false;
  if (/^\d+(\.\d+)?$/.test(t)) return false;
  if (/\b(the|and|for|with|from|this|that|notes|hello|world)\b/i.test(t)) return false;
  if (/[.!?]\s+[A-Z]/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 8) return false;
  return /[A-Za-z\\^_={}]/.test(t);
}

function stripEmoji(s: string): string {
  return s.replace(/\p{Extended_Pictographic}/gu, "").replace(/[ \t]+\n/g, "\n");
}

function dropEmptyContainers(s: string): string {
  return s
    .replace(/^:::[\w-]+[^\n]*\r?\n(?:[ \t]*\r?\n)*:::[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function closeOddMathDollars(source: string): string {
  const { text, restore } = protectRegions(source);
  const next = text.split("\n").map((line) => {
    const n = (line.match(/(?<!\\)\$/g) || []).length;
    if (n % 2 !== 1) return line;
    const last = line.lastIndexOf("$");
    if (last < 0) return line;
    const after = line.slice(last + 1);
    if (!looksLikeUnclosedTex(after)) return line;
    return `${line.slice(0, last + 1)}${after.trim()}$`;
  });
  return restore(next.join("\n"));
}

export function fixNotesLocal(
  source: string,
  issues: ValidationIssue[],
): { markdown: string; summaries: string[] } {
  const codes = new Set(issues.map((i) => i.code));
  let md = source;
  const summaries: string[] = [];

  if (codes.has("emoji") || /\p{Extended_Pictographic}/u.test(md)) {
    const next = stripEmoji(md);
    if (next !== md) {
      md = next;
      summaries.push("Removed emoji from the notes.");
    }
  }

  if (codes.has("dollar-math") || codes.has("fidelity") || collectOddDollarLines(md).length) {
    const closed = closeOddMathDollars(md);
    const repaired = repairMath(closed);
    if (repaired !== md) {
      md = repaired;
      summaries.push("Repaired math dollar delimiters.");
    }
  }

  if (codes.has("empty-box")) {
    const next = dropEmptyContainers(md);
    if (next !== md) {
      md = next;
      summaries.push("Dropped empty ::: containers.");
    }
  }

  return { markdown: md, summaries };
}

function coreWords(s: string): string {
  return s
    .replace(/[$`:_*\-={}[\]\\#~>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isSafePatch(from: string, to: string, source: string): boolean {
  if (!from || from === to) return false;
  if (from.length > 400 || to.length > 400) return false;
  if (!source.includes(from)) return false;
  const trial = source.replace(from, to);
  if (trial === source) return false;
  if (isFaithful(source, trial).ok) return true;
  const a = coreWords(from);
  const b = coreWords(to);
  if (!b) return true;
  if (a === b) return true;
  if (a.includes(b)) return true;
  return false;
}

export function applyPatches(
  source: string,
  patches: CopilotPatch[],
): { markdown: string; n: number } {
  let md = source;
  let n = 0;
  for (const p of patches.slice(0, 8)) {
    const from = String(p?.from ?? "");
    const to = String(p?.to ?? "");
    if (!isSafePatch(from, to, md)) continue;
    md = md.replace(from, to);
    n += 1;
  }
  return { markdown: md, n };
}

function compactIssues(issues: ValidationIssue[]): string {
  return issues
    .filter((i) => SOURCE_FIXABLE.has(i.code))
    .slice(0, 6)
    .map((i) => `${i.code}: ${i.message.slice(0, 100)}`)
    .join("\n");
}

function excerpts(source: string, issues: ValidationIssue[]): string {
  const lines = source.split("\n");
  const picked = new Set<number>();
  const addAround = (idx: number) => {
    for (let k = idx - 1; k <= idx + 1; k++) {
      if (k >= 0 && k < lines.length) picked.add(k);
    }
  };
  for (const issue of issues) {
    if (issue.code === "emoji") {
      lines.forEach((l, i) => {
        if (/\p{Extended_Pictographic}/u.test(l)) addAround(i);
      });
    }
    if (issue.code === "dollar-math") {
      lines.forEach((l, i) => {
        if ((l.match(/(?<!\\)\$/g) || []).length) addAround(i);
      });
    }
    const q = issue.message.match(/[“"](.+?)[”"]/);
    if (q) {
      const needle = q[1].slice(0, 40);
      lines.forEach((l, i) => {
        if (l.includes(needle)) addAround(i);
      });
    }
  }
  const idxs = [...picked].sort((a, b) => a - b).slice(0, 24);
  if (!idxs.length) return source.slice(0, 800);
  return idxs.map((i) => lines[i]).join("\n").slice(0, 1200);
}

async function askPatches(
  settings: LlmSettings,
  issues: ValidationIssue[],
  source: string,
): Promise<{ patches: CopilotPatch[]; error: string | null }> {
  const list = compactIssues(issues);
  if (!list) return { patches: [], error: null };
  const res = await llmChat({
    data: {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      messages: [
        { role: "system", content: "JSON only. Copy words from the notes. Do not add sentences." },
        {
          role: "user",
          content: `Fix notes so compile validation passes. Return JSON {"patches":[{"from":"...","to":"..."}]}. Only delimiter, emoji, empty-fence, or copy-existing-words patches.\n\nIssues:\n${list}\n\nExcerpts:\n${excerpts(source, issues)}`,
        },
      ],
    },
  });
  if (!res.ok) return { patches: [], error: res.error };
  const json = parseModelJson(res.text);
  if (!json || typeof json !== "object") return { patches: [], error: "The model did not return JSON." };
  const raw = (json as { patches?: unknown }).patches;
  if (!Array.isArray(raw)) return { patches: [], error: "The model did not return patches." };
  const patches: CopilotPatch[] = [];
  for (const p of raw.slice(0, 8)) {
    if (!p || typeof p !== "object") continue;
    const from = String((p as CopilotPatch).from ?? "");
    const to = String((p as CopilotPatch).to ?? "");
    if (from) patches.push({ from, to });
  }
  return { patches, error: null };
}

/**
 * Propose source edits that reduce validation errors.
 * Local heuristics always run. AI is a tiny BYOK JSON job (user key only).
 */
export async function proposeFidelityFix(
  source: string,
  issues: ValidationIssue[],
  theme: ThemeId,
  settings: LlmSettings | null,
  useAi: boolean,
): Promise<CopilotResult> {
  const before = issues.length;
  const local = fixNotesLocal(source, issues);
  let md = local.markdown;
  const summaries = [...local.summaries];
  let usedAi = false;
  let error: string | null = null;
  let remaining = compile(md, theme).issues;

  const wantAi = Boolean(
    useAi &&
      settings &&
      hasLlmKey(settings) &&
      remaining.some((i) => SOURCE_FIXABLE.has(i.code)),
  );
  if (wantAi && settings) {
    const asked = await askPatches(settings, remaining, md);
    if (asked.error) error = asked.error;
    if (asked.patches.length) {
      const applied = applyPatches(md, asked.patches);
      if (applied.n) {
        const nextIssues = compile(applied.markdown, theme).issues;
        if (nextIssues.length <= remaining.length) {
          md = applied.markdown;
          remaining = nextIssues;
          usedAi = true;
          summaries.push(`AI applied ${applied.n} small source patch${applied.n === 1 ? "" : "es"}.`);
        }
      }
    }
  }

  if (md !== source) {
    const now = compile(md, theme).issues;
    const orig = compile(source, theme).issues;
    if (now.length > orig.length) {
      return {
        markdown: source,
        summaries: [],
        usedAi: false,
        error: "No safe fix found.",
        before,
        after: before,
        remaining: orig,
      };
    }
    remaining = now;
  }

  if (md === source) {
    return {
      markdown: source,
      summaries: [],
      usedAi,
      error: error || (before ? "No automatic fix for these errors." : null),
      before,
      after: before,
      remaining: issues,
    };
  }

  return {
    markdown: md,
    summaries,
    usedAi,
    error,
    before,
    after: remaining.length,
    remaining,
  };
}
