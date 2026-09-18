import { extractFrontMatter } from "../compiler/parse.ts";

const YAML_KEYS = [
  "theme",
  "title",
  "chapter",
  "header_left",
  "header_right",
  "footer_left",
  "folio",
  "lang",
] as const;

function yamlEscape(value: string): string {
  if (/[:#{}[\],&*?]|^\s|\s$/.test(value)) return JSON.stringify(value);
  return value;
}

function dumpYaml(fields: Record<string, string>): string {
  const lines = YAML_KEYS.filter((k) => fields[k]).map((k) => `${k}: ${yamlEscape(fields[k])}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function existingString(fm: Record<string, unknown>, key: string): string | null {
  const v = fm[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function firstHeading(body: string): { level: number; text: string } | null {
  const m = body.match(/^(#{1,3})\s+(.+)$/m);
  if (!m) return null;
  return { level: m[1].length, text: m[2].replace(/\s*\{#[^}]+\}\s*$/, "").trim() };
}

function findChapter(body: string): string | null {
  const head = body.split("\n").slice(0, 24).join("\n");
  const m =
    head.match(/^#{1,2}\s*chapter\s+(\d+[A-Za-z]?)\b/im) ||
    head.match(/^chapter\s+(\d+[A-Za-z]?)\b/im);
  return m ? m[1] : null;
}

function findLang(body: string): string | null {
  if (/[\u0400-\u04FF]/.test(body)) return null;
  if (/[\u4E00-\u9FFF]/.test(body)) return "zh";
  if (/[\u3040-\u30FF]/.test(body)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(body)) return "ko";
  return null;
}

/**
 * Fill missing YAML keys from headings / labels already in the notes.
 * Never invents a course name, date, or folio.
 */
export function proposeFrontMatter(source: string): string {
  const { fm, body } = extractFrontMatter(source);
  const fields: Record<string, string> = {};
  for (const key of YAML_KEYS) {
    const cur = existingString(fm, key);
    if (cur) fields[key] = cur;
  }

  const heading = firstHeading(body);
  if (!fields.title && heading && heading.level === 1) {
    const t = heading.text.replace(/^chapter\s+\d+[A-Za-z]?\s*[:.—–-]?\s*/i, "").trim();
    if (t) fields.title = t;
  }
  if (!fields.chapter) {
    const ch = findChapter(body);
    if (ch) fields.chapter = ch;
  }
  if (!fields.lang) {
    const lang = findLang(body);
    if (lang) fields.lang = lang;
  }

  const next = dumpYaml(fields) + body.replace(/^\n+/, "");
  const prevKeys = YAML_KEYS.filter((k) => existingString(fm, k)).join("|");
  const nextKeys = YAML_KEYS.filter((k) => fields[k]).join("|");
  if (prevKeys === nextKeys && Object.keys(fm).length > 0) return source;
  if (!fields.title && !fields.chapter && !fields.lang && Object.keys(fm).length === 0) {
    return source;
  }
  if (Object.keys(fm).length === 0 && nextKeys === "") return source;
  return next;
}

function inSource(source: string, value: string): boolean {
  return source.toLowerCase().includes(value.trim().toLowerCase());
}

/** Fill missing title/chapter only when the value already appears in the notes. */
export function mergeYamlFields(
  source: string,
  extra: { title?: string | null; chapter?: string | null },
): string {
  const { fm, body } = extractFrontMatter(source);
  const fields: Record<string, string> = {};
  for (const key of YAML_KEYS) {
    const cur = existingString(fm, key);
    if (cur) fields[key] = cur;
  }
  const title = extra.title?.trim();
  if (!fields.title && title && title.length <= 120 && inSource(body, title)) {
    fields.title = title;
  }
  const chapter = extra.chapter?.trim();
  if (!fields.chapter && chapter && /^\d+[A-Za-z]?$/.test(chapter) && inSource(body, chapter)) {
    fields.chapter = chapter;
  }
  if (!fields.title && !fields.chapter && Object.keys(fm).length === 0) {
    return proposeFrontMatter(source);
  }
  const next = dumpYaml(fields) + body.replace(/^\n+/, "");
  const prevKeys = YAML_KEYS.filter((k) => existingString(fm, k)).join("|");
  const nextKeys = YAML_KEYS.filter((k) => fields[k]).join("|");
  if (prevKeys === nextKeys && Object.keys(fm).length > 0) return source;
  return next;
}

