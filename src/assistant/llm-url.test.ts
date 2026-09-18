import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeBaseUrl, chatCompletionsUrl, isBlockedHost } from "./llm-url.ts";
import { applyProvider, DEFAULT_LLM_SETTINGS, enabledAiFeatures } from "./llm-settings.ts";
import { collectStructureCandidates } from "./structure.ts";

describe("llm url safety", () => {
  it("allows known https providers and appends chat/completions", () => {
    assert.equal(
      chatCompletionsUrl("https://api.openai.com/v1"),
      "https://api.openai.com/v1/chat/completions",
    );
    assert.equal(
      chatCompletionsUrl("https://openrouter.ai/api/v1/"),
      "https://openrouter.ai/api/v1/chat/completions",
    );
  });

  it("blocks localhost, private IPs, and http", () => {
    assert.equal(isBlockedHost("localhost"), true);
    assert.equal(isBlockedHost("127.0.0.1"), true);
    assert.equal(isBlockedHost("192.168.1.5"), true);
    assert.equal(isBlockedHost("10.0.0.2"), true);
    assert.throws(() => assertSafeBaseUrl("http://api.openai.com/v1"));
    assert.throws(() => assertSafeBaseUrl("https://localhost/v1"));
    assert.throws(() => assertSafeBaseUrl("https://169.254.169.254/"));
  });
});

describe("llm settings", () => {
  it("fills a preset when the provider changes", () => {
    const next = applyProvider(DEFAULT_LLM_SETTINGS, "deepseek");
    assert.equal(next.provider, "deepseek");
    assert.match(next.baseUrl, /deepseek/);
    assert.equal(next.model, "deepseek-chat");
  });

  it("defaults every AI feature to off", () => {
    assert.deepEqual(enabledAiFeatures(DEFAULT_LLM_SETTINGS), []);
  });
});

describe("structure candidates", () => {
  it("skips bold titles (already handled) and keeps a short plain title", () => {
    const md = [
      "**Properties**",
      "",
      "- already wrapped by heuristics if prepared",
      "",
      "Lab setup",
      "",
      "- item one",
      "- item two",
    ].join("\n");
    const cands = collectStructureCandidates(md);
    assert.equal(
      cands.some((c) => c.title === "Lab setup"),
      true,
    );
    assert.equal(
      cands.some((c) => c.title === "Properties"),
      false,
    );
  });
});
