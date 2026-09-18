import { protectRegions } from "./protect.ts";

const DISPLAY_ENV =
  /\\begin\{(align\*?|equation\*?|gather\*?|multline\*?|cases|matrix|pmatrix|bmatrix|vmatrix)\}[\s\S]*?\\end\{\1\}/g;

function wrapDisplayEnvs(text: string): string {
  return text.replace(DISPLAY_ENV, (m, _env, offset) => {
    const before = text.slice(Math.max(0, offset - 4), offset);
    const after = text.slice(offset + m.length, offset + m.length + 4);
    if (/\$\$\s*$/.test(before) || /^\s*\$\$/.test(after)) return m;
    if (/\\\[\s*$/.test(before) || /^\s*\\\]/.test(after)) return m;
    return `$$\n${m}\n$$`;
  });
}

function braceBareSubscripts(tex: string): string {
  return tex.replace(/([A-Za-z])_([A-Za-z]{2,})(?![A-Za-z0-9{])/g, "$1_{$2}");
}

function trimSpacedDollars(text: string): string {
  return text.replace(/(^|[^$\\])\$ ([^$\n]+?) \$(?!\$)/g, (full, pre, inner) => {
    const t = String(inner).trim();
    if (!/[A-Za-z\\^_=\u0370-\u03ff]/.test(t)) return full;
    return `${pre}$${t}$`;
  });
}

function repairInnerMath(text: string): string {
  let out = "";
  let i = 0;
  const s = text;
  while (i < s.length) {
    if (s[i] === "$" && s[i + 1] === "$") {
      const close = s.indexOf("$$", i + 2);
      if (close >= i + 2) {
        const inner = braceBareSubscripts(s.slice(i + 2, close).trim());
        out += `$$${inner}$$`;
        i = close + 2;
        continue;
      }
    }
    if (s[i] === "$" && s[i - 1] !== "\\") {
      const close = s.indexOf("$", i + 1);
      if (close > i + 1 && !s.slice(i + 1, close).includes("\n")) {
        const inner = s.slice(i + 1, close);
        out += `$${braceBareSubscripts(inner)}$`;
        i = close + 1;
        continue;
      }
    }
    out += s[i];
    i += 1;
  }
  return out;
}

/** Mechanical TeX delimiter / grouping fixes. Does not rewrite formulas. */
export function repairMath(source: string): string {
  const { text, restore } = protectRegions(source);
  let s = wrapDisplayEnvs(text);
  s = trimSpacedDollars(s);
  s = repairInnerMath(s);
  return restore(s);
}

/** Lines with an odd number of unescaped `$` — too ambiguous for local rules. */
export function collectOddDollarLines(source: string): string[] {
  const { text } = protectRegions(source);
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (line.includes("@@CODE") || line.includes("@@BOX")) continue;
    const n = (line.match(/(?<!\\)\$/g) || []).length;
    if (n % 2 === 1) {
      out.push(line.trim().slice(0, 140));
      if (out.length >= 6) break;
    }
  }
  return out;
}

