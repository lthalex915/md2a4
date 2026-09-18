export type LlmProviderId =
  | "openai"
  | "openrouter"
  | "deepseek"
  | "xai"
  | "groq"
  | "mistral"
  | "together"
  | "compat";

export type AiFeatureId = "structure" | "frontMatter" | "math" | "import" | "fidelity";

export type LlmSettings = {
  provider: LlmProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  features: Record<AiFeatureId, boolean>;
};

/** Official DeepSeek API id for V4.1 Flash. */
export const DEEPSEEK_FLASH_MODEL = "deepseek-flash";
/** OpenRouter slug for the same model. */
export const OPENROUTER_DEEPSEEK_FLASH_MODEL = "deepseek/deepseek-v4.1-flash";

const DEEPSEEK_API_ALIASES = new Set([
  "deepseek-chat",
  "deepseek-reasoner",
  "deepseek-v4-flash",
  "deepseek-v4-flash-vision-exp",
  "deepseek-v4.1-flash",
  "deepseek-v4-1-flash",
]);

const OPENROUTER_DEEPSEEK_ALIASES = new Set([
  "deepseek/deepseek-chat",
  "deepseek/deepseek-reasoner",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-flash-0731",
  "deepseek/deepseek-v4-flash-vision-exp",
  "deepseek/deepseek-flash",
]);

export function canonicalModel(provider: LlmProviderId, model: string): string {
  const m = model.trim();
  if (provider === "deepseek") {
    if (!m || DEEPSEEK_API_ALIASES.has(m)) return DEEPSEEK_FLASH_MODEL;
    return m;
  }
  if (provider === "openrouter" && OPENROUTER_DEEPSEEK_ALIASES.has(m)) {
    return OPENROUTER_DEEPSEEK_FLASH_MODEL;
  }
  return m;
}

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
    model: OPENROUTER_DEEPSEEK_FLASH_MODEL,
    hint: "Default model is DeepSeek V4.1 Flash. Thinking is turned off so the model answers in JSON, not a chain-of-thought.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: DEEPSEEK_FLASH_MODEL,
    hint: "DeepSeek V4.1 Flash (deepseek-flash). The app disables thinking mode so replies are JSON, not a long chain-of-thought.",
  },
  {
    id: "xai",
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-3-mini",
    hint: "Your xAI key. Prefer a mini model. This app never uses a built-in xAI key.",
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
    detail: "Wrap titled lists the local rules missed. The model sees the full notes.",
  },
  {
    id: "frontMatter",
    label: "Front matter",
    detail: "Copy title and chapter number from the notes if heuristics missed them.",
  },
  {
    id: "math",
    label: "Math delimiters",
    detail: "Repair leftover $ math delimiters in the full notes. Currency like $100 is kept.",
  },
  {
    id: "import",
    label: "Paste cleanup",
    detail: "Strip leftover HTML tags after the local converter. The model sees the full notes.",
  },
  {
    id: "fidelity",
    label: "Fidelity copilot",
    detail: "After Compile, edit the notes so validation errors clear. Never invents sentences.",
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
    fidelity: false,
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
      model: canonicalModel(provider, String(parsed.model || preset.model)),
      apiKey: String(parsed.apiKey || ""),
      features: {
        structure: Boolean(parsed.features?.structure),
        frontMatter: Boolean(parsed.features?.frontMatter),
        math: Boolean(parsed.features?.math),
        import: Boolean(parsed.features?.import),
        fidelity: Boolean(parsed.features?.fidelity),
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
    model: canonicalModel(id, preset.model || settings.model),
  };
}

export function enabledAiFeatures(settings: LlmSettings): AiFeatureId[] {
  return AI_FEATURES.map((f) => f.id).filter((id) => settings.features[id]);
}

export function hasLlmKey(settings: LlmSettings): boolean {
  return Boolean(settings.apiKey.trim() && settings.baseUrl.trim() && settings.model.trim());
}
