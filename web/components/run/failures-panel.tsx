import { CornerDownRight } from "lucide-react";
import { relativeTime } from "@/lib/format";
import type { RunDetail } from "@/lib/types";

export function FailuresPanel({ run }: { run: RunDetail }) {
  const { failure_details: failures, recovery } = run;
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {failures.map((failure) => (
          <li key={failure.id} className="rounded-xl border border-bad/25 bg-bad/[0.04] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-fg">{failure.task_title}</p>
              <time dateTime={failure.created_at} className="text-xs text-faint">{relativeTime(failure.created_at)}</time>
            </div>
            <p className="mt-1 text-sm text-bad">{failure.explanation}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted hover:text-fg">Evidence ({failure.classification.replaceAll("_", " ").toLowerCase()})</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-2 font-mono text-[0.7rem] text-fg-soft">{failure.evidence}</pre>
            </details>
            {failure.recovery ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-fg-soft">
                <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                <span><span className="font-medium text-warn">{failure.recovery.label}.</span> {failure.recovery.reason}</span>
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted">Recovery not decided yet.</p>
            )}
          </li>
        ))}
      </ul>
      {recovery.proposals.length ? (
        <div>
          <p className="eyebrow text-[0.62rem] text-muted">Plan revisions</p>
          <ul className="mt-2 space-y-2 text-sm">
            {recovery.proposals.map((proposal) => (
              <li key={proposal.id} className="rounded-lg border border-line p-3">
                <p className="text-fg-soft">{proposal.trigger}</p>
                <p className="mt-1 text-xs text-muted">
                  {proposal.status.replace("_", " ")} · +{proposal.adds} / −{proposal.removes} / ↺{proposal.reopens}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted">
        Plan revision {recovery.revision}; {recovery.replans_remaining} replans remaining.
      </p>
    </div>
  );
}
