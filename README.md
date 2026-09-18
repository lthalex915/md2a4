# md2a4 — A4 Notes Compiler

Turns Markdown notes into a **standalone, printable A4 HTML** page.

Paste notes, pick a theme, compile, download. There is **no rewrite step** and **no invented content**. Theme CSS is locked. Empty decorative boxes are dropped.

This app **does not ship an AI key**. Compile never calls a model. Optional AI features use **your** key only (bring-your-own-key).

---

## Run it on your computer

You do not need programming experience. You will: download the project, install Node.js (once), type two commands, then open a page in your browser.

### 1. Install Node.js (once)

Node.js is a free program that lets this app run on your computer.

1. Open [https://nodejs.org](https://nodejs.org).
2. Download the **LTS** button (version 20 or 22 is fine).
3. Run the installer.
   - Windows: keep the box **Add to PATH** checked. Click Next until Finish.
   - Mac: open the `.pkg` and click Continue until it finishes.
4. Close any old Command Prompt / Terminal windows.

To check it worked, open a new terminal (steps below) and type:

```text
node -v
npm -v
```

Each should print a version number (for example `v22.11.0`). If you see “not recognized” or “command not found”, install Node.js again and **open a new** terminal.

### 2. Download md2a4

**Easiest — ZIP file**

1. Open [https://github.com/lthalex915/md2a4](https://github.com/lthalex915/md2a4).
2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Unzip the file (Windows: right-click → Extract All; Mac: double-click).
5. You should see a folder named something like `md2a4-main` that contains `package.json` and `README.md`. That is the project folder.

**Optional — if you already use Git**

```text
git clone https://github.com/lthalex915/md2a4.git
```

Then use the `md2a4` folder that Git creates.

### 3. Open a terminal in the project folder

A terminal is a text window where you type commands.

**Windows**

1. Open File Explorer and go into the unzipped folder until you see `package.json`.
2. Click the address bar at the top, type `cmd`, and press Enter.  
   Or: hold Shift, right-click empty space in the folder, choose **Open in Terminal** / **Open PowerShell window here**.

**Mac**

1. Open **Terminal** (Spotlight: press Cmd+Space, type `Terminal`, press Enter).
2. Type `cd ` (with a space after cd), then drag the unzipped folder onto the Terminal window, then press Enter.

**Linux**

```text
cd /path/to/md2a4-main
```

### 4. Install the app files

In that terminal, type this and press Enter:

```text
npm install
```

Wait until it finishes (it downloads extra pieces the first time; you need internet). You only do this once per download, or again after you update the project.

If it fails, see [Troubleshooting](#troubleshooting).

### 5. Start the app

```text
npm run dev
```

Leave this window open. After a few seconds you should see a message that the server is ready.

### 6. Open it in your browser

Open [http://localhost:8080](http://localhost:8080).

You should see **md2a4** with a notes box on the left and a preview on the right.

Click **Load sample dialect**, then **Compile**, to confirm it works.

To stop the app later: click the terminal window and press **Ctrl+C**.

---

## How to use

1. Paste notes, or **Open file** (`.md`, `.txt`, Word/Docs HTML).
2. Choose **Classic A4**, **Navy textbook**, or **Palatino grid**.
3. Click **Compile** (or Ctrl/Cmd + Enter).
4. **Download HTML**, then print or “Save as PDF” with paper size **A4**.

In the print dialog: A4 portrait, backgrounds enabled. The downloaded file is self-contained except MathJax, which loads from the internet the first time you open it.

Optional YAML keys, if missing, omit that chrome — the compiler will not invent a course name, date, or chapter number.

## Prepare notes (optional)

**Prepare notes** sits *in front of* the compiler. It never writes the A4 HTML.

1. Paste messy notes (plain Markdown, Word, Google Docs, or `.html`).
2. Click **Prepare notes**.
3. Review the proposal. Uncheck a local pass if you want.
4. **Apply to editor**, then **Compile** as usual.

Local passes (always available, **no key**):

| Pass | Effect |
| --- | --- |
| Import | Word / Docs / Notion HTML → Markdown |
| Math | Pair `$...$`, wrap `\begin{align}`, `$F_net$` → `$F_{net}$` |
| Structure | Bold title + list → `:::list`; term lines → `:::terms`; Key Points → `:::aside` |
| Front matter | YAML `title` / `chapter` from `#` headings and a `Chapter N` line |

## Your own AI key (optional)

This project **does not** use a built-in OpenAI, xAI, or other service key. If you want extra help, you buy/create a key from a provider and paste it yourself.

1. Click **AI setup**.
2. Pick a provider (OpenAI, OpenRouter, DeepSeek, xAI, Groq, Mistral, Together, or a custom OpenAI-compatible URL).
3. Paste **your** API key. It stays in this browser only.
4. Turn on only the features you want (all default **off**).
5. Optional: **Test connection**.
6. Prefer a small/cheap model (`gpt-4o-mini`, `deepseek-chat`, `grok-3-mini`, …).

When a feature is on, the model only sees a few short snippets — never a full-document rewrite:

- **Structure:** classify leftover short titles (`list` / `aside` / `skip`)
- **Front matter:** copy `title` / `chapter` from the first lines
- **Math:** classify leftover unmatched `$` as math or currency
- **Paste cleanup:** strip leftover HTML tags after the local converter
- **Fidelity copilot:** after Compile, suggest tiny source patches that clear validation errors

You can use the compiler forever with AI off.

## Fidelity copilot (validation errors)

After **Compile**, if the bottom panel lists errors:

1. Click **Fix notes** (local repairs: emoji, `$` math delimiters, empty boxes).
2. If you turned on **Fidelity copilot** and added your key, the button is **Fix with AI** and may add a few extra patches.
3. Read the proposal, then **Apply and recompile**.

The copilot edits **your Markdown**, not the HTML/CSS. It will not invent new sentences. Some errors are compiler/theme bugs and cannot be patched from the notes.

## Themes

| Theme | Look |
| --- | --- |
| **Classic A4** | Times 11pt, single column, no footer or sidebar |
| **Navy textbook** | Times 11pt, navy headings, cards / key terms / tables / equation boxes |
| **Palatino grid** | Palatino 9.75pt, teal banners, 175px sidebar only when `:::aside` exists |

The theme dropdown overrides `theme` in YAML.

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
- Use a platform / owner API key for any AI feature
- Regenerate or restyle the locked theme CSS
- Emit empty “Key Terms”, equation, or sidebar boxes
- Add headings, tables, captions, or examples that are not in the source

The compiler constitution lives in [`AGENT.md`](./AGENT.md).

## Troubleshooting

**`node` / `npm` is not recognized**  
Node.js is not installed, or the terminal was open during install. Install LTS from [nodejs.org](https://nodejs.org), then open a **new** terminal.

**`npm install` errors about permissions or network**  
Use a normal user account (not “run as administrator” unless you have to). You need internet. Corporate networks sometimes block the Node package registry.

**The browser page is blank or “refused to connect”**  
Make sure `npm run dev` is still running. Then open [http://localhost:8080](http://localhost:8080). If something else already uses that address, stop that other program and start md2a4 again.

**It asks you to sign in**  
This app is meant to run without an account. Stop it (Ctrl+C), copy `.env.example` to a new file named `.env` in the same folder, then `npm run dev` again.

**Math looks like code instead of formulas**  
Need internet once so MathJax can load. Then click Compile again.

**I want the optional AI features**  
You must create a key with OpenAI, OpenRouter, DeepSeek, xAI, etc., then paste it in **AI setup**. md2a4 will not provide a key.

## For developers

```text
npm test
npm run typecheck
```

Stack: React 19, TanStack Start, Tailwind v4, markdown-it, MathJax 3.

Pipeline: parse → IR → math delimiter conversion → theme render → constitution validate.
