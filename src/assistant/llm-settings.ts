export type LlmProviderId =
  | "openai"
  | "openrouter"
  | "deepseek"
  | "xai"
  | "groq"
  | "mistral"
  | "together"
  | "compat";

export type AiFeatureId = "structure" | "frontMatter" | "math" | "import";

export type LlmSettings = {
  provider: LlmProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  features: Record<AiFeatureId, boolean>;
};

export const LLM_PROVIDERS: {
  id: LlmProviderId;
  label: string;
  baseUrl: string;
  model: string;
  hint: string;
}[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hint: "Cheap classifier. Use gpt-4o-mini unless you need otherwise.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    hint: "One key, many models. Keep the model id cheap.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    hint: "OpenAI-compatible. deepseek-chat is enough for these tasks.",
  },
  {
    id: "xai",
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-3-mini",
    hint: "Your xAI key. Prefer a mini model for prepare.",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
    hint: "Fast OpenAI-compatible endpoint.",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
    hint: "OpenAI-compatible. Small models only.",
  },
  {
    id: "together",
    label: "Together",
    baseUrl: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3.2-3B-Instruct-Turbo",
    hint: "OpenAI-compatible.",
  },
  {
    id: "compat",
    label: "OpenAI compatible",
    baseUrl: "",
    model: "",
    hint: "Any https /v1 chat-completions endpoint (Ollama via a public HTTPS proxy, Azure-compatible, etc.).",
  },
];

export const AI_FEATURES: { id: AiFeatureId; label: string; detail: string }[] = [
  {
    id: "structure",
    label: "Structure hints",
    detail: "Classify a few short titles in front of lists (list / aside / skip). Heuristics still wrap bold titles.",
  },
  {
    id: "frontMatter",
    label: "Front matter",
    detail: "Copy title and chapter number from the first lines if heuristics missed them.",
  },
  {
    id: "math",
    label: "Math delimiters",
    detail: "Classify leftover unmatched $ lines as math or currency. No formula rewrites.",
  },
  {
    id: "import",
    label: "Paste cleanup",
    detail: "Only if leftover HTML tags remain after the local converter.",
  },
];

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKey: "",
  features: {
    structure: false,
    frontMatter: false,
    math: false,
    import: false,
  },
};

const STORAGE = "md2a4.llm";

function isProvider(v: string): v is LlmProviderId {
  return LLM_PROVIDERS.some((p) => p.id === v);
}

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return { ...DEFAULT_LLM_SETTINGS, features: { ...DEFAULT_LLM_SETTINGS.features } };
    const parsed = JSON.parse(raw) as Partial<LlmSettings>;
    const rawProvider = String(parsed.provider || "openai");
    const provider: LlmProviderId = isProvider(rawProvider) ? rawProvider : "openai";
    const preset = LLM_PROVIDERS.find((p) => p.id === provider) ?? LLM_PROVIDERS[0];
    return {
      provider,
      baseUrl: String(parsed.baseUrl || preset.baseUrl),
      model: String(parsed.model || preset.model),
      apiKey: String(parsed.apiKey || ""),
      features: {
        structure: Boolean(parsed.features?.structure),
        frontMatter: Boolean(parsed.features?.frontMatter),
        math: Boolean(parsed.features?.math),
        import: Boolean(parsed.features?.import),
      },
    };
  } catch {
    return { ...DEFAULT_LLM_SETTINGS, features: { ...DEFAULT_LLM_SETTINGS.features } };
  }
}

export function saveLlmSettings(settings: LlmSettings): void {
  localStorage.setItem(STORAGE, JSON.stringify(settings));
}

export function applyProvider(settings: LlmSettings, id: LlmProviderId): LlmSettings {
  const preset = LLM_PROVIDERS.find((p) => p.id === id) ?? LLM_PROVIDERS[0];
  return {
    ...settings,
    provider: id,
    baseUrl: preset.baseUrl || settings.baseUrl,
    model: preset.model || settings.model,
  };
}

export function enabledAiFeatures(settings: LlmSettings): AiFeatureId[] {
  return AI_FEATURES.map((f) => f.id).filter((id) => settings.features[id]);
}

export function hasLlmKey(settings: LlmSettings): boolean {
  return Boolean(settings.apiKey.trim() && settings.baseUrl.trim() && settings.model.trim());
}
