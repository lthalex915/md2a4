import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { llmChat } from "@/assistant/llm-proxy";
import {
  AI_FEATURES,
  LLM_PROVIDERS,
  applyProvider,
  hasLlmKey,
  type LlmProviderId,
  type LlmSettings,
} from "@/assistant/llm-settings";

type Props = {
  settings: LlmSettings;
  onChange: (next: LlmSettings) => void;
  onClose: () => void;
};

export function LlmSettingsPanel({ settings, onChange, onClose }: Props) {
  const titleId = useId();
  const [showKey, setShowKey] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (patch: Partial<LlmSettings>) => onChange({ ...settings, ...patch });

  const test = async () => {
    setTesting(true);
    setTestMsg(null);
    const res = await llmChat({
      data: {
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        maxTokens: 4,
        messages: [{ role: "user", content: "Reply with pong" }],
      },
    }).catch(() => ({ ok: false as const, error: "Request failed." }));
    setTesting(false);
    if (res.ok) setTestMsg("Connection ok.");
    else setTestMsg(res.error);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        aria-label="Close AI setup"
        className="absolute inset-0 bg-bg/70"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-auto rounded-lg border border-border bg-surface p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      >
        <p id={titleId} className="font-display text-xl text-fg">
          AI setup
        </p>
        <p className="mt-1 text-sm text-muted">
          Your key stays in this browser. Prepare still runs locally; AI only does tiny
          classification jobs when a feature is on.
        </p>

        <label className="mt-4 block text-sm text-muted">
          Provider
          <select
            value={settings.provider}
            onChange={(e) => set(applyProvider(settings, e.target.value as LlmProviderId))}
            className="mt-1 h-11 w-full rounded-sm border border-border bg-bg px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {LLM_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-xs text-subtle">
          {LLM_PROVIDERS.find((p) => p.id === settings.provider)?.hint}
        </p>

        <label className="mt-3 block text-sm text-muted">
          Base URL
          <input
            value={settings.baseUrl}
            onChange={(e) => set({ baseUrl: e.target.value })}
            spellCheck={false}
            placeholder="https://api.example.com/v1"
            className="mt-1 h-11 w-full rounded-sm border border-border bg-bg px-3 font-mono text-sm text-fg placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="mt-3 block text-sm text-muted">
          Model
          <input
            value={settings.model}
            onChange={(e) => set({ model: e.target.value })}
            spellCheck={false}
            placeholder="gpt-4o-mini"
            className="mt-1 h-11 w-full rounded-sm border border-border bg-bg px-3 font-mono text-sm text-fg placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="mt-3 block text-sm text-muted">
          API key
          <div className="mt-1 flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={settings.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
              spellCheck={false}
              autoComplete="off"
              placeholder="sk-…"
              className="h-11 min-w-0 flex-1 rounded-sm border border-border bg-bg px-3 font-mono text-sm text-fg placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="button" variant="secondary" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "Hide" : "Show"}
            </Button>
          </div>
        </label>

        <p className="mt-5 text-sm font-medium text-fg">Features</p>
        <p className="text-xs text-muted">Off by default. Heuristics still run either way.</p>
        <ul className="mt-2 space-y-2">
          {AI_FEATURES.map((f) => (
            <li key={f.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-sm py-1">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-accent"
                  checked={settings.features[f.id]}
                  onChange={(e) =>
                    set({
                      features: { ...settings.features, [f.id]: e.target.checked },
                    })
                  }
                />
                <span>
                  <span className="block text-sm text-fg">{f.label}</span>
                  <span className="block text-xs text-muted">{f.detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => void test()} disabled={testing || !hasLlmKey(settings)}>
            {testing ? "Testing…" : "Test connection"}
          </Button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
        {testMsg ? <p className="mt-2 text-sm text-muted">{testMsg}</p> : null}
      </div>
    </div>
  );
}
