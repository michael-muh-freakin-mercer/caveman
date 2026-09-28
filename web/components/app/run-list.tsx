import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatusPill } from "@/components/ui/status";
import { formatUsd, relativeTime } from "@/lib/format";
import { RUN_TONE, isExecuting } from "@/lib/run-state";
import type { RunSummary } from "@/lib/types";

export function RunList({ runs, showProject = true }: { runs: RunSummary[]; showProject?: boolean }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {runs.map((run) => (
        <li key={run.id}>
          <Link href={`/app/runs/${run.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-2 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {showProject ? <p className="truncate text-sm font-semibold text-fg">{run.project_name}</p> : null}
                <StatusPill tone={RUN_TONE[run.state]} pulse={isExecuting(run.state)}>
                  {run.label}
                </StatusPill>
                {run.pending_approvals ? <span className="text-xs text-ember">{run.pending_approvals} approval{run.pending_approvals > 1 ? "s" : ""} waiting</span> : null}
              </div>
              <p className="mt-1 truncate text-sm text-muted">{run.prompt}</p>
            </div>
            <dl className="hidden shrink-0 grid-cols-3 gap-6 text-right text-xs sm:grid">
              <div><dt className="text-faint">Tasks</dt><dd className="tabular-nums text-fg-soft">{run.tasks_accepted}/{run.tasks_total}</dd></div>
              <div><dt className="text-faint">Cost</dt><dd className="tabular-nums text-fg-soft">{formatUsd(run.cost_usd, { complete: run.cost_complete })}</dd></div>
              <div><dt className="text-faint">Started</dt><dd className="text-fg-soft">{relativeTime(run.created_at)}</dd></div>
            </dl>
            <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
