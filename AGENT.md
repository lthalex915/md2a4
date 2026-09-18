# AGENT.md — Markdown → Printable A4 HTML Compiler

Build a **browser-based compiler**, not an LLM wrapper. The app turns user Markdown into a standalone printable A4 HTML document using one of three **locked** visual themes. It must obey the same fidelity rules as the HTML Document Generator system prompt: never invent content, never emit empty decorative blocks, never paraphrase meaning, keep source order.

This file is the contract for a coding agent. Implement exactly this product. Do not add sample textbook chapters, lorem ipsum, or demo equations inside generated documents.

---

## 1. Product

**Name:** `md2a4` (or `A4 Notes Compiler`)

**What it does:** User pastes or opens a Markdown file, picks a style, clicks Compile, previews the A4 page, downloads a single `.html` file that prints correctly on A4.

**What it must not do:**
- Call an LLM inside **Compile** to rewrite, summarize, extract “key points,” or invent sidebars.
- Regenerate theme CSS. CSS is copied verbatim from locked theme files.
- Add learning objectives, key-term boxes, tables, figures, captions, chapter numbers, footers, or headings that are not in the source (or in explicit Markdown front matter taken from the source).

**Optional prepare assistant (not the compiler):**
- A **Prepare notes** action may run *before* Compile. It proposes Markdown only.
- Allowed: wrap existing blocks in `:::list` / `:::terms` / `:::aside` / `:::example` / `:::equation`; fill YAML keys from headings already in the notes; repair `$` / `$$` / `\begin{align}` delimiters; convert Word/Docs/HTML paste to Markdown.
- Forbidden in prepare: new sentences, paraphrasing, invented cards, empty boxes, writing HTML/CSS.
- The author must review and apply. Compile still parse → IR → render → validate on the applied source.
- AI is optional and **user-keyed (BYOK)**. The app must not spend a platform/owner API key (`XAI_API_KEY` or any `process.env` secret) for Prepare, Copilot, or Test connection. Store the key in the browser only; proxy chat-completions with SSRF checks (https, no private hosts). The request body `apiKey` is the sole credential.
- Support OpenAI-compatible providers (OpenAI, OpenRouter, DeepSeek, xAI, Groq, Mistral, Together, custom base URL). Optimize BYOK defaults for **DeepSeek V4.1 Flash**: `deepseek-flash` on `api.deepseek.com`, `deepseek/deepseek-v4.1-flash` on OpenRouter. Always send `thinking: {type:"disabled"}` / `reasoning.effort: "none"` plus `response_format: json_object` for those jobs (Flash thinks at high effort by default).
- Each AI feature is a toggle, default **off**. Heuristics always run.
- Send the **full notes** to the model when an AI feature is on. Do not truncate prompts, snippets, patch counts, or completion tokens. Fidelity-check AI output against the source; discard if it invents prose.
- **Fidelity copilot** (feature 6): after Compile, if validation errors remain, propose source edits (local heuristics first: strip emoji, repair `$` delimiters, drop empty fences). Optional BYOK JSON patches. Review + apply, then recompile. Never writes HTML/CSS. Compiler-only failures (MathJax config, theme forbids) are not “fixed” by inventing notes.

**Ease of use (required):**
- Runs in the browser. Zero install beyond opening `index.html` (or a tiny local static server if modules require it).
- Works offline after first load except MathJax CDN (bundle MathJax locally if practical).
- One screen: source editor + theme picker + preview + Download HTML + Print.
- No account, no backend, no build step required for the end user.

---

## 2. Themes (exactly three)

User-facing labels and internal ids:

| UI label | id | Source of locked CSS |
|---|---|---|
| Classic A4 | `classic` | Original system prompt + `html-a4-document` skill: Times New Roman 11pt, single column, **no footer, no page numbers, no two-column grid** |
| Navy textbook | `navy` | User template `textbook-a4-html` (Times 11pt, navy headers, single column, card boxes / key terms / data tables / equation boxes). **No sidebar, no page footer** |
| Palatino grid | `palatino` | User template `textbook-a4-html-palatino-grid` (Palatino 9.75pt, teal, 175px contextual sidebar, running header/footer only if source provides strings) |

Theme CSS and MathJax `<script>` blocks must be stored as **verbatim files** under `themes/<id>/shell.html` or `themes/<id>/theme.css` + `mathjax.html`. Do not beautify, minify in a way that changes rules, or “improve” colors.

