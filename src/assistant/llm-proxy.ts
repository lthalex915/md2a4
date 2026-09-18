import { createServerFn } from "@tanstack/react-start";
import { chatCompletionsUrl } from "./llm-url.ts";

const MAX_MESSAGE_CHARS = 2500;
const MAX_TOKENS = 160;

export type LlmChatInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  maxTokens?: number;
};

export type LlmChatResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

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

    const maxTokens = Math.max(4, Math.min(MAX_TOKENS, Number(data?.maxTokens) || 80));
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
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens,
          messages: compact,
        }),
        signal: AbortSignal.timeout(20_000),
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

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  });
