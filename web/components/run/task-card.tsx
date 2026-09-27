import { ArrowUpRight, Cpu, GitBranch, RotateCcw } from "lucide-react";
import { StatusPill } from "@/components/ui/status";
import { CHECK_LABEL, CHECK_TONE, TASK_TONE, checkDisplayStatus } from "@/lib/run-state";
import { relativeTime } from "@/lib/format";
import type { TaskView } from "@/lib/types";

export function TaskCard({ task, titles, executing }: { task: TaskView; titles: Record<string, string>; executing: boolean }) {
  const live = executing && ["Running", "Validating", "Reviewing"].includes(task.state);
  return (
    <article className="rounded-xl border border-line bg-surface-2/60 p-4" aria-labelledby={`task-${task.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-glacier">{task.specialist}</p>
          <h3 id={`task-${task.id}`} className="mt-1 text-sm font-semibold leading-snug text-fg">
            {task.title}
          </h3>
        </div>
        <StatusPill tone={TASK_TONE[task.state]} pulse={live}>
          {task.state}
        </StatusPill>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted">{task.deliverable}</p>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        <div className="flex items-center gap-1">
          <dt className="sr-only">Attempt</dt>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <dd>
            Attempt {task.attempt}/{task.max_attempts}
          </dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="sr-only">Capability</dt>
          <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
          <dd>{task.capability_label}</dd>
        </div>
        {task.dependencies.length ? (
          <div className="flex items-center gap-1">
            <dt className="sr-only">Depends on</dt>
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            <dd>Needs {task.dependencies.map((d) => titles[d] ?? d).join(", ")}</dd>
          </div>
        ) : null}
        {task.usage ? (
          <div className="flex items-center gap-1">
            <dt className="sr-only">Models</dt>
            <dd className="font-mono text-[0.7rem]">{task.usage.models.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      {task.required_checks.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Required checks">
          {task.required_checks.map((check) => {
            const status = checkDisplayStatus(check.status, task.state, executing);
            return (
              <li key={check.check}>
                <StatusPill tone={CHECK_TONE[status]} pulse={status === "running"}>
                  {check.label}: {CHECK_LABEL[status]}
                </StatusPill>
              </li>
            );
          })}
        </ul>
      ) : null}
      {task.blocker && !["Accepted"].includes(task.state) ? (
        <p className="mt-3 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-xs text-fg-soft">{task.blocker}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs">
        <span className="truncate text-muted">
          {task.latest_event ? `${task.latest_event.title} · ${relativeTime(task.latest_event.created_at)}` : "No activity yet"}
        </span>
        {task.latest_artifact_id ? (
          <a href={`#artifact-${task.latest_artifact_id}`} className="inline-flex shrink-0 items-center gap-1 text-glacier hover:underline">
            Output <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </article>
  );
}