If a later agent only has this AGENT.md and not the JSON exports, copy CSS from:
- `/home/workdir/.grok/skills/html-a4-document/SKILL.md` (classic)
- `/home/workdir/attachments/skill-textbook-a4-html-export-1788022815801.json` (navy)
- `/home/workdir/attachments/skill-textbook-a4-html-palatino-grid-export-1789628682150.json` (palatino)

The sample **body** inside those skill templates (placeholder chapter text, sample sidebars, `T_CPU` equation, `margin-top: 55pt` cards) is **not content**. Never emit it.

---

## 3. Constitution (system prompt → code)

These rules are mandatory in every theme.

### 3.1 Fidelity
- Output text nodes must come from the Markdown source (plus theme chrome with no textbook sentences).
- Keep source wording. Fix only obvious typos if you implement a toggle; default is **verbatim**.
- Keep source order.
- Do not add facts, examples, explanations, conclusions, transitions, headings, lists, tables, figures, captions, notes, or equations that are not in the input.
- If the source has no list, omit list cards. No defined terms → omit key-terms box. No table → omit table. No featured formula → omit equation box. No chapter number → omit chapter-prefix / `.chapter-num`. Empty decorative blocks are forbidden.

### 3.2 Page
- A4 portrait.
- Printable (`@page { size: A4 ... }`, `print-color-adjust: exact`).
- Smart page breaks: headings, tables, images, formula blocks, cards, examples must use `page-break-inside: avoid` / `page-break-after: avoid` as in the locked CSS.
- Never `overflow: hidden` on `body`, main column, lists, or equation containers.
- Never clip or truncate source sentences. Multi-page documents are required.

### 3.3 Math
- Include MathJax 3 in every document.
- **Forbidden in output:** `$...$` and `$$...$$` as math delimiters.
- Inline: `\(...\)`. Display: `\[...\]`.
- Literal currency such as `$100`, `$ 3.50` stays as text.
- Config (classic/navy/palatino all use this policy):

```html
<script>
window.MathJax = {
  tex: {
    inlineMath: [['\\(', '\\)']],
    displayMath: [['\\[', '\\]']],
    processEscapes: true
  },
  svg: { fontCache: 'global' }
};
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
```

Single-dollar processing must stay **disabled**.

### 3.4 Language and extras
- Preserve the source language.
- No emojis in generated documents.
- No invented SVG figures.

### 3.5 Theme overrides
The constitution above always applies. Layout exceptions live **only** in the selected theme:

- `classic`: no footer, no folio, no two-column grid, no sidebar cards.
- `navy`: no `.page-grid`, no sidebar, no running footer. May use `.page-header` if header strings exist.
- `palatino`: may use `.page-grid` + `aside.side-col`. Use running footer only if `footer_left` or `folio` exists in front matter / source. Do not invent sidebar cards to fill the gutter. Prefer **row-aligned** main+aside pairs so cards sit next to their anchored section. Do not copy sample `margin-top: 55pt` values.

---

## 4. Markdown dialect (deterministic)

The compiler must not guess “this paragraph looks like a key takeaway.” Authors mark structure.

### 4.1 Front matter (optional YAML)

```yaml
---
theme: classic | navy | palatino
title: Document title
chapter: 4
header_left: Book or course name
header_right: Short section label
footer_left: Footer label
folio: 4-1
lang: en
---
```

- Missing keys → omit the corresponding chrome.
- `theme` in YAML is default; the UI selector overrides it at compile time.
- `chapter` missing → do not emit `.chapter-num` / `.chapter-prefix`.
- Do not invent course names or dates.

### 4.2 Headings
- `# Title` → document / chapter title if `title` not set.
- `## 4.1 Section` → section banner / `.section-title` / `.section-banner`. Parse leading number into `sec-num` when present; do not invent numbers.
- `### 4.1.1 Sub` → `h2.subsection` (palatino) or a lesser heading (classic/navy). Keep source numbers.

### 4.3 Blocks
- Paragraphs → `<p>` in order.
- Unordered lists → navy `.card-box` + `ul.box-list` **only if** wrapped as a titled list (see containers) or if the list is the entire block with a preceding bold title line. Bare lists in `classic` become `<ul>`. Do not auto-promote every `-` list into a “Key Terms” card.
- Ordered lists → `ol` in classic; palatino `ol.steps` only when fenced as steps (below); navy card if fenced as list.

### 4.4 Containers (required for theme-specific boxes)

```markdown
:::list title="Properties from source"
- item already in the notes
:::

:::terms
**Term.** Definition already in the notes.
:::

:::example title="Example 1" name="Short name"
Paragraphs and optional code.
:::

:::aside anchor=section-id kind=takeaway title="Key Points"
- bullet from the notes
:::

:::note
Footnote-like text from the source.
:::
```

