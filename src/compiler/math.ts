import { displayMath, escapeHtml, inlineMath } from "./html.ts";

export type MathSlot = {
  kind: "inline" | "display";
  tex: string;
  number: string | null;
  id: string | null;
};

const SLOT = (i: number) => `@@MATH${i}@@`;

function isDigit(ch: string | undefined): boolean {
  return ch != null && ch >= "0" && ch <= "9";
}

function isAsciiWord(ch: string | undefined): boolean {
  if (ch == null || ch.length !== 1) return false;
  const c = ch.charCodeAt(0);
  return (
    (c >= 48 && c <= 57) ||
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    c === 95
  );
}

function isEscaped(text: string, index: number): boolean {
  let n = 0;
  for (let k = index - 1; k >= 0 && text[k] === "\\"; k -= 1) n += 1;
  return n % 2 === 1;
}

function isWs(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/**
 * KaTeX / markdown-it-katex rules, plus: do not open after a word char
 * (`US$100`). `$` + digit may open only if a real closing `$` exists.
 */
function canOpenInlineDollar(text: string, i: number): boolean {
  if (text[i] !== "$" || text[i + 1] === "$") return false;
  if (isEscaped(text, i)) return false;
  if (isAsciiWord(text[i - 1])) return false;
  const next = text[i + 1];
  if (next == null || isWs(next)) return false;
  return true;
}

function canCloseInlineDollar(text: string, j: number): boolean {
  if (text[j] !== "$" || text[j + 1] === "$") return false;
  if (isEscaped(text, j)) return false;
  if (isWs(text[j - 1])) return false;
  if (isDigit(text[j + 1])) return false;
  return true;
}

function findClosingInlineDollar(text: string, open: number): number {
  let j = open + 1;
  while (j < text.length) {
    if (text[j] === "\n" || text[j] === "\r") return -1;
    if (text[j] === "$" && text[j + 1] === "$") return -1;
    if (text[j] === "$" && !isEscaped(text, j)) {
      if (canCloseInlineDollar(text, j)) {
        const inner = text.slice(open + 1, j);
        if (!inner.trim()) return -1;
        return j;
      }
      // `$100 … $E=mc^2$`: the second `$` starts a new formula, so the
      // first `$`+digit was currency, not an opening delimiter.
      if (j > open + 1 && canOpenInlineDollar(text, j)) return -1;
    }
    j += 1;
  }
  return -1;
}

/**
 * Unpaired `$100` / `$ 3.50` is currency.
 * Paired `$1$` / `$1 + 2$` is math even when TeX starts with a digit.
 */
export function isCurrencyDollar(text: string, index: number): boolean {
  if (text[index] !== "$") return false;
  if (isEscaped(text, index)) return false;
  let k = index + 1;
  if (text[k] === " ") k += 1;
  if (!isDigit(text[k])) return false;
  return findClosingInlineDollar(text, index) < 0;
}

function protectSegments(src: string): { text: string; restore: (s: string) => string } {
  const held: string[] = [];
  const stash = (m: string) => {
    const i = held.length;
    held.push(m);
    return `@@CODE${i}@@`;
  };
  let text = src.replace(/```[\s\S]*?```/g, stash);
  text = text.replace(/`[^`\n]+`/g, stash);
  return {
    text,
    restore: (s: string) => s.replace(/@@CODE(\d+)@@/g, (_, n) => held[Number(n)] ?? ""),
  };
}

function takeDisplaySuffix(
  text: string,
  end: number,
): { id: string | null; number: string | null; consumed: number } {
  let i = end;
  while (text[i] === " " || text[i] === "\t") i += 1;
  let id: string | null = null;
  let number: string | null = null;
  const idMatch = text.slice(i).match(/^\{#([A-Za-z][\w:-]*)\}/);
  if (idMatch) {
    id = idMatch[1];
    i += idMatch[0].length;
    while (text[i] === " " || text[i] === "\t") i += 1;
  }
  const numMatch = text.slice(i).match(/^\(([^)\n]+)\)/);
  if (numMatch) {
    number = numMatch[1].trim();
    i += numMatch[0].length;
  }
  if (!id && !number) return { id: null, number: null, consumed: end };
  return { id, number, consumed: i };
}

function pushDisplay(slots: MathSlot[], tex: string, number: string | null, id: string | null): string {
  const idx = slots.length;
  slots.push({ kind: "display", tex, number, id });
  return `\n\n${SLOT(idx)}\n\n`;
}

function pushInline(slots: MathSlot[], tex: string): string {
  const idx = slots.length;
  slots.push({ kind: "inline", tex, number: null, id: null });
  return SLOT(idx);
}

/**
 * Pull `$...$` / `$$...$$` / `\(...\)` / `\[...\]` out of Markdown
 * (skipping code and unpaired currency) so markdown-it never treats
 * underscores inside TeX as emphasis.
 */
export function extractMath(src: string): { text: string; slots: MathSlot[] } {
  const slots: MathSlot[] = [];

  let prepared = src.replace(
    /^```(?:math|latex|tex)[ \t]*\r?\n([\s\S]*?)^```/gm,
    (_, tex: string) => pushDisplay(slots, tex.trim(), null, null),
  );

  const { text: protectedText, restore } = protectSegments(prepared);

  let s = protectedText;
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "$" && s[i + 1] === "$" && !isEscaped(s, i)) {
      const close = s.indexOf("$$", i + 2);
      if (close >= i + 2) {
        const tex = s.slice(i + 2, close).trim();
        if (tex) {
          const suffix = takeDisplaySuffix(s, close + 2);
          out += pushDisplay(slots, tex, suffix.number, suffix.id);
          i = suffix.consumed;
          continue;
        }
      }
    }
    if (s[i] === "$" && canOpenInlineDollar(s, i)) {
      const close = findClosingInlineDollar(s, i);
      if (close > i + 1) {
        const tex = s.slice(i + 1, close);
        if (tex.trim()) {
          out += pushInline(slots, tex);
          i = close + 1;
          continue;
        }
      }
    }
    if (s[i] === "\\" && s[i + 1] === "[" && !isEscaped(s, i)) {
      const close = s.indexOf("\\]", i + 2);
      if (close > i + 2) {
        const tex = s.slice(i + 2, close).trim();
        if (tex) {
          out += pushDisplay(slots, tex, null, null);
          i = close + 2;
          continue;
        }
      }
    }
    if (s[i] === "\\" && s[i + 1] === "(" && !isEscaped(s, i)) {
      const close = s.indexOf("\\)", i + 2);
      if (close > i + 1) {
        const tex = s.slice(i + 2, close);
        if (tex.trim()) {
          out += pushInline(slots, tex);
          i = close + 2;
          continue;
        }
      }
    }
    out += s[i];
    i += 1;
  }

  return { text: restore(out), slots };
}

export function slotsToHtml(text: string, slots: MathSlot[]): string {
  let out = "";
  let last = 0;
  const re = /@@MATH(\d+)@@/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out += escapeHtml(text.slice(last, m.index));
    const slot = slots[Number(m[1])];
    if (slot) {
      out += slot.kind === "display" ? displayMath(slot.tex) : inlineMath(slot.tex);
    }
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

export function slotsToPlain(text: string, slots: MathSlot[]): string {
  return text.replace(/@@MATH(\d+)@@/g, (_, n) => slots[Number(n)]?.tex ?? "");
}

export function slotToken(index: number): string {
  return SLOT(index);
}

export function parseSlotToken(text: string): number | null {
  const m = text.trim().match(/^@@MATH(\d+)@@$/);
  return m ? Number(m[1]) : null;
}

export const SLOT_RE = /@@MATH(\d+)@@/g;
