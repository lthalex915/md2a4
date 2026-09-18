import { createServerFn } from "@tanstack/react-start";
import { isFaithful } from "./fidelity.ts";
import type { Change, GrokPrepareResponse } from "./types.ts";

const MAX_SOURCE = 16000;
const SYSTEM = `You adapt Markdown into the md2a4 dialect. You are not a tutor and you do not write HTML.

ALLOWED:
- Add YAML front matter ONLY with values copied from the notes (title, chapter, header_left, header_right, footer_left, folio, lang, theme).
- Wrap existing blocks in :::list, :::terms, :::example, :::aside, :::note, :::equation, :::steps. Titles must be words from the notes.
- Fix math delimiters: pair $...$, use $$ for display, wrap \\begin{align} and similar, add braces for subscripts like F_net → F_{net}. Do not change formula meaning.
- Convert Word/HTML/Google Docs soup into this dialect. Keep source order.

FORBIDDEN:
- New sentences, examples, definitions, headings, tables, captions, or sidebars that are not already in the notes.
- Paraphrasing, summarizing, or “improving” wording.
- Empty containers.
- Theme CSS.

Return JSON only:
{"markdown":"<full document>","changes":[{"kind":"import"|"front-matter"|"structure"|"math","summary":"..."}]}`;

function parsePayload(text: string): { markdown: string; changes: Change[] } | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      markdown?: unknown;
      changes?: unknown;
    };
    if (typeof parsed.markdown !== "string" || !parsed.markdown.trim()) return null;
    const changes: Change[] = [];
    if (Array.isArray(parsed.changes)) {
      parsed.changes.forEach((c, i) => {
        if (!c || typeof c !== "object") return;
        const rec = c as { kind?: string; summary?: string };
        const kind = rec.kind;
        if (
          kind === "import" ||
          kind === "front-matter" ||
          kind === "structure" ||
          kind === "math"
        ) {
          changes.push({
            id: `grok-${i}`,
            kind,
            summary: String(rec.summary || kind).slice(0, 200),
          });
        }
      });
    }
    return { markdown: parsed.markdown.replace(/^\uFEFF/, ""), changes };
  } catch {
    return null;
  }
}

export const grokPrepare = createServerFn({ method: "POST" })
  .validator((d: { source: string; theme: string }) => d)
  .handler(async ({ data }): Promise<GrokPrepareResponse> => {
    const apiKey = process.env.XAI_API_KEY?.trim();
    if (!apiKey) return { ok: false, error: "Grok is not available in this environment." };

    const source = String(data?.source ?? "");
    const theme = String(data?.theme ?? "classic");
    if (!source.trim()) return { ok: false, error: "Nothing to prepare." };
    if (source.length > MAX_SOURCE) {
      return { ok: false, error: "Notes are too long for Grok prepare. Use a smaller excerpt." };
    }

    let res: Response;
    try {
      res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0,
          max_tokens: 4096,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: `Theme preference (dropdown, not a reason to invent chrome): ${theme}\n\nSOURCE MARKDOWN:\n${source}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      return { ok: false, error: "Grok timed out. Local prepare is still available." };
    }

    if (!res.ok) {
      return { ok: false, error: `Grok could not prepare these notes (${res.status}).` };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    const parsed = parsePayload(content);
    if (!parsed) return { ok: false, error: "Grok returned an unreadable prepare result." };

    const faithful = isFaithful(source, parsed.markdown);
    if (!faithful.ok) {
      return { ok: false, error: faithful.reason || "Grok proposed wording that is not in the source." };
    }

    return { ok: true, markdown: parsed.markdown, changes: parsed.changes };
  });