- `:::terms` → navy `.key-term-item` only. Palatino may render as a sidebar card **only if** `kind` is takeaway/term/tradeoff; otherwise leave in main column as compact definition text. Classic: definition list / paragraphs, no fake “Key Terms” heading unless title is in the fence.
- `:::aside` → palatino `.sidebar-card` anchored to `anchor` (heading id or explicit `{#id}`). Classic and navy: render as a `.note` or ignore sidebar chrome — **do not drop the text**. Default: render asides in-flow as a compact note so fidelity is preserved.
- `:::example` → palatino `.example-box`; navy/classic: a keep-together box using theme-legal classes (navy may use `.card-box`; classic a simple bordered section using only classic CSS — if classic has no example class, use a `figure`/`div.keep-together` styled with existing classic rules, no new colors that contradict the theme file; prefer adding a minimal `.example-box` only if you extend classic CSS in `themes/classic/` and keep it locked).

### 4.5 Math
- `$x+1$` in source → `\ (x+1\ )` in HTML.
- `$$ ... $$` or fenced math → display `\[...\]`.
- Palatino featured / numbered: `$$ E = mc^2 $$ {#eq-4-1}` or `$$ ... $$ (4.1)` → `.equation-row` + `.eq-num`.
- Navy featured: same display math inside `.equation-box`. Optional name line only if a title is provided in the source (`:::equation name="Ohm's law"`).
- Classic: display MathJax in a `.math-block`.
- Currency: do not convert `$` + digit (optional space) into math.

### 4.6 Tables
GFM tables → navy `.data-table` (+ `.caption` only if a caption line exists). Classic: plain `table`. Palatino: simple table in main column (do not invent palatino table CSS beyond what the locked file already allows; unstyled semantic table is OK if you only use existing `p`/font rules).

### 4.7 Code
Inline `code` and fenced blocks. Palatino `.code-line` only for single-line expressions inside `:::example`.

---

## 5. Architecture

Browser app, static files:

```text
md2a4/
  AGENT.md                 (this file)
  README.md                (short user how-to)
  index.html               (UI)
  app.js                   (wire UI)
  src/
    parse.js               (MD → IR)
    ir.js                  (types / empty checks)
    math.js                (delimiter conversion)
    validate.js            (constitution tests)
    render.js              (IR + theme id → HTML string)
  themes/
    classic/theme.css, partials or renderClassic.js
    navy/theme.css, renderNavy.js
    palatino/theme.css, renderPalatino.js
  vendor/                  (markdown-it, markdown-it-front-matter,
                            markdown-it-container, optional texmath helper)
  test/
    fixtures/*.md
    expected/*.html or assertion scripts
```

**Pipeline:**

1. Read textarea / FileReader.
2. Parse YAML + markdown-it + containers.
3. Build IR. Absent nodes are `null`, never empty strings used as titles.
4. Convert math on text nodes.
5. `render(ir, themeId)` injects body into that theme’s shell.
6. `validate(sourceMd, html, themeId)`. On failure, still show preview but surface errors in a panel. Do not auto-insert filler to “fix” empty columns.
7. Preview in `<iframe srcdoc>`. After inject, trigger MathJax typeset in the iframe if possible.
8. Download: Blob of full HTML. Print: `iframe.contentWindow.print()`.

No server-side Python required for v1. A optional `md2a4` CLI that uses the same JS (Node) is nice but not required for “easy in browser.”

---

## 6. Intermediate representation

```js
{
  theme: 'classic' | 'navy' | 'palatino',
  lang: 'en',
  title: string | null,
  chapter: string | null,
  header_left: string | null,
  header_right: string | null,
  footer_left: string | null,
  folio: string | null,
  blocks: [
    { type: 'section', id, number, title },
    { type: 'subsection', id, number, title },
    { type: 'para', text },
    { type: 'list', ordered, title, items: [string] },
    { type: 'terms', title, items: [{ name, def }] },
    { type: 'example', title, name, blocks: [...] },
    { type: 'code', text, inlineClass: boolean },
    { type: 'equation', tex, number, name },
    { type: 'table', caption, headers, rows },
    { type: 'note', text },
    { type: 'aside', anchor, kind, title, textOrItems }
  ]
}
```

Renderers must skip chrome when fields are null.

Palatino grouping: walk blocks; when a `section`/`subsection`/`example`/`equation` has asides with matching `anchor` (or asides that appeared immediately after it without an anchor), emit one `.page-grid` row: main slice + those cards. If a document has **zero** asides, emit a single `main` full width — do **not** force `.page-grid` with an empty aside (empty decorative column is discouraged; a reserved empty gutter is allowed only if you document it — default is collapse).

