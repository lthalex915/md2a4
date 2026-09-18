import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { compile } from "../compiler/index.ts";
import { applyPatches, fixNotesLocal, isSafePatch } from "./fidelity-copilot.ts";
import { DEFAULT_LLM_SETTINGS, enabledAiFeatures } from "./llm-settings.ts";

describe("fidelity copilot local", () => {
  it("strips emoji so validation no longer reports emoji", () => {
    const src = "Hello 😀 world from the notes.\n";
    const { issues } = compile(src, "classic");
    assert.ok(issues.some((i) => i.code === "emoji"));
    const { markdown, summaries } = fixNotesLocal(src, issues);
    assert.equal(markdown.includes("😀"), false);
    assert.match(markdown, /Hello\s+world from the notes/);
    assert.ok(summaries.some((s) => /emoji/i.test(s)));
    assert.equal(
      compile(markdown, "classic").issues.some((i) => i.code === "emoji"),
      false,
    );
  });

  it("repairs spaced $ math so dollar-math clears", () => {
    const src = "Energy is $ E = mc^2 $ in the notes.\n";
    const { issues } = compile(src, "classic");
    assert.ok(issues.some((i) => i.code === "dollar-math"));
    const { markdown } = fixNotesLocal(src, issues);
    assert.match(markdown, /\$E = mc\^2\$/);
    assert.equal(
      compile(markdown, "classic").issues.filter((i) => i.code === "dollar-math").length,
      0,
    );
  });

  it("closes a short unclosed formula but not currency $100", () => {
    const src = "Take $F_net\nThe kit costs $100.\n";
    const { markdown } = fixNotesLocal(src, [{ code: "dollar-math", message: "leftover $" }]);
    assert.match(markdown, /\$F_\{net\}\$/);
    assert.match(markdown, /\$100/);
    assert.doesNotMatch(markdown, /\$100\$/);
  });

  it("does not swallow the rest of a sentence into math", () => {
    const src = "Energy is $E=mc^2 in the notes.\n";
    const { markdown } = fixNotesLocal(src, [{ code: "dollar-math", message: "leftover $" }]);
    assert.equal(markdown, src);
  });
});

describe("fidelity copilot patches", () => {
  it("rejects invented sentences", () => {
    const src = "Ohm's law relates voltage.\n";
    const { n, markdown } = applyPatches(src, [
      { from: "voltage.", to: "voltage. In conclusion, study hard every night." },
    ]);
    assert.equal(n, 0);
    assert.equal(markdown, src);
    assert.equal(
      isSafePatch("voltage.", "voltage. In conclusion, study hard every night.", src),
      false,
    );
  });

  it("allows delimiter-only edits", () => {
    const src = "Use $ E = mc^2 $\n";
    const { n, markdown } = applyPatches(src, [{ from: "$ E = mc^2 $", to: "$E=mc^2$" }]);
    assert.equal(n, 1);
    assert.equal(markdown, "Use $E=mc^2$\n");
  });

  it("does not cap patch length", () => {
    const block = "a".repeat(500);
    const src = `Start ${block} end\n`;
    const { n, markdown } = applyPatches(src, [{ from: block, to: `$${block}$` }]);
    assert.equal(n, 1);
    assert.equal(markdown, `Start $${block}$ end\n`);
  });
});

describe("BYOK invariant", () => {
  it("defaults fidelity copilot off with the other AI features", () => {
    assert.equal(DEFAULT_LLM_SETTINGS.features.fidelity, false);
    assert.deepEqual(enabledAiFeatures(DEFAULT_LLM_SETTINGS), []);
  });

  it("llm proxy never reads process.env for a platform key", () => {
    const raw = fs.readFileSync(fileURLToPath(new URL("./llm-proxy.ts", import.meta.url)), "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /process\.env/);
    assert.doesNotMatch(src, /XAI_API_KEY/);
    assert.match(src, /data\?\.apiKey/);
    assert.doesNotMatch(src, /MAX_MESSAGE_CHARS/);
  });
});
