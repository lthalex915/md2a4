import { protectRegions } from "./protect.ts";

const ASIDE_TITLE = /^(key points?|takeaways?|remember|notes)\s*$/i;
const EXAMPLE_TITLE = /^(example(?:\s+\d+)?(?:\s*[:.—–-]\s*.+)?)$/i;

function unwrapBold(line: string): string {
  const t = line.trim();
  const m = t.match(/^(?:\*\*|__)(.+?)(?:\*\*|__)$/);
  return (m ? m[1] : t).trim();
}

function isBoldOnly(line: string): boolean {
  return /^(?:\*\*|__)(.+?)(?:\*\*|__)$/.test(line.trim());
}

function isListLine(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line);
}

function isTermLine(line: string): boolean {
  const t = line.trim();
  if (!t || isListLine(t)) return false;
  // **Voltage.** def  |  **Voltage:** def  |  **Voltage**. def
  if (/^\*\*[^*]{1,80}?[.:]\*\*\s+\S/.test(t)) return true;
  if (/^\*\*[^*]{1,80}?\*\*\s*[.:—–-]\s+\S/.test(t)) return true;
  if (/^__[^_]{1,80}?[.:]__\s+\S/.test(t)) return true;
  return false;
}

function isDisplayOpen(line: string): boolean {
  return /^\s*\$\$/.test(line) || /^\s*\\\[/.test(line);
}

function collectBlock(lines: string[], start: number, pred: (ln: string) => boolean): number {
  let i = start;
  while (i < lines.length && pred(lines[i])) i += 1;
  return i;
}

function attrTitle(title: string): string {
  const t = title.replace(/"/g, "'").trim();
  return t;
}

function slugAnchor(text: string): string {
  const x = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-");
  return x || "section";
}

function lastHeadingId(lines: string[], before: number): string | null {
  for (let i = before - 1; i >= 0; i -= 1) {
    const m = lines[i].match(/^#{1,3}\s+(?:.*?)\s*\{#([A-Za-z][\w:-]*)\}\s*$/);
    if (m) return m[1];
    const h = lines[i].match(/^#{1,3}\s+(.+)$/);
    if (h) return slugAnchor(h[1].replace(/\{#[^}]+\}/, ""));
  }
  return null;
}

/**
 * Wrap blocks that are already titled in the notes.
 * Does not invent cards for bare lists.
 */
export function proposeStructure(source: string): string {
  const { text, restore } = protectRegions(source);
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const nextNonEmpty = (() => {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j += 1;
      return j;
    })();

    if (ASIDE_TITLE.test(unwrapBold(line)) && nextNonEmpty < lines.length && isListLine(lines[nextNonEmpty])) {
      const title = unwrapBold(line);
      const listStart = nextNonEmpty;
      const listEnd = collectBlock(lines, listStart, (ln) => isListLine(ln) || ln.trim() === "");
      const items = lines.slice(listStart, listEnd).filter((ln) => isListLine(ln));
      if (items.length) {
        const anchor = lastHeadingId(lines, i);
        const anchorAttr = anchor ? ` anchor=${anchor}` : "";
        out.push(`:::aside${anchorAttr} kind=takeaway title="${attrTitle(title)}"`);
        out.push(...items);
        out.push(":::");
        i = listEnd;
        continue;
      }
    }

    if (isBoldOnly(line) && nextNonEmpty < lines.length && isListLine(lines[nextNonEmpty])) {
      const title = unwrapBold(line);
      const listStart = nextNonEmpty;
      const listEnd = collectBlock(lines, listStart, (ln) => isListLine(ln) || ln.trim() === "");
      const items = lines.slice(listStart, listEnd).filter((ln) => isListLine(ln));
      if (items.length) {
        out.push(`:::list title="${attrTitle(title)}"`);
        out.push(...items);
        out.push(":::");
        i = listEnd;
        continue;
      }
    }

    if (isTermLine(line)) {
      const end = collectBlock(lines, i, (ln) => isTermLine(ln) || ln.trim() === "");
      const items = lines.slice(i, end).filter(isTermLine);
      if (items.length >= 2) {
        out.push(":::terms");
        out.push(...items);
        out.push(":::");
        i = end;
        continue;
      }
    }

    const examplePlain = unwrapBold(line);
    if (
      EXAMPLE_TITLE.test(examplePlain) &&
      nextNonEmpty < lines.length &&
      !lines[nextNonEmpty].startsWith("#")
    ) {
      const title = examplePlain;
      let end = nextNonEmpty;
      while (
        end < lines.length &&
        lines[end].trim() !== "" &&
        !lines[end].startsWith("#") &&
        !lines[end].startsWith(":::")
      ) {
        end += 1;
      }
      if (end > nextNonEmpty) {
        out.push(`:::example title="${attrTitle(title)}"`);
        if (i + 1 < nextNonEmpty) out.push("");
        out.push(...lines.slice(nextNonEmpty, end));
        out.push(":::");
        i = end;
        continue;
      }
    }

    if (
      isBoldOnly(line) &&
      nextNonEmpty < lines.length &&
      isDisplayOpen(lines[nextNonEmpty])
    ) {
      const name = unwrapBold(line);
      if (/^[A-Za-z]/.test(name) && !isListLine(line)) {
        let end = nextNonEmpty + 1;
        if (lines[nextNonEmpty].trim() === "$$" || lines[nextNonEmpty].trim() === "\\[") {
          while (end < lines.length && lines[end].trim() !== "$$" && lines[end].trim() !== "\\]") {
            end += 1;
          }
          if (end < lines.length) end += 1;
        }
        const body = lines.slice(nextNonEmpty, end).join("\n");
        const tex = body
          .replace(/^\$\$/, "")
          .replace(/\$\$$/, "")
          .replace(/^\\\[/, "")
          .replace(/\\\]$/, "")
          .trim();
        if (tex) {
          out.push(`:::equation name="${attrTitle(name)}"`);
          out.push(tex);
          out.push(":::");
          i = end;
          continue;
        }
      }
    }

    out.push(line);
    i += 1;
  }
  return restore(out.join("\n"));
}

export type StructureHint = "list" | "aside" | "skip";

export type StructureCandidate = { title: string };

function nextFilled(lines: string[], from: number): number {
  let j = from;
  while (j < lines.length && lines[j].trim() === "") j += 1;
  return j;
}

/** Short titles in front of lists that heuristics did not wrap (not bold, not Key Points). */
export function collectStructureCandidates(source: string): StructureCandidate[] {
  const { text } = protectRegions(source);
  const lines = text.split("\n");
  const found: StructureCandidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes("@@BOX") || lines[i].includes("@@CODE")) continue;
    const j = nextFilled(lines, i + 1);
    if (j >= lines.length || !isListLine(lines[j])) continue;
    if (isBoldOnly(lines[i])) continue;
    const title = unwrapBold(lines[i]);
    if (!title || title.startsWith("#") || title.startsWith(":::")) continue;
    if (ASIDE_TITLE.test(title)) continue;
    const words = title.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 8) continue;
    if (/[.!?]$/.test(title) && words.length > 3) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ title });
  }
  return found;
}

export function applyStructureHints(
  source: string,
  hints: Record<string, StructureHint>,
): string {
  const map = new Map(Object.entries(hints).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const { text, restore } = protectRegions(source);
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const j = nextFilled(lines, i + 1);
    const title = unwrapBold(lines[i]);
    const hint = map.get(title.toLowerCase());
    if (hint && hint !== "skip" && j < lines.length && isListLine(lines[j]) && !isBoldOnly(lines[i])) {
      const listEnd = collectBlock(lines, j, (ln) => isListLine(ln) || ln.trim() === "");
      const items = lines.slice(j, listEnd).filter((ln) => isListLine(ln));
      if (items.length) {
        if (hint === "aside") {
          const anchor = lastHeadingId(lines, i);
          const anchorAttr = anchor ? ` anchor=${anchor}` : "";
          out.push(`:::aside${anchorAttr} kind=takeaway title="${attrTitle(title)}"`);
        } else {
          out.push(`:::list title="${attrTitle(title)}"`);
        }
        out.push(...items);
        out.push(":::");
        i = listEnd;
        continue;
      }
    }
    out.push(lines[i]);
    i += 1;
  }
  return restore(out.join("\n"));
}

