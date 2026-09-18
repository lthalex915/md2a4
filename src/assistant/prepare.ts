import { dialectImport } from "./normalize.ts";
import { repairMath } from "./math-repair.ts";
import { proposeStructure } from "./structure.ts";
import { proposeFrontMatter } from "./front-matter.ts";
import type { Change, PrepareResult } from "./types.ts";

export function prepareLocal(source: string): PrepareResult {
  const changes: Change[] = [];
  let md = source;

  const imported = dialectImport(source);
  const htmlish = /<[a-z][\s\S]*?>/i.test(source) && /xmlns:o=|MsoNormal|mso-|docs-internal-guid|notion-|StartFragment|<h[1-3][\s>]|<table[\s>]|<p[\s>]/i.test(source);
  const glyphs = /[•●◦·▪▫]/.test(source) && !/[•●◦·▪▫]/.test(imported);
  if (imported !== source && (htmlish || glyphs)) {
    changes.push({
      id: "import",
      kind: "import",
      summary: "Converted pasted HTML / Word / Docs soup to Markdown.",
    });
  }
  md = imported;

  const math = repairMath(md);
  if (math !== md) {
    changes.push({
      id: "math",
      kind: "math",
      summary: "Repaired math delimiters and subscript braces. Formulas were not rewritten.",
    });
    md = math;
  }

  const structured = proposeStructure(md);
  if (structured !== md) {
    changes.push({
      id: "structure",
      kind: "structure",
      summary: "Wrapped lists, terms, examples, and asides using titles already in the notes.",
    });
    md = structured;
  }

  const withFm = proposeFrontMatter(md);
  if (withFm !== md) {
    changes.push({
      id: "front-matter",
      kind: "front-matter",
      summary: "Filled YAML from headings and labels already in the notes.",
    });
    md = withFm;
  }

  return { source, markdown: md, changes, via: "local" };
}

export function applyKinds(
  source: string,
  kinds: Iterable<Change["kind"]>,
): string {
  const allow = new Set(kinds);
  let md = dialectImport(source);
  if (allow.has("math")) md = repairMath(md);
  if (allow.has("structure")) md = proposeStructure(md);
  if (allow.has("front-matter")) md = proposeFrontMatter(md);
  return md;
}
