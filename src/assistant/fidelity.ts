import { extractFrontMatter } from "../compiler/parse.ts";

function stripMarkup(text: string): string {
  return text
    .replace(/^---[\s\S]*?---\s*/, "")
    .replace(/^:::[\w-]+[^\n]*$/gm, "")
    .replace(/^:::$/gm, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]+\$/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/\\\([\s\S]*?\\\)/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\{#[^}]+\}/g, "")
    .replace(/\*\*/g, "")
    .replace(/__|\*|\_/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "");
}

export function proseHaystack(source: string): string {
  return stripMarkup(source).replace(/\s+/g, " ").trim().toLowerCase();
}

function yamlValues(source: string): string[] {
  const { fm } = extractFrontMatter(source);
  return Object.values(fm)
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

/**
 * True when proposed Markdown does not add new prose.
 * Fences, YAML keys, and delimiter changes are allowed.
 */
export function isFaithful(source: string, proposed: string): { ok: boolean; reason?: string } {
  const hay = proseHaystack(source);
  const proposedProse = proseHaystack(proposed);
  if (!proposedProse) return { ok: true };
  // Every window of proposed words should appear in the source haystack.
  const words = proposedProse.split(" ").filter(Boolean);
  const window = 6;
  for (let i = 0; i < words.length; i += window) {
    const chunk = words.slice(i, i + window).join(" ");
    if (chunk.length < 8) continue;
    if (!hay.includes(chunk)) {
      return { ok: false, reason: `New wording not in source: “${chunk.slice(0, 80)}”` };
    }
  }
  for (const value of yamlValues(proposed)) {
    const needle = value.toLowerCase();
    if (needle === "classic" || needle === "navy" || needle === "palatino") continue;
    if (needle.length <= 2) continue;
    if (!hay.includes(needle) && !source.toLowerCase().includes(needle)) {
      return { ok: false, reason: `YAML value not in source: “${value}”` };
    }
  }
  return { ok: true };
}
