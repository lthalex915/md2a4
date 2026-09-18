import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CopilotResult } from "@/assistant";
import type { ValidationIssue } from "@/compiler";
import { SOURCE_FIXABLE } from "@/assistant";

type Props = {
  issues: ValidationIssue[];
  loading: boolean;
  error: string | null;
  proposal: CopilotResult | null;
  canAi: boolean;
  onFix: () => void;
  onApply: () => void;
  onDismiss: () => void;
};

export function ValidationPanel({
  issues,
  loading,
  error,
  proposal,
  canAi,
  onFix,
  onApply,
  onDismiss,
}: Props) {
  if (!issues.length && !proposal) return null;
  const fixable = issues.some((i) => SOURCE_FIXABLE.has(i.code));

  return (
    <div className="max-h-[40vh] overflow-auto border-t border-border bg-surface px-4 py-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-danger">Validation</p>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={onFix}
          disabled={loading || !fixable}
        >
          <Wrench />
          {loading ? "Fixing…" : canAi ? "Fix with AI" : "Fix notes"}
        </Button>
      </div>
      {!canAi && fixable ? (
        <p className="mb-2 text-xs text-muted">
          Local repairs only. Turn on Fidelity copilot in AI setup (your own key) for extra
          patches.
        </p>
      ) : null}
      <ul className="space-y-1 text-muted">
        {issues.map((issue, i) => (
          <li key={`${issue.code}-${i}`}>
            <span className="font-mono text-xs text-fg/70">{issue.code}</span> {issue.message}
          </li>
        ))}
      </ul>

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      {proposal ? (
        <div className="mt-3 rounded-md border border-border bg-surface-2/70 p-3">
          <p className="text-sm text-fg">
            Proposed source · {proposal.before} → {proposal.after} error
            {proposal.after === 1 ? "" : "s"}
            {proposal.usedAi ? " · AI patches" : " · local"}
          </p>
          {proposal.summaries.length ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
              {proposal.summaries.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onApply} disabled={proposal.markdown === ""}>
              Apply and recompile
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
