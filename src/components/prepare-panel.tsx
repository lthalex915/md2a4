import { Button } from "@/components/ui/button";
import type { Change, ChangeKind, PrepareResult } from "@/assistant";

const KIND_LABEL: Record<ChangeKind, string> = {
  import: "Import",
  "front-matter": "Front matter",
  structure: "Structure",
  math: "Math",
};

type Props = {
  local: PrepareResult;
  proposed: string;
  kinds: Set<ChangeKind>;
  onToggleKind: (kind: ChangeKind) => void;
  grokLoading: boolean;
  grokError: string | null;
  grok: PrepareResult | null;
  useGrok: boolean;
  onToggleGrok: (on: boolean) => void;
  onApply: () => void;
  onDismiss: () => void;
};

export function PreparePanel({
  local,
  proposed,
  kinds,
  onToggleKind,
  grokLoading,
  grokError,
  grok,
  useGrok,
  onToggleGrok,
  onApply,
  onDismiss,
}: Props) {
  const unchanged = proposed === local.source;
  const visible: Change[] = useGrok && grok ? grok.changes : local.changes;

  return (
    <div className="rounded-md border border-border bg-surface-2/70 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-fg">Proposed source</p>
        <p className="text-xs text-muted">
          {useGrok && grok
            ? "Grok refinement · review before applying"
            : "Local prepare · no wording invented"}
        </p>
      </div>

      {visible.length > 0 ? (
        <ul className="mb-3 space-y-1.5 text-sm">
          {visible.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              {useGrok && grok ? (
                <span className="mt-0.5 w-20 shrink-0 text-xs uppercase tracking-wide text-muted">
                  {KIND_LABEL[c.kind]}
                </span>
              ) : (
                <label className="mt-0.5 flex w-20 shrink-0 items-center gap-1 text-xs uppercase tracking-wide text-muted">
                  <input
                    type="checkbox"
                    checked={kinds.has(c.kind)}
                    onChange={() => onToggleKind(c.kind)}
                    className="size-3.5 accent-accent"
                  />
                  {KIND_LABEL[c.kind]}
                </label>
              )}
              <span className="text-fg/90">{c.summary}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted">
          {unchanged
            ? "Nothing to wrap or repair. Add titles above lists, or paste Word/Docs HTML."
            : "Ready to apply."}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        {grokLoading ? (
          <span className="text-muted">Grok is reviewing the notes…</span>
        ) : grok ? (
          <label className="flex items-center gap-2 text-fg">
            <input
              type="checkbox"
              checked={useGrok}
              onChange={(e) => onToggleGrok(e.target.checked)}
              className="size-3.5 accent-accent"
            />
            Use Grok refinement
          </label>
        ) : grokError ? (
          <span className="text-muted">{grokError} Local prepare is still available.</span>
        ) : null}
      </div>

      <textarea
        readOnly
        value={proposed}
        spellCheck={false}
        aria-label="Proposed Markdown"
        className="mb-3 max-h-48 min-h-32 w-full resize-y rounded-sm border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-fg"
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onApply} disabled={unchanged}>
          Apply to editor
        </Button>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function emptyKinds(changes: Change[]): Set<ChangeKind> {
  return new Set(changes.map((c) => c.kind));
}
