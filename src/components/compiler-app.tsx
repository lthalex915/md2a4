import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import {
  AlertCircle,
  Check,
  Download,
  FileUp,
  Printer,
  BookOpen,
  Wand2,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PreparePanel, emptyKinds } from "@/components/prepare-panel";
import { LlmSettingsPanel } from "@/components/llm-settings-panel";
import {
  compile,
  SAMPLE_MARKDOWN,
  THEME_IDS,
  type ThemeId,
  type ValidationIssue,
} from "@/compiler";
import {
  applyKinds,
  enhanceWithAi,
  hasLlmKey,
  htmlToMarkdown,
  isRichPaste,
  loadLlmSettings,
  prepareLocal,
  saveLlmSettings,
  type ChangeKind,
  type LlmSettings,
  type PrepareResult,
} from "@/assistant";
import { DEFAULT_LLM_SETTINGS, enabledAiFeatures, type AiFeatureId } from "@/assistant/llm-settings";
import { cn } from "@/lib/utils";

const THEME_LABELS: Record<ThemeId, string> = {
  classic: "Classic A4",
  navy: "Navy textbook",
  palatino: "Palatino grid",
};

const STORAGE_SOURCE = "md2a4.source";
const STORAGE_THEME = "md2a4.theme";

function slugFilename(title: string | null): string {
  const s = (title || "document")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${s || "document"}.html`;
}

export function CompilerApp() {
  const [source, setSource] = useState("");
  const [theme, setTheme] = useState<ThemeId>("classic");
  const [html, setHtml] = useState("");
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [blockCount, setBlockCount] = useState<number | null>(null);
  const [status, setStatus] = useState("Paste Markdown, then Compile.");
  const [hydrated, setHydrated] = useState(false);
  const [localPrepare, setLocalPrepare] = useState<PrepareResult | null>(null);
  const [aiResult, setAiResult] = useState<PrepareResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUsed, setAiUsed] = useState<AiFeatureId[]>([]);
  const [useAi, setUseAi] = useState(false);
  const [kinds, setKinds] = useState<Set<ChangeKind>>(new Set());
  const [llm, setLlm] = useState<LlmSettings>(DEFAULT_LLM_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SOURCE);
      const savedTheme = localStorage.getItem(STORAGE_THEME);
      if (saved) setSource(saved);
      if (savedTheme === "classic" || savedTheme === "navy" || savedTheme === "palatino") {
        setTheme(savedTheme);
      }
      setLlm(loadLlmSettings());
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_SOURCE, source);
      localStorage.setItem(STORAGE_THEME, theme);
    } catch {
      /* ignore */
    }
  }, [source, theme, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      saveLlmSettings(llm);
    } catch {
      /* ignore */
    }
  }, [llm, hydrated]);

  const fitPreview = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const widthMm = 210;
    const px = (widthMm / 25.4) * 96;
    const next = Math.min(1, (el.clientWidth - 24) / px);
    setScale(Number.isFinite(next) && next > 0 ? next : 1);
  }, []);

  useEffect(() => {
    fitPreview();
    window.addEventListener("resize", fitPreview);
    return () => window.removeEventListener("resize", fitPreview);
  }, [fitPreview, html]);

  const runCompile = useCallback(() => {
    const result = compile(source, theme);
    setHtml(result.html);
    setIssues(result.issues);
    setBlockCount(result.ir.blocks.length);
    const err = result.issues.length;
    setStatus(
      `Compiled · ${theme} · ${result.ir.blocks.length} blocks · ${err} validation ${err === 1 ? "error" : "errors"}`,
    );
  }, [source, theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runCompile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runCompile]);

  const onLoadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const isHtml = /\.html?$/i.test(file.name) || file.type === "text/html" || isRichPaste(text);
      const next = isHtml ? htmlToMarkdown(text) : text;
      setSource(next);
      setStatus(
        isHtml
          ? `Converted ${file.name} to Markdown. Review, then Compile.`
          : `Loaded ${file.name}. Click Compile to preview.`,
      );
    };
    reader.readAsText(file);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (!html || !isRichPaste(html)) return;
    e.preventDefault();
    const md = htmlToMarkdown(html);
    const el = e.currentTarget;
    const start = el.selectionStart ?? source.length;
    const end = el.selectionEnd ?? source.length;
    const next = source.slice(0, start) + md + source.slice(end);
    setSource(next);
    setStatus("Converted pasted document to Markdown. Review, then Compile.");
  };

  const runPrepare = () => {
    if (!source.trim()) {
      setStatus("Paste notes first, then Prepare.");
      return;
    }
    const local = prepareLocal(source);
    setLocalPrepare(local);
    setKinds(emptyKinds(local.changes));
    setAiResult(null);
    setAiError(null);
    setAiUsed([]);
    setUseAi(false);
    setStatus("Preparing notes… review the proposal before Compile.");

    const wantAi = hasLlmKey(llm) && enabledAiFeatures(llm).length > 0;
    if (!wantAi) {
      setAiLoading(false);
      return;
    }
    setAiLoading(true);
    void enhanceWithAi(source, local.markdown, local.changes, llm)
      .then((res) => {
        if (res.markdown !== local.markdown && res.used.length) {
          setAiResult({
            source: local.source,
            markdown: res.markdown,
            changes: res.changes,
            via: "ai",
          });
          setAiUsed(res.used);
          setUseAi(true);
        }
        if (res.error) setAiError(res.error);
      })
      .catch(() => {
        setAiError("AI prepare failed.");
      })
      .finally(() => setAiLoading(false));
  };

  const proposedMarkdown = (() => {
    if (!localPrepare) return source;
    if (useAi && aiResult) return aiResult.markdown;
    if (kinds.size === 0) return localPrepare.source;
    return applyKinds(localPrepare.source, kinds);
  })();

  const toggleKind = (kind: ChangeKind) => {
    setUseAi(false);
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const applyPrepare = () => {
    setSource(proposedMarkdown);
    setLocalPrepare(null);
    setAiResult(null);
    setStatus("Applied prepared Markdown. Click Compile to preview.");
  };

  const download = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = slugFilename(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printPreview = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  const onIframeLoad = () => {
    const iframe = iframeRef.current;
    const w = iframe?.contentWindow as
      | (Window & {
          MathJax?: {
            typesetPromise?: () => Promise<unknown>;
            startup?: { promise?: Promise<unknown> };
          };
        })
      | null;
    if (!w) return;
    const run = () => {
      void w.MathJax?.typesetPromise?.();
    };
    if (w.MathJax?.startup?.promise) {
      void w.MathJax.startup.promise.then(run);
      return;
    }
    let n = 0;
    const tick = () => {
      if (w.MathJax?.typesetPromise) {
        run();
        return;
      }
      if (n++ < 50) window.setTimeout(tick, 100);
    };
    tick();
  };

  const errorCount = issues.length;
  const compiled = blockCount !== null;

  const dialect = useMemo(
    () => (
      <details className="group rounded-md border border-border bg-surface-2/60 px-3 py-2 text-sm">
        <summary className="cursor-pointer list-none font-medium text-fg [&::-webkit-details-marker]:hidden">
          Markdown dialect
        </summary>
        <div className="mt-2 space-y-2 text-muted leading-relaxed">
          <p>Optional YAML: title, chapter, header_left, header_right, footer_left, folio, lang, theme.</p>
          <p>
            Containers: <code className="font-mono text-fg/80">:::list</code>,{" "}
            <code className="font-mono text-fg/80">:::terms</code>,{" "}
            <code className="font-mono text-fg/80">:::example</code>,{" "}
            <code className="font-mono text-fg/80">:::aside</code>,{" "}
            <code className="font-mono text-fg/80">:::note</code>,{" "}
            <code className="font-mono text-fg/80">:::equation</code>.
          </p>
          <p>
            Math uses <code className="font-mono text-fg/80">$x$</code> or{" "}
            <code className="font-mono text-fg/80">$$x$$</code>. Amounts like{" "}
            <code className="font-mono text-fg/80">$100</code> stay as text.
          </p>
          <p>
            <strong className="text-fg/80">Prepare notes</strong> is local by default. Optional AI
            (your key, in AI setup) only classifies short titles, leftover $, or leftover HTML — not
            full-document rewrites.
          </p>
        </div>
      </details>
    ),
    [],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="mr-auto min-w-0">
          <p className="font-display text-xl font-semibold tracking-tight text-balance">md2a4</p>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">A4 notes compiler</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="hidden sm:inline">Theme</span>
          <select
            aria-label="Theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeId)}
            className="h-11 min-w-40 rounded-sm border border-border bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {THEME_IDS.map((id) => (
              <option key={id} value={id}>
                {THEME_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={runCompile} type="button">
          Compile
        </Button>
        <Button variant="secondary" onClick={download} type="button" disabled={!html}>
          <Download />
          Download HTML
        </Button>
        <Button variant="secondary" onClick={printPreview} type="button" disabled={!html}>
          <Printer />
          Print
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="AI setup"
        >
          <Settings2 />
          AI setup
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,42%)_1fr]">
        <section className="flex min-h-0 flex-col gap-3 border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,.html,.htm,text/markdown,text/plain,text/html"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onLoadFile(file);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" size="sm" type="button" onClick={() => fileRef.current?.click()}>
              <FileUp />
              Open file
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={runPrepare}>
              <Wand2 />
              Prepare notes
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setSettingsOpen(true)}>
              <Settings2 />
              AI setup
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setSource(SAMPLE_MARKDOWN);
                setStatus("Sample dialect loaded. Click Compile to preview.");
              }}
            >
              <BookOpen />
              Load sample dialect
            </Button>
          </div>
          <p className="text-xs text-muted">
            {hasLlmKey(llm) && enabledAiFeatures(llm).length
              ? `AI on · ${enabledAiFeatures(llm).join(", ")} · tiny jobs only`
              : "AI off · Prepare uses local rules. Add a key in AI setup to enable features."}
          </p>

          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onPaste={onPaste}
            spellCheck={false}
            placeholder="Paste Markdown here…"
            className="min-h-64 flex-1 resize-y rounded-md border border-border bg-surface p-4 font-mono text-sm leading-relaxed text-fg placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Markdown source"
          />

          {localPrepare ? (
            <PreparePanel
              local={localPrepare}
              proposed={proposedMarkdown}
              kinds={kinds}
              onToggleKind={toggleKind}
              aiLoading={aiLoading}
              aiError={aiError}
              ai={aiResult}
              aiUsed={aiUsed}
              useAi={useAi}
              onToggleAi={setUseAi}
              onApply={applyPrepare}
              onDismiss={() => {
                setLocalPrepare(null);
                setAiResult(null);
                setAiLoading(false);
              }}
            />
          ) : null}

          {dialect}

          <p
            className={cn(
              "flex items-start gap-2 text-sm tabular-nums",
              errorCount > 0 ? "text-danger" : "text-muted",
            )}
            role="status"
          >
            {compiled && errorCount === 0 ? (
              <Check className="mt-0.5 size-4 text-ok" />
            ) : compiled && errorCount > 0 ? (
              <AlertCircle className="mt-0.5 size-4 text-danger" />
            ) : null}
            <span>{status}</span>
          </p>
        </section>

        <section className="flex min-h-0 flex-col bg-bg">
          <div ref={stageRef} className="relative min-h-[50vh] flex-1 overflow-auto p-4 sm:p-6">
            {!html ? (
              <div className="mx-auto flex h-full min-h-80 max-w-xl flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 text-center">
                <p className="font-display text-2xl text-fg">Compile to preview</p>
                <p className="mt-2 max-w-sm text-pretty text-sm text-muted">
                  The A4 page appears here. Nothing is sent to a server — compile runs in this browser.
                </p>
              </div>
            ) : (
              <div
                className="mx-auto overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
                style={{
                  width: `calc(210mm * ${scale})`,
                  height: `calc(297mm * ${scale})`,
                }}
              >
                <iframe
                  ref={iframeRef}
                  title="A4 preview"
                  sandbox="allow-scripts allow-same-origin allow-modals"
                  srcDoc={html}
                  onLoad={onIframeLoad}
                  className="preview-frame border-0 bg-white"
                  style={{ transform: `scale(${scale})` }}
                />
              </div>
            )}
          </div>

          {issues.length > 0 && (
            <div className="max-h-40 overflow-auto border-t border-border bg-surface px-4 py-3 text-sm">
              <p className="mb-1 font-medium text-danger">Validation</p>
              <ul className="space-y-1 text-muted">
                {issues.map((issue, i) => (
                  <li key={`${issue.code}-${i}`}>
                    <span className="font-mono text-xs text-fg/70">{issue.code}</span> {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
      {settingsOpen ? (
        <LlmSettingsPanel
          settings={llm}
          onChange={setLlm}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
