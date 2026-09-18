import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeBaseUrl, chatCompletionsUrl, isBlockedHost } from "./llm-url.ts";
import { applyProvider, canonicalModel, DEFAULT_LLM_SETTINGS, enabledAiFeatures } from "./llm-settings.ts";
import { collectStructureCandidates } from "./structure.ts";
import { chatCompletionsBody, isDeepSeekTarget } from "./llm-proxy.ts";
import { parseModelJson } from "./json.ts";

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
  it("fills DeepSeek V4.1 Flash on the official API", () => {
    const next = applyProvider(DEFAULT_LLM_SETTINGS, "deepseek");
    assert.equal(next.provider, "deepseek");
    assert.match(next.baseUrl, /deepseek/);
    assert.equal(next.model, "deepseek-flash");
  });

  it("fills DeepSeek V4.1 Flash on OpenRouter", () => {
    const next = applyProvider(DEFAULT_LLM_SETTINGS, "openrouter");
    assert.equal(next.model, "deepseek/deepseek-v4.1-flash");
    assert.match(next.baseUrl, /openrouter/);
  });

  it("rewrites retired DeepSeek ids to V4.1 Flash", () => {
    assert.equal(canonicalModel("deepseek", "deepseek-chat"), "deepseek-flash");
    assert.equal(canonicalModel("deepseek", "deepseek-v4-flash"), "deepseek-flash");
    assert.equal(
      canonicalModel("openrouter", "deepseek/deepseek-v4-flash"),
      "deepseek/deepseek-v4.1-flash",
    );
  });

  it("defaults every AI feature to off", () => {
    assert.deepEqual(enabledAiFeatures(DEFAULT_LLM_SETTINGS), []);
  });
});

describe("chat completions body", () => {
  it("omits max_tokens so task replies are not truncated", () => {
    const body = chatCompletionsBody({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal("max_tokens" in body, false);
    assert.equal(body.model, "gpt-4o-mini");
    assert.equal("thinking" in body, false);
  });

  it("sends max_tokens only when the caller asks (connection ping)", () => {
    const body = chatCompletionsBody({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "pong" }],
      maxTokens: 4,
    });
    assert.equal(body.max_tokens, 4);
  });

  it("disables thinking and uses JSON mode on DeepSeek API V4.1 Flash", () => {
    assert.equal(isDeepSeekTarget("deepseek-flash", "https://api.deepseek.com/v1/chat/completions"), true);
    const body = chatCompletionsBody({
      model: "deepseek-flash",
      url: "https://api.deepseek.com/v1/chat/completions",
      json: true,
      messages: [{ role: "user", content: "JSON {\"ok\":true}" }],
    });
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(body.reasoning_effort, "none");
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal("max_tokens" in body, false);
    assert.equal("reasoning" in body, false);
  });

  it("disables OpenRouter reasoning for DeepSeek V4.1 Flash", () => {
    const body = chatCompletionsBody({
      model: "deepseek/deepseek-v4.1-flash",
      url: "https://openrouter.ai/api/v1/chat/completions",
      json: true,
      messages: [{ role: "user", content: "JSON {\"ok\":true}" }],
    });
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(body.reasoning_effort, "none");
    assert.deepEqual(body.reasoning, { effort: "none" });
    assert.deepEqual(body.response_format, { type: "json_object" });
  });

  it("does not force JSON mode on a DeepSeek ping", () => {
    const body = chatCompletionsBody({
      model: "deepseek-flash",
      url: "https://api.deepseek.com/v1/chat/completions",
      json: false,
      maxTokens: 4,
      messages: [{ role: "user", content: "pong" }],
    });
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal("response_format" in body, false);
  });
});

describe("parseModelJson", () => {
  it("strips DeepSeek think blocks before parsing", () => {
    const json = parseModelJson('<think>plan the answer</think>\n{"md":"Keep this"}');
    assert.deepEqual(json, { md: "Keep this" });
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
