import type { IR, ThemeId } from "./ir.ts";
import { parseMarkdown } from "./parse.ts";
import { renderHtml } from "./render.ts";
import { validate, type ValidationIssue } from "./validate.ts";

export type CompileResult = {
  ir: IR;
  html: string;
  theme: ThemeId;
  issues: ValidationIssue[];
};

export function compile(source: string, theme: ThemeId): CompileResult {
  const ir = parseMarkdown(source, theme);
  ir.theme = theme;
  const html = renderHtml(ir, theme);
  const issues = validate(source, html, theme);
  return { ir, html, theme, issues };
}

export { parseMarkdown } from "./parse.ts";
export { renderHtml } from "./render.ts";
export { validate } from "./validate.ts";
export { SAMPLE_MARKDOWN } from "./sample.ts";
export type { IR, ThemeId, Block } from "./ir.ts";
export type { ValidationIssue } from "./validate.ts";
export { THEME_IDS, isThemeId } from "./ir.ts";
