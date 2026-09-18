import { createServerFn } from "@tanstack/react-start";
import { chatCompletionsUrl } from "./llm-url.ts";

const MAX_MESSAGE_CHARS = 2500;
const PING_TIMEOUT_MS = 20_000;
const TASK_TIMEOUT_MS = 120_000;

export type LlmChatInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  /** Only for pings. Omit on real tasks so the provider does not cut the reply short. */
  maxTokens?: number;
  /** Ask for a JSON object (default on tasks). Pings should set this false. */
  json?: boolean;
};

export type LlmChatResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export function isDeepSeekTarget(model: string, url = ""): boolean {
  const m = model.toLowerCase();
  const u = url.toLowerCase();
  return m.includes("deepseek") || u.includes("deepseek.com");
}

export function chatCompletionsBody(input: {
  model: string;
  messages: { role: string; content: string }[];
  maxTokens?: number;
  json?: boolean;
  url?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    temperature: 0,
    messages: input.messages,
  };
  if (typeof input.maxTokens === "number" && Number.isFinite(input.maxTokens) && input.maxTokens > 0) {
    body.max_tokens = Math.floor(input.maxTokens);
  }

  const url = input.url ?? "";
  const deepseek = isDeepSeekTarget(input.model, url);
  if (deepseek) {
    // V4.1 Flash thinks at high effort by default. That burns tokens and
    // wraps JSON in a chain-of-thought — disable it for these tiny jobs.
    body.thinking = { type: "disabled" };
    body.reasoning_effort = "none";
    if (url.includes("openrouter.ai")) {
      body.reasoning = { effort: "none" };
    }
    if (input.json) {
      body.response_format = { type: "json_object" };
    }
  }
  return body;
}

/**
 * Forward a tiny chat-completions call using **only** the key the user typed
 * in AI setup. This must never read `process.env.XAI_API_KEY`,
 * `OPENAI_API_KEY`, or any other platform/owner secret.
 *
 * Output tokens are uncapped unless the caller passes `maxTokens` (used only
 * by Test connection). Prompt size stays bounded.
 */
export const llmChat = createServerFn({ method: "POST" })
  .validator((d: LlmChatInput) => d)
  .handler(async ({ data }): Promise<LlmChatResult> => {
    const apiKey = String(data?.apiKey ?? "").trim();
    const model = String(data?.model ?? "").trim();
    if (!apiKey) return { ok: false, error: "Add an API key in AI setup." };
    if (!model) return { ok: false, error: "Add a model id in AI setup." };
    if (apiKey.length > 512) return { ok: false, error: "API key looks invalid." };

    let url: string;
    try {
      url = chatCompletionsUrl(String(data?.baseUrl ?? ""));
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Invalid API URL." };
    }

    const messages = Array.isArray(data?.messages) ? data.messages.slice(0, 3) : [];
    const compact = messages.map((m) => ({
      role: m.role === "system" ? "system" : "user",
      content: String(m.content ?? "").slice(0, MAX_MESSAGE_CHARS),
    }));
    if (!compact.some((m) => m.content.trim())) {
      return { ok: false, error: "Nothing to send to the model." };
    }

    const requested = Number(data?.maxTokens);
    const maxTokens =
      data?.maxTokens != null && Number.isFinite(requested) && requested > 0
        ? Math.floor(requested)
        : undefined;
    const json = data?.json ?? maxTokens == null;
    const body = chatCompletionsBody({
      model,
      messages: compact,
      maxTokens,
      json,
      url,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    if (url.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "https://github.com/lthalex915/md2a4";
      headers["X-Title"] = "md2a4";
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(maxTokens != null ? PING_TIMEOUT_MS : TASK_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, error: "The model request timed out." };
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "API key was rejected. Check the key and provider." };
      }
      return { ok: false, error: `Model request failed (${res.status}).` };
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  });
