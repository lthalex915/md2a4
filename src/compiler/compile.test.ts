import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { compile } from "./index.ts";
import { THEME_CSS } from "./theme-css.ts";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../test/fixtures");

function read(name: string): string {
  return fs.readFileSync(path.join(fixtures, name), "utf8");
}

describe("compile fixtures", () => {
  it("paragraph-only classic has no cards", () => {
    const src = read("paragraph-only.md");
    const { html, issues, ir } = compile(src, "classic");
    assert.match(html, /Just a sentence about cats/);
    assert.doesNotMatch(html, /card-box/);
    assert.doesNotMatch(html, /equation-box/);
    assert.doesNotMatch(html, /sidebar-card/);
    assert.equal(ir.blocks.length, 1);
    assert.equal(issues.filter((i) => i.code !== "fidelity").length, 0);
    const fidelity = issues.filter((i) => i.code === "fidelity");
    assert.equal(fidelity.length, 0, fidelity.map((i) => i.message).join("\n"));
  });

  it("title + chapter + equation → navy prefix + equation-box, no table", () => {
    const src = read("navy-equation.md");
    const { html, issues } = compile(src, "navy");
    assert.match(html, /chapter-prefix/);
    assert.match(html, /CHAPTER 4/);
    assert.match(html, /equation-box/);
    assert.match(html, /\\\[V = IR\\\]/);
    assert.doesNotMatch(html, /<table/);
    assert.doesNotMatch(html, /page-grid/);
    assert.ok(html.includes(THEME_CSS.navy.trim()));
    const blocking = issues.filter((i) => i.code !== "fidelity");
    assert.equal(blocking.length, 0, blocking.map((i) => i.message).join("\n"));
  });

  it("aside + section → palatino sidebar next to section; classic keeps text", () => {
    const src = read("aside-section.md");
    const pal = compile(src, "palatino");
    assert.match(pal.html, /page-grid/);
    assert.match(pal.html, /sidebar-card/);
    assert.match(pal.html, /Hello world from the notes/);
    assert.match(pal.html, /section-banner/);
    assert.match(
      pal.html,
      /page-grid[\s\S]*section-banner[\s\S]*sidebar-card/,
    );

    const classic = compile(src, "classic");
    assert.match(classic.html, /Hello world from the notes/);
    assert.doesNotMatch(classic.html, /page-grid/);
    assert.doesNotMatch(classic.html, /sidebar-card/);
  });

  it("$E=mc^2$ becomes \\( \\) and $100 stays currency", () => {
    const src = read("math-currency.md");
    const { html, issues } = compile(src, "classic");
    assert.match(html, /\\\(E=mc\^2\\\)/);
    assert.match(html, /\$100/);
    assert.doesNotMatch(html, /\$E=mc\^2\$/);
    assert.doesNotMatch(html, /\$\$/);
    const mathIssues = issues.filter((i) => i.code === "dollar-math");
    assert.equal(mathIssues.length, 0, mathIssues.map((i) => i.message).join("\n"));
  });

  it("locked CSS is embedded for each theme", () => {
    const src = "Hello.\n";
    for (const theme of ["classic", "navy", "palatino"] as const) {
      const { html } = compile(src, theme);
      assert.ok(html.includes(THEME_CSS[theme].trim()), `${theme} missing locked CSS`);
      assert.match(html, /<!DOCTYPE html>/);
    }
  });
});
