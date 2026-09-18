# md2a4 — A4 Notes Compiler

Browser compiler that turns Markdown notes into a **standalone, printable A4 HTML** document.

Paste notes, pick a theme, compile, download. There is **no rewrite step** and **no invented content**. Theme CSS is locked. Empty decorative boxes are dropped.

## Themes

| Theme | Look |
| --- | --- |
| **Classic A4** | Times 11pt, single column, no footer or sidebar |
| **Navy textbook** | Times 11pt, navy headings, cards / key terms / tables / equation boxes |
| **Palatino grid** | Palatino 9.75pt, teal banners, 175px sidebar only when `:::aside` exists |

The theme dropdown overrides `theme` in YAML. Missing front-matter keys omit that chrome — the compiler will not invent a course name, date, or chapter number.

## How to use

1. Paste notes (or open a `.md` file).
2. Choose **Classic A4**, **Navy textbook**, or **Palatino grid**.
3. Click **Compile** (or Ctrl/Cmd + Enter).
4. **Download HTML**, then print or “Save as PDF” with paper size **A4**.

In the print dialog: A4 portrait, backgrounds enabled. The downloaded file is self-contained except MathJax, which loads from a CDN.

## Markdown dialect

Optional YAML front matter:

```yaml
---
theme: classic
title: Document title
chapter: 4
header_left: Course name
header_right: Section label
footer_left: Footer label
folio: 4-1
lang: en
---
```

Containers (only these become cards / asides — the compiler will not guess):

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

:::equation name="Ohm's law"
V = IR
:::
```

### Math

- `$x$` and `\(x\)` → inline MathJax `\(...\)`
- `$$...$$`, `\[...\]`, and fenced ` ```math ` → display `\[...\]`
- Amounts like `$100`, `$ 3.50`, `US$100` stay as text
- `$|x|$`, `$P(A|B)$`, `$2^n$`, `$x_1$` are math
- Currency and formulas can share a sentence: `costs $100 and $E=mc^2$`

Do not use emoji in the source if you want a clean academic page.

## What it will not do

- Call a model to summarize, invent sidebars, or paraphrase
- Regenerate or restyle the locked theme CSS
- Emit empty “Key Terms”, equation, or sidebar boxes
- Add headings, tables, captions, or examples that are not in the source

The compiler constitution lives in [`AGENT.md`](./AGENT.md).

## Develop

```bash
npm install
npm run dev
```

Then open the app in a browser. Compile runs entirely client-side.

```bash
npm test          # includes compiler tests
npm run typecheck
```

## Stack

React 19, TanStack Start, Tailwind v4, markdown-it, MathJax 3.

Parse → IR → math delimiter conversion → theme render → constitution validate.
