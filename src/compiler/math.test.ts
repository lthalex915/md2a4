import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractMath, isCurrencyDollar } from "./math.ts";
import { compile } from "./index.ts";

describe("currency vs math", () => {
  it("treats unpaired $100 and $ 3.50 as currency", () => {
    assert.equal(isCurrencyDollar("$100", 0), true);
    assert.equal(isCurrencyDollar("$ 3.50", 0), true);
    assert.equal(isCurrencyDollar("$E=mc^2$", 0), false);
    assert.equal(isCurrencyDollar("$1$", 0), false);
    assert.equal(isCurrencyDollar("$1 + 2$", 0), false);
  });

  it("extracts inline math and leaves currency", () => {
    const { text, slots } = extractMath("$E=mc^2$ and costs $100");
    assert.equal(slots.length, 1);
    assert.equal(slots[0]?.kind, "inline");
    assert.equal(slots[0]?.tex, "E=mc^2");
    assert.match(text, /and costs \$100/);
    assert.doesNotMatch(text, /\$E=mc\^2\$/);
  });

  it("does not pair $100 with a later $formula$ on the same line", () => {
    const { text, slots } = extractMath("The kit costs $100 and the energy is $E=mc^2$.");
    assert.equal(slots.length, 1);
    assert.equal(slots[0]?.tex, "E=mc^2");
    assert.match(text, /\$100/);
    assert.match(text, /costs \$100 and the energy is @@MATH0@@/);
  });

  it("treats $1$ and $1 + 2$ as math, not currency", () => {
    const { slots } = extractMath("Take $1$ and $1 + 2$ from $20.");
    assert.equal(slots.length, 2);
    assert.equal(slots[0]?.tex, "1");
    assert.equal(slots[1]?.tex, "1 + 2");
  });

  it("extracts $2^n$ even though TeX starts with a digit", () => {
    const { slots } = extractMath("$2^n$ plus $3.14$");
    assert.equal(slots.length, 2);
    assert.equal(slots[0]?.tex, "2^n");
    assert.equal(slots[1]?.tex, "3.14");
  });

  it("does not pair currency across table cells or rows", () => {
    const src = "| Kit | $100 |\n| Book | $20 |\n";
    const { slots, text } = extractMath(src);
    assert.equal(slots.length, 0);
    assert.match(text, /\$100/);
    assert.match(text, /\$20/);
  });

  it("keeps | inside TeX as math", () => {
    const { slots } = extractMath("Norm $|x|$ and chance $P(A|B)$.");
    assert.equal(slots.length, 2);
    assert.equal(slots[0]?.tex, "|x|");
    assert.equal(slots[1]?.tex, "P(A|B)");
  });

  it("does not treat US$100 as math", () => {
    const { slots, text } = extractMath("US$100 and A$50 stay money.");
    assert.equal(slots.length, 0);
    assert.match(text, /US\$100/);
    assert.match(text, /A\$50/);
  });

  it("ignores escaped \\$ and still finds $x$", () => {
    const { slots, text } = extractMath("escaped \\$notmath and $x$");
    assert.equal(slots.length, 1);
    assert.equal(slots[0]?.tex, "x");
    assert.match(text, /\\\$notmath/);
  });

  it("extracts several short formulas on one line", () => {
    const { slots } = extractMath("where $a$, $b$, and $c$ are real");
    assert.equal(slots.map((s) => s.tex).join(","), "a,b,c");
  });

  it("extracts display math with number", () => {
    const { slots } = extractMath("$$ E = mc^2 $$ (4.1)");
    assert.equal(slots[0]?.kind, "display");
    assert.equal(slots[0]?.tex, "E = mc^2");
    assert.equal(slots[0]?.number, "4.1");
  });

  it("extracts fenced math blocks", () => {
    const { slots } = extractMath("```math\nx^2\n```\n");
    assert.equal(slots[0]?.kind, "display");
    assert.equal(slots[0]?.tex, "x^2");
  });

  it("preserves already-written \\( \\) delimiters", () => {
    const { slots } = extractMath("Already \\(x+1\\) in source.");
    assert.equal(slots[0]?.kind, "inline");
    assert.equal(slots[0]?.tex, "x+1");
  });
});

describe("compile math into HTML", () => {
  it("puts heading math into \\( \\) not placeholders", () => {
    const { html } = compile("## 4.1 Energy $E=mc^2$\n\nHello $x$.\n", "classic");
    assert.match(html, /\\\(E=mc\^2\\\)/);
    assert.doesNotMatch(html, /@@MATH/);
    assert.match(html, /\\\(x\\\)/);
  });

  it("keeps $1$ as math in tables and $100 as currency", () => {
    const src = "| $x$ | cost |\n| --- | --- |\n| $1$ | $100 |\n";
    const { html } = compile(src, "classic");
    assert.match(html, /\\\(x\\\)/);
    assert.match(html, /\\\(1\\\)/);
    assert.match(html, /\$100/);
    assert.doesNotMatch(html, /\$1\$/);
  });

  it("converts $...$ after a currency amount on the same line", () => {
    const src = "The kit costs $100 and the energy is $E=mc^2$.\n";
    const { html, issues } = compile(src, "classic");
    assert.match(html, /\$100/);
    assert.match(html, /\\\(E=mc\^2\\\)/);
    assert.doesNotMatch(html, /\$E=mc\^2\$/);
    assert.doesNotMatch(html, /\\\(100 and the energy is\\\)/);
    const mathIssues = issues.filter((i) => i.code === "dollar-math");
    assert.equal(mathIssues.length, 0, mathIssues.map((i) => i.message).join("\n"));
  });

  it("keeps underscores inside $...$ (does not italicize TeX)", () => {
    const { html } = compile("Force $F_{net} = ma$.\n", "classic");
    assert.match(html, /\\\(F_\{net\} = ma\\\)/);
    assert.doesNotMatch(html, /<em>/);
  });
});
