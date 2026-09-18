import { displayMath, escapeHtml } from "./html.ts";
import type { Block, IR } from "./ir.ts";

type Slice = { main: Block[]; asides: Extract<Block, { type: "aside" }>[] };

function startNewSlice(slices: Slice[]): Slice {
  const last = slices[slices.length - 1];
  if (last && last.main.length === 0 && last.asides.length === 0) return last;
  const next: Slice = { main: [], asides: [] };
  slices.push(next);
  return next;
}

function groupSlices(blocks: Block[]): Slice[] {
  const slices: Slice[] = [{ main: [], asides: [] }];
  let current = slices[0];
  const pending = new Map<string, Extract<Block, { type: "aside" }>[]>();

  function sliceForId(id: string): Slice | null {
    for (const s of slices) {
      for (const b of s.main) {
        if ((b.type === "section" || b.type === "subsection") && b.id === id) return s;
        if (b.type === "equation" && b.id === id) return s;
        if (b.type === "example" && (b.title === id || b.name === id)) return s;
      }
    }
    return null;
  }

  for (const b of blocks) {
    if (b.type === "aside") {
      if (b.anchor) {
        const target = sliceForId(b.anchor);
        if (target) target.asides.push(b);
        else {
          const list = pending.get(b.anchor) ?? [];
          list.push(b);
          pending.set(b.anchor, list);
        }
      } else {
        current.asides.push(b);
      }
      continue;
    }
    if (
      b.type === "section" ||
      b.type === "subsection" ||
      b.type === "example" ||
      b.type === "equation"
    ) {
      current = startNewSlice(slices);
      current.main.push(b);
      const id =
        b.type === "section" || b.type === "subsection"
          ? b.id
          : b.type === "equation"
            ? b.id
            : null;
      if (id && pending.has(id)) {
        current.asides.push(...(pending.get(id) ?? []));
        pending.delete(id);
      }
      continue;
    }
    current.main.push(b);
  }

  for (const leftover of pending.values()) {
    slices[slices.length - 1].asides.push(...leftover);
  }

  return slices.filter((s) => s.main.length || s.asides.length);
}

function listHtml(b: Extract<Block, { type: "list" }>): string {
  const cls = b.steps ? ` class="steps"` : "";
  const tag = b.ordered ? "ol" : "ul";
  const title = b.title ? `<p><strong>${b.title}</strong></p>` : "";
  const items = b.items.map((it) => `<li>${it}</li>`).join("\n");
  return `${title}<${tag}${cls}>${items}</${tag}>`;
}

function termsHtml(b: Extract<Block, { type: "terms" }>): string {
  const title = b.title ? `<p><strong>${b.title}</strong></p>` : "";
  const rows = b.items
    .map((it) => `<p><strong>${escapeHtml(it.name)}.</strong> ${it.def}</p>`)
    .join("\n");
  return `${title}${rows}`;
}

function tableHtml(b: Extract<Block, { type: "table" }>): string {
  const cap = b.caption ? `<caption>${b.caption}</caption>` : "";
  const head = b.headers.length
    ? `<thead><tr>${b.headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`
    : "";
  const body = `<tbody>${b.rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table>${cap}${head}${body}</table>`;
}

function codeInExample(text: string): string {
  if (!text.includes("\n")) {
    return `<div class="code-line">${escapeHtml(text)}</div>`;
  }
  return `<pre><code>${escapeHtml(text)}</code></pre>`;
}

function exampleHtml(b: Extract<Block, { type: "example" }>): string {
  const headerFinal =
    b.title && b.name
      ? `<div class="example-header">${b.title}<span class="title">${b.name}</span></div>`
      : b.title || b.name
        ? `<div class="example-header">${(b.title || b.name) as string}</div>`
        : "";
  const inner = b.blocks
    .map((child) => {
      if (child.type === "code") return codeInExample(child.text);
      return renderMainBlock(child);
    })
    .filter(Boolean)
    .join("\n");
  if (!headerFinal && !inner) return "";
  return `<div class="example-box">${headerFinal}<div class="example-body">${inner}</div></div>`;
}

function equationHtml(b: Extract<Block, { type: "equation" }>): string {
  if (!b.tex.trim()) return "";
  const num = b.number ? `<span class="eq-num">(${escapeHtml(b.number)})</span>` : "";
  return `<div class="equation-row"><div class="equation-body">${displayMath(b.tex)}</div>${num}</div>`;
}

function sidebarCard(b: Extract<Block, { type: "aside" }>): string {
  const h = b.title ? `<h3>${b.title}</h3>` : "";
  let body = "";
  if (b.items?.length) {
    body = `<ul>${b.items.map((it) => `<li>${it}</li>`).join("")}</ul>`;
  } else if (b.html) {
    body = `<p>${b.html}</p>`;
  } else if (b.text) {
    body = `<p>${escapeHtml(b.text)}</p>`;
  }
  if (!h && !body) return "";
  return `<div class="sidebar-card">${h}${body}</div>`;
}

function renderMainBlock(b: Block): string {
  switch (b.type) {
    case "section":
      return `<div class="section-banner">${b.number ? `<span class="sec-num">${escapeHtml(b.number)}</span>` : ""}${b.html}</div>`;
    case "subsection":
      return `<h2 class="subsection">${b.number ? `<span class="num">${escapeHtml(b.number)}</span>` : ""}${b.html}</h2>`;
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
      return sidebarCard(b);
    default:
      return "";
  }
}

export function renderPalatinoBody(ir: IR): string {
  const parts: string[] = [];
  if (ir.header_left || ir.header_right) {
    parts.push(
      `<header class="running-header"><span>${escapeHtml(ir.header_left || "")}</span><span>${escapeHtml(ir.header_right || "")}</span></header>`,
    );
  }
  if (ir.chapter) {
    parts.push(`<div class="chapter-num">CHAPTER ${escapeHtml(ir.chapter)}</div>`);
  }
  if (ir.title) {
    parts.push(`<h1 class="chapter-title">${escapeHtml(ir.title)}</h1>`);
  }

  const slices = groupSlices(ir.blocks);
  const hasAnyAside = slices.some((s) => s.asides.length > 0);

  if (!hasAnyAside) {
    const main = ir.blocks.map(renderMainBlock).filter(Boolean).join("\n");
    parts.push(`<main class="main-col">${main}</main>`);
  } else {
    for (const slice of slices) {
      const mainHtml = slice.main.map(renderMainBlock).filter(Boolean).join("\n");
      if (slice.asides.length) {
        const cards = slice.asides.map(sidebarCard).filter(Boolean).join("\n");
        parts.push(
          `<div class="page-grid"><main class="main-col">${mainHtml}</main><aside class="side-col">${cards}</aside></div>`,
        );
      } else {
        parts.push(`<main class="main-col">${mainHtml}</main>`);
      }
    }
  }

  if (ir.footer_left || ir.folio) {
    const left = ir.footer_left ? `<span>${escapeHtml(ir.footer_left)}</span>` : "<span></span>";
    const folio = ir.folio ? `<span class="folio">${escapeHtml(ir.folio)}</span>` : "<span></span>";
    parts.push(`<footer class="running-footer">${left}${folio}</footer>`);
  }

  return parts.join("\n");
}
