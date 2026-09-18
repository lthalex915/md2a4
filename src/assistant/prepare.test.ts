import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dialectImport, htmlToMarkdown } from "./normalize.ts";
import { collectOddDollarLines, repairMath } from "./math-repair.ts";
import { collectStructureCandidates, proposeStructure } from "./structure.ts";
import { proposeFrontMatter } from "./front-matter.ts";
import { isFaithful } from "./fidelity.ts";
import { prepareLocal } from "./prepare.ts";

describe("dialect import", () => {
  it("converts Word-like HTML to Markdown without adding sentences", () => {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>
      <h1>Lecture 4</h1>
      <p class="MsoNormal">Ohm&rsquo;s law relates <b>voltage</b>.</p>
      <p class="MsoNormal">• first fact</p>
      <table><tr><td>Kit</td><td>$100</td></tr><tr><td>Book</td><td>$20</td></tr></table>
    </body></html>`;
    const md = htmlToMarkdown(html);
    assert.match(md, /^# Lecture 4/m);
    assert.match(md, /Ohm's law relates \*\*voltage\*\*/);
    assert.match(md, /^- first fact/m);
    assert.match(md, /\| Kit \| \$100 \|/);
    assert.doesNotMatch(md, /learning objective|key takeaway|in conclusion/i);
  });

  it("turns bullet glyphs into lists on plain paste", () => {
    const md = dialectImport("Intro line\n• alpha\n• beta\n");
    assert.match(md, /^- alpha/m);
    assert.match(md, /^- beta/m);
  });
});

describe("math repair", () => {
  it("wraps align environments in $$", () => {
    const out = repairMath("See\n\\begin{align} a &= b \\\\ c &= d \\end{align}\n");
    assert.match(out, /\$\$\s*\\begin\{align\}/);
    assert.match(out, /\\end\{align\}\s*\$\$/);
  });

  it("trims spaced $...$ when the inner is TeX, not currency", () => {
    const out = repairMath("Use $ E = mc^2 $ and $ 3.50 stays.");
    assert.match(out, /\$E = mc\^2\$/);
    assert.match(out, /\$ 3\.50 stays/);
  });

  it("adds braces to F_net inside math", () => {
    const out = repairMath("Force $F_net = ma$.");
    assert.match(out, /\$F_\{net\} = ma\$/);
  });

  it("collects every odd-dollar line, not a short prefix", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `Take $F_${i} leftover on this long formula line ${"x".repeat(160)}`);
    const odd = collectOddDollarLines(lines.join("\n"));
    assert.equal(odd.length, 12);
    assert.ok(odd.every((l) => l.length > 140));
  });
});

describe("structure", () => {
  it("wraps a bold title plus list as :::list", () => {
    const src = "**Properties from source**\n\n- The relation is exact\n- Currency is text\n";
    const out = proposeStructure(src);
    assert.match(out, /:::list title="Properties from source"/);
    assert.match(out, /- The relation is exact/);
    assert.match(out, /:::/);
  });

  it("wraps Key Points plus bullets as :::aside", () => {
    const src = "## 2.1 Energy {#energy}\n\n**Key Points**\n\n- Energy and mass are interchangeable\n";
    const out = proposeStructure(src);
    assert.match(out, /:::aside anchor=energy kind=takeaway title="Key Points"/);
    assert.match(out, /- Energy and mass are interchangeable/);
  });

  it("wraps two term lines as :::terms", () => {
    const src = "**Voltage.** Electric potential difference.\n**Current.** Flow of charge.\n";
    const out = proposeStructure(src);
    assert.match(out, /:::terms/);
    assert.match(out, /\*\*Voltage\.\*\*/);
  });

  it("does not wrap a bare list", () => {
    const src = "A sentence.\n\n- just a list\n- still a list\n";
    const out = proposeStructure(src);
    assert.doesNotMatch(out, /:::/);
  });

  it("collects every leftover titled list, not a cap of eight", () => {
    const chunks = Array.from({ length: 12 }, (_, i) => `Topic ${i}\n\n- item ${i}\n`);
    const cands = collectStructureCandidates(chunks.join("\n"));
    assert.equal(cands.length, 12);
  });
});

describe("front matter", () => {
  it("takes title from H1 and chapter from a Chapter line", () => {
    const src = "Chapter 4\n\n# Energy and circuits\n\nA paragraph.\n";
    const out = proposeFrontMatter(src);
    assert.match(out, /^---\n/);
    assert.match(out, /title: Energy and circuits/);
    assert.match(out, /chapter: 4/);
    assert.match(out, /A paragraph/);
  });

  it("does not invent header_left", () => {
    const src = "# Notes\n\nHello.\n";
    const out = proposeFrontMatter(src);
    assert.doesNotMatch(out, /header_left/);
  });
});

describe("fidelity", () => {
  it("accepts wrapping and rejects a new sentence", () => {
    const src = "**Properties**\n- already here\n";
    const wrapped = ":::list title=\"Properties\"\n- already here\n:::\n";
    assert.equal(isFaithful(src, wrapped).ok, true);
    const invented = `${src}\nThis is a brand new conclusion about cats.\n`;
    assert.equal(isFaithful(src, invented).ok, false);
  });
});

describe("prepareLocal", () => {
  it("does not label plain Markdown as a Word import", () => {
    const { changes } = prepareLocal("# Title\n\nHello.\n");
    assert.equal(changes.some((c) => c.kind === "import"), false);
  });

  it("runs import, math, structure, and front matter together", () => {
    const src = [
      "Chapter 2",
      "",
      "# Sample notes",
      "",
      "Mass $ E = mc^2 $ and $F_net$.",
      "",
      "**Properties from source**",
      "",
      "- The relation is exact",
      "",
      "**Key Points**",
      "",
      "- Currency is not math",
    ].join("\n");
    const { markdown, changes } = prepareLocal(src);
    assert.ok(changes.some((c) => c.kind === "math"));
    assert.ok(changes.some((c) => c.kind === "structure"));
    assert.ok(changes.some((c) => c.kind === "front-matter"));
    assert.match(markdown, /title: Sample notes/);
    assert.match(markdown, /\$E = mc\^2\$/);
    assert.match(markdown, /:::list title="Properties from source"/);
    assert.match(markdown, /:::aside/);
    assert.doesNotMatch(markdown, /learning objectives/i);
  });
});
