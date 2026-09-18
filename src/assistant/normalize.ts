const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, code: string) => {
      if (code[0] === "#") {
        const n =
          code[1] === "x" || code[1] === "X"
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : _;
      }
      return ENTITIES[code] ?? _;
    })
    .replace(/\u00a0/g, " ");
}

export function normalizePlain(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "–")
    .replace(/\u2014/g, "—")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function isRichPaste(html: string): boolean {
  if (!html || html.length < 20) return false;
  return /xmlns:o=|MsoNormal|mso-|docs-internal-guid|notion-|Apple-converted-space|StartFragment|<h[1-3][\s>]|<table[\s>]|<p[\s>]/i.test(
    html,
  );
}

function inlines(html: string): string {
  let s = html;
  for (let n = 0; n < 4; n += 1) {
    s = s.replace(/<(strong|b)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi, "**$2**");
    s = s.replace(/<(em|i)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi, "*$2*");
  }
  s = s.replace(/<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/gi, "`$1`");
  s = s.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

function cellText(html: string): string {
  return inlines(html).replace(/\|/g, "\\|");
}

function tableToMarkdown(tableHtml: string): string {
  const rows: string[][] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(tableHtml))) {
    const cells: string[] = [];
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1]))) cells.push(cellText(cm[1]) || " ");
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] || " ");
  const head = pad(rows[0]);
  const body = rows.slice(1).map(pad);
  const sep = head.map(() => "---");
  const line = (r: string[]) => `| ${r.join(" | ")} |`;
  return ["", line(head), line(sep), ...body.map(line), ""].join("\n");
}

function listToMarkdown(html: string, ordered: boolean): string {
  const items: string[] = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const inner = htmlToMarkdown(m[1]).trim();
    if (inner) items.push(inner);
  }
  return items
    .map((it, i) => (ordered ? `${i + 1}. ${it}` : `- ${it}`))
    .join("\n");
}

/** Convert Word / Docs / Notion HTML paste into Markdown. Never invents sentences. */
export function htmlToMarkdown(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<\/?(o|w|m):[^>]+>/gi, "");
  s = s.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (m) => tableToMarkdown(m));
  s = s.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n\n# ${inlines(t)}\n\n`);
  s = s.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n\n## ${inlines(t)}\n\n`);
  s = s.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n\n### ${inlines(t)}\n\n`);
  s = s.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => {
    const inner = htmlToMarkdown(t).trim();
    return `\n\n${inner
      .split("\n")
      .map((ln) => `> ${ln}`)
      .join("\n")}\n\n`;
  });
  s = s.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, t) => `\n\n${listToMarkdown(t, false)}\n\n`);
  s = s.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, t) => `\n\n${listToMarkdown(t, true)}\n\n`);
  s = s.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `\n\n${inlines(t)}\n\n`);
  s = s.replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, (_, t) => `\n${htmlToMarkdown(t)}\n`);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/^[ \t]*[•●◦·▪▫]\s+/gm, "- ");
  return normalizePlain(s).trim();
}

export function dialectImport(source: string): string {
  const trimmed = source.trim();
  if (/<[a-z][\s\S]*?>/i.test(trimmed) && isRichPaste(trimmed)) {
    return htmlToMarkdown(trimmed);
  }
  let text = normalizePlain(source);
  text = text.replace(/^[ \t]*[•●◦·▪▫]\s+/gm, "- ");
  return text;
}