---

## 7. UI requirements

Single page, desktop-first, also usable on a laptop.

**Left (or top on narrow screens):**
- Theme `<select>`: Classic A4, Navy textbook, Palatino grid.
- File input accept `.md,.txt` + “Load sample dialect” that inserts a **short** fixture showing front matter, headings, math, `:::aside`, table — clearly labeled as UI help, not compiled unless the user clicks Compile.
- Large textarea for Markdown.
- Buttons: Compile, Download HTML, Print preview.
- Status: “Compiled · navy · 12 blocks · 0 validation errors”.

**Right:**
- A4-looking preview (`aspect` not required; iframe width ~ 210mm scale).
- Validation log (omit empty components that were correctly skipped — that is success, not a warning).

**Do not** ship a “generate with AI” button in v1.

Default theme: `classic`.

---

## 8. Validators (implement as tests + runtime)

`validate(source, html, theme)` must check:

1. **Substring fidelity:** every non-chrome text node (normalize whitespace) appears in the source MD or in YAML values. Chrome means theme labels that are structural only (do not add English like “Key Points” unless that title was in the fence or source). If a card requires an `h3` and the aside had no title, use the `kind` label only if you map kind → a fixed short heading **and** that heading is considered chrome: prefer using the source title; if none, omit `h3`.
2. No emoji.
3. No `$...$` / `$$` math delimiters in output (currency `$100` allowed).
4. MathJax config uses only `\\(` `\\)` and `\\[` `\\]`.
5. Theme `classic`: reject `.page-grid`, `.sidebar-card`, `.running-footer`, `.folio`.
6. Theme `navy`: reject `.page-grid`, `.sidebar-card`, `.running-footer`.
7. No empty `.card-box`, `.equation-box`, `.sidebar-card`, `.chapter-prefix`, `.chapter-num`, `.page-header` with blank spans that look like placeholders (`LEFT HEADER FROM SOURCE` is a hard fail).
8. Placeholder strings from skill samples must never appear: `DOCUMENT TITLE`, `Chapter Title`, `Introduction / overview narrative`, `T_{\\text{CPU}}`, `HEADER LEFT FROM SOURCE`, `CHAPTER N`, `1-1` unless the user wrote them.
9. Output is a complete HTML document (`<!DOCTYPE html>`, head, body).

Unit-test fixtures:
- Paragraph-only MD → classic HTML with no cards.
- Title + chapter + one equation → navy has prefix + equation-box; no table.
- Aside + section → palatino has one sidebar card next to that section; classic still contains the aside text.
- `$E=mc^2$ and costs $100` → `\ (E=mc^2\ )` and literal `$100`.

---

## 9. Implementation notes for the coding agent

- Use `markdown-it` in the browser (esm import from a vendor copy or CDN). Prefer vendoring so the app works offline except MathJax.
- Implement containers via `markdown-it-container` for `list`, `terms`, `example`, `aside`, `note`, `equation`.
- Do not use `marked` if it makes container parsing harder.
- Escape HTML in source text. Math tex is inserted only inside known math wrappers.
- Title in `<title>` and `h1` from `ir.title` or first `#` heading; if neither exists, use `Untitled` only in `<title>`, and omit visual `h1` rather than inventing a chapter name.
- Keep JS readable. No framework required. A little CSS for the **app chrome** (not the document themes) is fine.
- `README.md`: how to open, MD dialect cheat sheet, theme differences, print via browser “Save as PDF” / A4 paper size.

---

## 10. Acceptance checklist

The agent is done when:

- [ ] Opening `index.html` (or `npx serve`) shows the compiler UI.
- [ ] User can switch Classic / Navy / Palatino and recompile the same MD.
- [ ] Generated HTML for each theme contains that theme’s locked CSS verbatim.
- [ ] Empty-source components are omitted.
- [ ] No skill-template placeholder copy leaks into output.
- [ ] Math delimiters match constitution; currency preserved.
- [ ] Palatino asides align by row/anchor, not stacked sample offsets.
- [ ] Download produces a standalone file that prints A4 in Chrome/Firefox.
- [ ] Tests cover fidelity, theme forbids, and math/currency.
- [ ] No LLM API in the compile path.

---

## 11. Out of scope (do not build)

- Cloud conversion API.
- “Auto extract key points for the sidebar.”
- PDF generation on a server.
- Editing WYSIWYG of the preview.
- Extra themes beyond the three specified (unless added as a new folder that follows the same IR).

If something is ambiguous, choose the option that **drops a box** rather than inventing content.
