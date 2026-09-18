/** Strip DeepSeek / R1 think blocks so JSON mode leftovers still parse. */
export function unwrapModelText(text: string): string {
  return String(text ?? "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:thinking|reasoning)[\s\S]*?```/gi, "")
    .trim();
}

/** Pull a JSON object/array out of a model reply (raw or fenced). */
export function parseModelJson(text: string): unknown | null {
  const raw = unwrapModelText(text);
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : raw;
  const start = body.search(/[{[]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function takeMd(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const md = (json as { md?: unknown }).md;
  return typeof md === "string" && md.length ? md : null;
}
