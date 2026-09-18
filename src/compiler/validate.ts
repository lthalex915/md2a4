import type { ThemeId } from "./ir.ts";
import { stripTags } from "./html.ts";
import { extractMath } from "./math.ts";

export type ValidationIssue = {
  code: string;
  message: string;
};

const PLACEHOLDERS = [
  "DOCUMENT TITLE",
  "Chapter Title",
  "Introduction / overview narrative",
  "T_{\\text{CPU}}",
  "HEADER LEFT FROM SOURCE",
  "HEADER RIGHT FROM SOURCE",
  "LEFT HEADER FROM SOURCE",
  "RIGHT HEADER FROM SOURCE",
  "CHAPTER N FROM SOURCE",
  "CHAPTER N",
  "SECTION TITLE OR CHAPTER NAME",
  "1-1",
];

const CHROME_EXACT = new Set([
  "untitled",
  "chapter",
  "example",
]);

function decode(text: string): string {
  const amp = "\u0026";
  return text
    .replace(new RegExp(`${amp}nbsp;`, "g"), " ")
    .replace(new RegExp(`${amp}amp;`, "g"), "&")
    .replace(new RegExp(`${amp}lt;`, "g"), "<")
    .replace(new RegExp(`${amp}gt;`, "g"), ">")
    .replace(new RegExp(`${amp}quot;`, "g"), '"')
    .replace(new RegExp(`${amp}#39;`, "g"), "'");
}

function normalizeWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
}

function extractTextNodes(html: string): string[] {
  const body = stripScripts(html);
  const nodes: string[] = [];
  const wrapped = `>${body}<`;
  const re = />([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wrapped))) {
    const t = normalizeWs(decode(m[1]));
    if (t) nodes.push(t);
  }
  return nodes;
}

function unwrapMath(text: string): string {
  return text
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1");
}

function sourceHaystack(source: string): string {
  const { text, slots } = extractMath(source);
  let h = text;
  slots.forEach((slot, i) => {
    h = h.replace(`@@MATH${i}@@`, slot.tex);
  });
  return normalizeWs(h);
}

function allowedInSource(text: string, source: string): boolean {
  const hay = sourceHaystack(source);
  const needle = normalizeWs(unwrapMath(text));
  if (!needle) return true;
  if (CHROME_EXACT.has(needle.toLowerCase())) return true;
  if (hay.includes(needle)) return true;
  const chapter = needle.replace(/^chapter\s+/i, "");
  if (chapter !== needle && hay.includes(chapter)) return true;
  // Parenthesized equation numbers: (4.1)
  const eq = needle.match(/^\((.+)\)$/);
  if (eq && hay.includes(eq[1])) return true;
  // Combined heading "4.1 Title" already in source as same string
  const compact = needle.replace(/\s+/g, "");
  if (compact && hay.replace(/\s+/g, "").includes(compact)) return true;
  return false;
}

function hasEmoji(text: string): boolean {
  return /\p{Extended_Pictographic}/u.test(text);
}

function hasForbiddenDollarMath(html: string): boolean {
  const body = stripTags(stripScripts(html));
  if (/\$\$/.test(body)) return true;
  const re = /\$([^$\n]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const inner = m[1];
    if (/^\s?\d/.test(inner)) continue;
    return true;
  }
  return false;
}

function mathJaxUsesOnlyParenBrackets(html: string): boolean {
  const m = html.match(/window\.MathJax\s*=\s*\{[\s\S]*?\};/);
  if (!m) return false;
  const cfg = m[0];
  if (cfg.includes("['$', '$']") || cfg.includes('["$","$"]')) return false;
  if (!cfg.includes("\\(") || !cfg.includes("\\[")) return false;
  return true;
}

function hasClass(html: string, cls: string): boolean {
  const re = new RegExp(`class=["'][^"']*\\b${cls}\\b`);
  return re.test(html);
}

function emptyBoxes(html: string): string[] {
  const bad: string[] = [];
  const classes = [
    "card-box",
    "equation-box",
    "sidebar-card",
    "chapter-prefix",
    "chapter-num",
    "page-header",
  ];
  for (const cls of classes) {
    const re = new RegExp(
      `<([a-z0-9]+)([^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>([\\s\\S]*?)</\\1>`,
      "gi",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const inner = normalizeWs(m[3].replace(/<[^>]+>/g, ""));
      if (!inner) bad.push(cls);
    }
  }
  return bad;
}

export function validate(source: string, html: string, theme: ThemeId): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!/^<!DOCTYPE html>/i.test(html.trim())) {
    issues.push({ code: "doctype", message: "Output is not a complete HTML document (missing doctype)." });
  }
  if (!/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    issues.push({ code: "shell", message: "Output is missing head or body." });
  }

  const visible = stripScripts(html);
  if (hasEmoji(visible)) {
    issues.push({ code: "emoji", message: "Generated document contains emoji." });
  }

  if (hasForbiddenDollarMath(html)) {
    issues.push({
      code: "dollar-math",
      message: "Output still contains $...$ or $$ math delimiters (currency is allowed).",
    });
  }

  if (!mathJaxUsesOnlyParenBrackets(html)) {
    issues.push({
      code: "mathjax-config",
      message: "MathJax config must use only \\( \\) and \\[ \\] delimiters.",
    });
  }

  if (theme === "classic") {
    for (const cls of ["page-grid", "sidebar-card", "running-footer", "folio"]) {
      if (hasClass(html, cls)) {
        issues.push({ code: "classic-forbid", message: `Classic theme must not emit .${cls}.` });
      }
    }
  }
  if (theme === "navy") {
    for (const cls of ["page-grid", "sidebar-card", "running-footer"]) {
      if (hasClass(html, cls)) {
        issues.push({ code: "navy-forbid", message: `Navy theme must not emit .${cls}.` });
      }
    }
  }

  for (const cls of emptyBoxes(html)) {
    issues.push({ code: "empty-box", message: `Empty decorative .${cls} was emitted.` });
  }

  const bodyOnly = stripScripts(html);
  for (const ph of PLACEHOLDERS) {
    if (bodyOnly.includes(ph) && !source.includes(ph)) {
      issues.push({
        code: "placeholder",
        message: `Skill-template placeholder leaked into output: ${ph}`,
      });
    }
  }

  for (const node of extractTextNodes(html)) {
    if (!allowedInSource(node, source)) {
      issues.push({
        code: "fidelity",
        message: `Text not found in source: “${node.slice(0, 80)}”`,
      });
    }
  }

  return issues;
}
