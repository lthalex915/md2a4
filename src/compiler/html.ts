export function nullIfEmpty(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

const AMP = "\u0026";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, `${AMP}amp;`)
    .replace(/</g, `${AMP}lt;`)
    .replace(/>/g, `${AMP}gt;`)
    .replace(/"/g, `${AMP}quot;`);
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, `${AMP}#39;`);
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(new RegExp(`${AMP}nbsp;`, "g"), " ")
    .replace(new RegExp(`${AMP}amp;`, "g"), "&")
    .replace(new RegExp(`${AMP}lt;`, "g"), "<")
    .replace(new RegExp(`${AMP}gt;`, "g"), ">")
    .replace(new RegExp(`${AMP}quot;`, "g"), '"')
    .replace(new RegExp(`${AMP}#39;`, "g"), "'");
}

export function slugify(text: string): string {
  const x = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return x || "section";
}

export function safeHref(href: string): string {
  const t = href.trim();
  if (!t) return "#";
  if (/^(https?:|mailto:|\/|#)/i.test(t)) return t;
  return "#";
}

export function displayMath(tex: string): string {
  return `\\[${escapeHtml(tex.trim())}\\]`;
}

export function inlineMath(tex: string): string {
  return `\\(${escapeHtml(tex.trim())}\\)`;
}
