import * as MarkdownItNs from "markdown-it";
import * as markdownItContainerNs from "markdown-it-container";
import * as yamlNs from "js-yaml";
import {
  escapeHtml,
  nullIfEmpty,
  safeHref,
  slugify,
  stripTags,
  escapeAttr,
} from "./html.ts";
import { emptyIR, isThemeId, type Block, type IR, type ThemeId, type TermItem } from "./ir.ts";
import {
  extractMath,
  parseSlotToken,
  slotsToHtml,
  slotsToPlain,
  type MathSlot,
} from "./math.ts";

type MdToken = {
  type: string;
  tag: string;
  content: string;
  info: string;
  markup: string;
  children: MdToken[] | null;
  attrGet?: (name: string) => string | null;
};

function interopDefault<T>(mod: unknown): T {
  if (mod && typeof mod === "object" && "default" in (mod as object)) {
    const d = (mod as { default: unknown }).default;
    if (d) return d as T;
  }
  return mod as T;
}

type MarkdownItInstance = {
  use: (plugin: unknown, ...args: unknown[]) => MarkdownItInstance;
  parse: (src: string, env: object) => unknown[];
};

type MarkdownItClass = new (opts?: {
  html?: boolean;
  breaks?: boolean;
  linkify?: boolean;
  typographer?: boolean;
}) => MarkdownItInstance;

function mdCtor(): MarkdownItClass {
  return interopDefault<MarkdownItClass>(MarkdownItNs);
}

function yamlLoad(src: string): unknown {
  const yaml = interopDefault<{ load: (s: string) => unknown }>(yamlNs);
  return yaml.load(src);
}

const CONTAINERS = ["list", "terms", "example", "aside", "note", "equation", "steps"] as const;

function makeMd(): MarkdownItInstance {
  const Ctor = mdCtor();
  const md = new Ctor({
    html: false,
    breaks: false,
    linkify: false,
    typographer: false,
  });
  const containerPlugin = interopDefault<(md: unknown, name: string, opts: unknown) => void>(
    markdownItContainerNs,
  );
  for (const name of CONTAINERS) {
    md.use(containerPlugin, name, {
      validate: (params: string) => {
        const p = params.trim();
        return p === name || p.startsWith(`${name} `) || p.startsWith(`${name}\t`);
      },
      render: () => "",
    });
  }
  return md;
}

const md = makeMd();

