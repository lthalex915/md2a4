import { displayMath, escapeHtml } from "./html.ts";
import type { Block, IR } from "./ir.ts";

function listHtml(b: Extract<Block, { type: "list" }>): string {
  const tag = b.ordered ? "ol" : "ul";
  const items = b.items.map((it) => `<li>${it}</li>`).join("\n");
  if (b.title) {
    const cls = b.ordered ? "" : ` class="box-list"`;
    return `<div class="card-box"><div class="card-box-title">${b.title}</div><${tag}${cls}>${items}</${tag}></div>`;
  }
  return `<${tag}>\n${items}\n</${tag}>`;
}

function termsHtml(b: Extract<Block, { type: "terms" }>): string {
  const title = b.title ? `<div class="card-box-title">${b.title}</div>` : "";
  const items = b.items
    .map(
      (it) =>
        `<div class="key-term-item"><span class="term-name">${escapeHtml(it.name)}.</span> ${it.def}</div>`,
    )
    .join("\n");
  return `<div class="card-box">${title}${items}</div>`;
}

function tableHtml(b: Extract<Block, { type: "table" }>): string {
  const cap = b.caption
    ? `<div class="caption">${b.caption}</div>`
    : "";
  const head = b.headers.length
    ? `<thead><tr>${b.headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`
    : "";
  const body = `<tbody>${b.rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `${cap}<table class="data-table">${head}${body}</table>`;
}

function asideHtml(b: Extract<Block, { type: "aside" }>): string {
  const title = b.title ? `<strong>${b.title}</strong> ` : "";
  if (b.items?.length) {
    return `<div class="note">${title}<ul class="box-list">${b.items.map((it) => `<li>${it}</li>`).join("")}</ul></div>`;
  }
  return `<div class="note">${title}${b.html || escapeHtml(b.text || "")}</div>`;
}

function exampleHtml(b: Extract<Block, { type: "example" }>): string {
  const label = [b.title, b.name].filter(Boolean).join(" — ");
  const title = label ? `<div class="card-box-title">${label}</div>` : "";
  const body = b.blocks.map(renderBlock).filter(Boolean).join("\n");
  if (!title && !body) return "";
  return `<div class="card-box keep-together">${title}${body}</div>`;
}

function equationHtml(b: Extract<Block, { type: "equation" }>): string {
  if (!b.tex.trim()) return "";
  const name = b.name ? `<div>${b.name}</div>` : "";
  const math = `<div${name ? ` style="font-size: 11pt; margin-top: 4px;"` : ""}>${displayMath(b.tex)}</div>`;
  return `<div class="equation-box">${name}${math}</div>`;
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case "section":
      return `<div class="section-title">${b.number ? `<span>${escapeHtml(b.number)}</span>` : ""}<span>${b.html}</span></div>`;
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
      return equationHtml(b);
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

export function renderNavyBody(ir: IR): string {
  const parts: string[] = [];
  if (ir.header_left || ir.header_right) {
    parts.push(
      `<div class="page-header"><span>${escapeHtml(ir.header_left || "")}</span><span>${escapeHtml(ir.header_right || "")}</span></div>`,
    );
  }
  if (ir.chapter) {
    parts.push(`<div class="chapter-prefix">CHAPTER ${escapeHtml(ir.chapter)}</div>`);
  }
  if (ir.title) {
    parts.push(`<h1 class="chapter-title">${escapeHtml(ir.title)}</h1>`);
    parts.push(`<div class="title-divider"></div>`);
  }
  for (const b of ir.blocks) {
    const html = renderBlock(b);
    if (html) parts.push(html);
  }
  return parts.join("\n");
}
