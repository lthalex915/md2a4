/** Allowlisted OpenAI-compatible hosts, plus https public hosts for custom endpoints. */

const ALLOWED_HOSTS = new Set([
  "api.openai.com",
  "openrouter.ai",
  "api.openrouter.ai",
  "api.deepseek.com",
  "api.x.ai",
  "api.groq.com",
  "api.mistral.ai",
  "api.together.xyz",
  "api.fireworks.ai",
  "api.moonshot.ai",
  "api.moonshot.cn",
  "dashscope.aliyuncs.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
]);

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0 || a === 255) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isBlockedHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  if (isPrivateIPv4(h)) return true;
  return false;
}

export function assertSafeBaseUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("API base URL is missing.");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("API base URL is not valid.");
  }
  if (url.protocol !== "https:") throw new Error("API base URL must be https.");
  if (url.username || url.password) throw new Error("API base URL must not include credentials.");
  const host = url.hostname.toLowerCase();
  if (isBlockedHost(host)) throw new Error("That API host is not allowed.");
  if (ALLOWED_HOSTS.has(host)) return url;
  if (!host.includes(".")) throw new Error("That API host is not allowed.");
  if (/^\d/.test(host)) throw new Error("That API host is not allowed.");
  return url;
}

export function chatCompletionsUrl(baseUrl: string): string {
  const url = assertSafeBaseUrl(baseUrl);
  let path = url.pathname.replace(/\/+$/, "");
  if (!path) path = "/v1";
  if (!/\/chat\/completions$/i.test(path)) path += "/chat/completions";
  return `${url.origin}${path}${url.search}`;
}