export function extractFrontMatter(src: string): {
  fm: Record<string, unknown>;
  body: string;
} {
  const re = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;
  const m = src.match(re);
  if (!m) return { fm: {}, body: src };
  try {
    const parsed = yamlLoad(m[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { fm: parsed as Record<string, unknown>, body: src.slice(m[0].length) };
    }
  } catch {
    // treat as body if YAML is invalid
  }
  return { fm: {}, body: src };
}

function parseAttrs(info: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const s = info.replace(/^\S+\s*/, "");
  const re = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

function parseHeadingMeta(raw: string): { id: string | null; text: string } {
  const m = raw.match(/^(.*?)\s*\{#([A-Za-z][\w:-]*)\}\s*$/);
  if (m) return { id: m[2], text: m[1].trim() };
  return { id: null, text: raw.trim() };
}

function parseNumberedTitle(text: string): { number: string | null; title: string } {
  const m = text.match(/^((?:\d+\.)*\d+)\s+(.*)$/);
  if (m) return { number: m[1], title: m[2].trim() };
  return { number: null, title: text };
}

function renderTextWithMath(content: string, slots: MathSlot[]): string {
  return slotsToHtml(content, slots);
}

function renderInline(children: MdToken[] | null, slots: MathSlot[]): string {
  if (!children) return "";
  let html = "";
  for (const t of children) {
    switch (t.type) {
      case "text":
        html += renderTextWithMath(t.content, slots);
        break;
      case "softbreak":
        html += " ";
        break;
      case "hardbreak":
        html += "<br>\n";
        break;
      case "code_inline":
        html += `<code>${escapeHtml(t.content)}</code>`;
        break;
      case "strong_open":
        html += "<strong>";
        break;
      case "strong_close":
        html += "</strong>";
        break;
      case "em_open":
        html += "<em>";
        break;
      case "em_close":
        html += "</em>";
        break;
      case "s_open":
        html += "<del>";
        break;
      case "s_close":
        html += "</del>";
        break;
      case "link_open": {
        const href = t.attrGet?.("href") || "";
        html += `<a href="${escapeAttr(safeHref(href))}">`;
        break;
      }
      case "link_close":
        html += "</a>";
        break;
      case "image": {
        const src = t.attrGet?.("src") || "";
        const alt = t.content || t.attrGet?.("alt") || "";
        html += `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`;
        break;
      }
      default:
        if (t.children) html += renderInline(t.children, slots);
        else if (t.content) html += renderTextWithMath(t.content, slots);
    }
  }
  return html;
}

function findClose(tokens: MdToken[], start: number, closeType: string): number {
  const openType = tokens[start].type;
  let depth = 1;
  for (let i = start + 1; i < tokens.length; i++) {
    if (tokens[i].type === openType) depth += 1;
    else if (tokens[i].type === closeType) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return tokens.length - 1;
}

function collectList(
  tokens: MdToken[],
  i: number,
  slots: MathSlot[],
): { items: string[]; end: number } {
  const closeType =
    tokens[i].type === "bullet_list_open" ? "bullet_list_close" : "ordered_list_close";
  const end = findClose(tokens, i, closeType);
  const items: string[] = [];
  for (let j = i + 1; j < end; j++) {
    if (tokens[j].type !== "list_item_open") continue;
    const itemEnd = findClose(tokens, j, "list_item_close");
    const parts: string[] = [];
    for (let k = j + 1; k < itemEnd; k++) {
      if (tokens[k].type === "inline") {
        parts.push(renderInline(tokens[k].children, slots));
      } else if (tokens[k].type === "bullet_list_open" || tokens[k].type === "ordered_list_open") {
        const nested = collectList(tokens, k, slots);
        const tag = tokens[k].type === "ordered_list_open" ? "ol" : "ul";
        parts.push(
          `<${tag}>${nested.items.map((it) => `<li>${it}</li>`).join("")}</${tag}>`,
        );
        k = nested.end - 1;
      }
    }
    items.push(parts.join(" ").trim());
    j = itemEnd;
  }
  return { items, end: end + 1 };
}

function collectTable(
  tokens: MdToken[],
  i: number,
  slots: MathSlot[],
): { headers: string[]; rows: string[][]; end: number } {
  const end = findClose(tokens, i, "table_close");
  const headers: string[] = [];
  const rows: string[][] = [];
  let inHead = false;
  let current: string[] | null = null;
  for (let j = i + 1; j < end; j++) {
    const t = tokens[j];
    if (t.type === "thead_open") inHead = true;
    else if (t.type === "thead_close") inHead = false;
    else if (t.type === "tr_open") current = [];
    else if (t.type === "tr_close") {
      if (current) {
        if (inHead) headers.push(...current);
        else rows.push(current);
      }
      current = null;
    } else if (t.type === "inline" && current) {
      current.push(renderInline(t.children, slots));
    }
  }
  return { headers, rows, end: end + 1 };
}

function isBoldOnly(html: string, text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const stripped = html.replace(/<\/?strong>/g, "").trim();
  return stripped === escapeHtml(t) && /<\/?strong>/.test(html);
}

function looksLikeCaption(text: string): boolean {
  return /^(table|figure|fig\.?)\s*\d/i.test(text.trim());
}

function parseTermFromHtml(html: string): TermItem | null {
  const m = html.match(/^<strong>(.*?)<\/strong>\s*(.*)$/i);
  if (m) {
    const name = stripTags(m[1]).replace(/\.$/, "").trim();
    const def = m[2].trim();
    if (!name) return null;
    return { name, def: def || "" };
  }
  const text = stripTags(html).trim();
  const colon = text.match(/^([^.:]{1,80})[.:]\s+([\s\S]+)$/);
  if (colon) return { name: colon[1].trim(), def: colon[2].trim() };
  return null;
}

function flattenItems(inner: Block[]): string[] {
  const items: string[] = [];
  for (const b of inner) {
    if (b.type === "list") items.push(...b.items);
    else if (b.type === "para") items.push(b.html);
  }
  return items.filter((x) => stripTags(x).trim());
}

function innerPlain(inner: Block[]): { html: string; text: string } {
  const html = inner
    .map((b) => {
      if (b.type === "para") return b.html;
      if (b.type === "note") return b.html;
      return "";
    })
    .filter(Boolean)
    .join(" ");
  return { html, text: stripTags(html).trim() };
}

function containerToBlock(
  name: string,
  attrs: Record<string, string>,
  inner: Block[],
  slots: MathSlot[],
): Block | null {
  if (name === "list" || name === "steps") {
    const items = flattenItems(inner);
    if (!items.length) return null;
    return {
      type: "list",
      ordered: name === "steps" || attrs.ordered === "true",
      title: attrHtml(attrs.title, slots),
      items,
      steps: name === "steps",
    };
  }
  if (name === "terms") {
    const items: TermItem[] = [];
    for (const b of inner) {
      if (b.type === "para") {
        const term = parseTermFromHtml(b.html);
        if (term) items.push(term);
      } else if (b.type === "list") {
        for (const it of b.items) {
          const term = parseTermFromHtml(it);
          if (term) items.push(term);
        }
      }
    }
    if (!items.length) return null;
    return { type: "terms", title: attrHtml(attrs.title, slots), items };
  }
  if (name === "example") {
    return {
      type: "example",
      title: attrHtml(attrs.title, slots),
      name: attrHtml(attrs.name, slots),
      blocks: inner.filter((b) => b.type !== "aside"),
    };
  }
  if (name === "aside") {
    const items = flattenItems(inner);
    const plain = innerPlain(inner);
    if (!items.length && !plain.text) return null;
    return {
      type: "aside",
      anchor: nullIfEmpty(attrs.anchor),
      kind: nullIfEmpty(attrs.kind),
      title: attrHtml(attrs.title, slots),
      items: items.length ? items : null,
      html: items.length ? null : plain.html,
      text: items.length ? null : plain.text,
    };
  }
  if (name === "note") {
    const plain = innerPlain(inner);
    if (!plain.text) return null;
    return { type: "note", html: plain.html, text: plain.text };
  }
  if (name === "equation") {
    const raw = inner
      .map((b) => {
        if (b.type === "para") return b.text;
        if (b.type === "code") return b.text;
        if (b.type === "equation") return b.tex;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    let tex = raw
      .replace(/^\\\[/, "")
      .replace(/\\\]$/, "")
      .replace(/^\\\(/, "")
      .replace(/\\\)$/, "")
      .replace(/^\$\$/, "")
      .replace(/\$\$$/, "")
      .trim();
    tex = slotsToPlain(tex, slots).trim();
    if (!tex) return null;
    return {
      type: "equation",
      tex,
      number: nullIfEmpty(attrs.number),
      name: attrHtml(attrs.name, slots) ?? attrHtml(attrs.title, slots),
      id: nullIfEmpty(attrs.id),
    };
  }
  return null;
}

function attrHtml(value: string | undefined, slots: MathSlot[]): string | null {
  const raw = nullIfEmpty(value);
  if (!raw) return null;
  return slotsToHtml(raw, slots);
}

function walk(tokens: MdToken[], from: number, to: number, slots: MathSlot[]): Block[] {
  const blocks: Block[] = [];
  let i = from;
  while (i < to) {
    const t = tokens[i];
    if (t.type === "heading_open") {
      const inline = tokens[i + 1];
      const raw = inline?.content ?? "";
      const { id, text } = parseHeadingMeta(raw);
      const { number, title: titleRaw } = parseNumberedTitle(text);
      const titlePlain = (slotsToPlain(titleRaw, slots) || titleRaw).trim();
      const titleHtml = slotsToHtml(titleRaw, slots);
      const level = Number(t.tag.slice(1));
      const hid = id || slugify(titlePlain);
      if (level <= 1) {
        const block: Block = {
          type: "section",
          id: hid,
          number: null,
          title: titlePlain || text,
          html: titleHtml,
        };
        Object.assign(block, { _h1: true });
        blocks.push(block);
      } else if (level === 2) {
        blocks.push({ type: "section", id: hid, number, title: titlePlain, html: titleHtml });
      } else {
        blocks.push({ type: "subsection", id: hid, number, title: titlePlain, html: titleHtml });
      }
      i += 3;
      continue;
    }
    if (t.type === "paragraph_open") {
      const inline = tokens[i + 1];
      const content = inline?.content ?? "";
      const html = renderInline(inline?.children ?? [], slots);
      const slotIdx = parseSlotToken(content);
      if (slotIdx != null && slots[slotIdx]?.kind === "display") {
        const slot = slots[slotIdx];
        if (slot.tex.trim()) {
          blocks.push({
            type: "equation",
            tex: slot.tex,
            number: slot.number,
            name: null,
            id: slot.id,
          });
        }
      } else if (stripTags(html).trim()) {
        blocks.push({ type: "para", html, text: stripTags(html).trim() });
      }
      i += 3;
      continue;
    }
    if (t.type === "bullet_list_open" || t.type === "ordered_list_open") {
      const { items, end } = collectList(tokens, i, slots);
      const ordered = t.type === "ordered_list_open";
      if (items.length) {
        const prev = blocks[blocks.length - 1];
        if (prev && prev.type === "para" && isBoldOnly(prev.html, prev.text)) {
          blocks.pop();
          blocks.push({
            type: "list",
            ordered,
            title: prev.html.replace(/<\/?strong>/gi, ""),
            items,
          });
        } else {
          blocks.push({ type: "list", ordered, title: null, items });
        }
      }
      i = end;
      continue;
    }
    if (t.type === "fence") {
      const text = t.content.replace(/\n$/, "");
      if (text.trim()) blocks.push({ type: "code", text, lang: nullIfEmpty(t.info) });
      i += 1;
      continue;
    }
    if (t.type === "table_open") {
      const table = collectTable(tokens, i, slots);
      if (table.headers.length || table.rows.length) {
        let caption: string | null = null;
        const prev = blocks[blocks.length - 1];
        if (prev && prev.type === "para" && looksLikeCaption(prev.text)) {
          blocks.pop();
          caption = prev.html;
        }
        blocks.push({
          type: "table",
          caption,
          headers: table.headers,
          rows: table.rows,
        });
      }
      i = table.end;
      continue;
    }
    if (t.type.startsWith("container_") && t.type.endsWith("_open")) {
      const name = t.type.slice("container_".length, -"_open".length);
      const end = findClose(tokens, i, `container_${name}_close`);
      const inner = walk(tokens, i + 1, end, slots);
      const attrs = parseAttrs(t.info || "");
      const block = containerToBlock(name, attrs, inner, slots);
      if (block) blocks.push(block);
      i = end + 1;
      continue;
    }
    if (t.type === "blockquote_open") {
      const end = findClose(tokens, i, "blockquote_close");
      const inner = walk(tokens, i + 1, end, slots);
      const plain = innerPlain(inner);
      if (plain.text) blocks.push({ type: "note", html: plain.html, text: plain.text });
      i = end + 1;
      continue;
    }
    if (t.type === "hr") {
      i += 1;
      continue;
    }
    i += 1;
  }
  return blocks;
}

function strField(fm: Record<string, unknown>, key: string): string | null {
  return nullIfEmpty(fm[key]);
}

export function parseMarkdown(source: string, themeOverride?: ThemeId | null): IR {
  const { fm, body } = extractFrontMatter(source);
  const yamlTheme = strField(fm, "theme");
  const theme: ThemeId =
    themeOverride && isThemeId(themeOverride)
      ? themeOverride
      : yamlTheme && isThemeId(yamlTheme)
        ? yamlTheme
        : "classic";

  const ir = emptyIR(theme);
  ir.lang = strField(fm, "lang") || "en";
  ir.title = strField(fm, "title");
  ir.chapter = strField(fm, "chapter");
  ir.header_left = strField(fm, "header_left");
  ir.header_right = strField(fm, "header_right");
  ir.footer_left = strField(fm, "footer_left");
  ir.folio = strField(fm, "folio");

  const { text: mathBody, slots } = extractMath(body);
  const tokens = md.parse(mathBody, {}) as unknown as MdToken[];
  const rawBlocks = walk(tokens, 0, tokens.length, slots);

  const h1s: { index: number; title: string }[] = [];
  rawBlocks.forEach((b, index) => {
    if (b.type === "section" && (b as { _h1?: boolean })._h1) {
      h1s.push({ index, title: b.title });
    }
  });

  if (!ir.title && h1s[0]) ir.title = h1s[0].title;

  ir.blocks = rawBlocks.filter((b, index) => {
    if (b.type === "section" && (b as { _h1?: boolean })._h1) {
      if (ir.title && b.title === ir.title) return false;
    }
    void index;
    return true;
  });

  for (const b of ir.blocks) {
    delete (b as { _h1?: boolean })._h1;
  }

  return ir;
}
