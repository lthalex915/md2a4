import { displayMath, escapeHtml } from "./html.ts";
import type { Block, IR } from "./ir.ts";

function listHtml(b: Extract<Block, { type: "list" }>): string {
  const tag = b.ordered ? "ol" : "ul";
  const items = b.items.map((it) => `<li>${it}</li>`).join("\n");
  const title = b.title ? `<p><strong>${b.title}</strong></p>\n` : "";
  return `${title}<${tag}>\n${items}\n</${tag}>`;
}

function termsHtml(b: Extract<Block, { type: "terms" }>): string {
  const title = b.title ? `<p><strong>${b.title}</strong></p>\n` : "";
  const rows = b.items
    .map(
      (it) =>
        `<dt>${escapeHtml(it.name)}</dt>\n<dd>${it.def}</dd>`,
    )
    .join("\n");
  return `${title}<dl class="terms">\n${rows}\n</dl>`;
}

function tableHtml(b: Extract<Block, { type: "table" }>): string {
  const cap = b.caption ? `<caption>${b.caption}</caption>` : "";
  const head = b.headers.length
    ? `<thead><tr>${b.headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`
    : "";
  const body = `<tbody>${b.rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table class="keep-together">${cap}${head}${body}</table>`;
}

function asideHtml(b: Extract<Block, { type: "aside" }>): string {
  const title = b.title ? `<strong>${b.title}</strong> ` : "";
  if (b.items?.length) {
    return `<div class="note">${title}<ul>${b.items.map((it) => `<li>${it}</li>`).join("")}</ul></div>`;
  }
  return `<div class="note">${title}${b.html || escapeHtml(b.text || "")}</div>`;
}

function exampleHtml(b: Extract<Block, { type: "example" }>): string {
  const label = [b.title, b.name].filter(Boolean).join(" — ");
  const head = label ? `<div class="example-title">${label}</div>` : "";
  const body = b.blocks.map(renderBlock).filter(Boolean).join("\n");
  if (!head && !body) return "";
  return `<div class="example-box keep-together">${head}${body}</div>`;
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case "section":
      return `<h2 class="section">${b.number ? `${escapeHtml(b.number)} ` : ""}${b.html}</h2>`;
    case "subsection":
      return `<h3 class="subsection">${b.number ? `${escapeHtml(b.number)} ` : ""}${b.html}</h3>`;
    case "para":
      return `<p>${b.html}</p>`;
    case "list":
      return listHtml(b);
    case "terms":
      return termsHtml(b);
    case "example":
      return exampleHtml(b);
    case "code":
      return `<pre><code>${escapeHtml(b.text)}</code></pre>`;
    case "equation":
      if (!b.tex.trim()) return "";
      return `<div class="math-block">${displayMath(b.tex)}</div>`;
    case "table":
      return tableHtml(b);
    case "note":
      return `<div class="note">${b.html}</div>`;
    case "aside":
      return asideHtml(b);
    default:
      return "";
  }
}

export function renderClassicBody(ir: IR): string {
  const parts: string[] = [];
  if (ir.chapter) {
    parts.push(`<p class="chapter-line">${escapeHtml(ir.chapter)}</p>`);
  }
  if (ir.title) {
    parts.push(`<h1 class="doc-title">${escapeHtml(ir.title)}</h1>`);
  }
  for (const b of ir.blocks) {
    const html = renderBlock(b);
    if (html) parts.push(html);
  }
  return parts.join("\n");
}
