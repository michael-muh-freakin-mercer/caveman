import { CheckCircle2, CircleDashed, LoaderCircle, XCircle } from "lucide-react";
import { CHECK_LABEL, checkDisplayStatus } from "@/lib/run-state";
import type { ArtifactView, TaskView } from "@/lib/types";

function Icon({ status }: { status: "passed" | "failed" | "not_run" | "running" }) {
  if (status === "passed") return <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden="true" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-bad" aria-hidden="true" />;
  if (status === "running") return <LoaderCircle className="h-4 w-4 animate-spin text-glacier" aria-hidden="true" />;
  return <CircleDashed className="h-4 w-4 text-muted" aria-hidden="true" />;
}

/**
 * Trusted validation and review results for each task's current candidate.
 * Every status comes from a kernel record; a missing record is "Not run".
 */
export function ChecksPanel({ tasks, artifacts, executing }: { tasks: TaskView[]; artifacts: ArtifactView[]; executing: boolean }) {
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  const rows = tasks.filter((t) => t.required_checks.length || t.review_required);
  if (!rows.length) return <p className="text-sm text-muted">No checks are planned yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((task) => {
        const artifact = task.latest_artifact_id ? byId.get(task.latest_artifact_id) : undefined;
        const review = artifact?.reviews.at(-1);
        const reviewStatus = review ? (review.status === "passed" ? "passed" : "failed") : task.state === "Reviewing" && executing ? "running" : "not_run";
        return (
          <li key={task.id} className="py-3 first:pt-0 last:pb-0">
            <p className="text-sm font-medium text-fg">{task.title}</p>
            {task.artifact_ids.length > 1 ? (
              <p className="mt-0.5 text-xs text-muted">
                Showing version {task.artifact_ids.length}. Earlier versions and their failed checks are listed under Artifacts and Failures.
              </p>
            ) : null}
            <ul className="mt-2 space-y-1.5">
              {task.required_checks.map((check) => {
                const status = checkDisplayStatus(check.status, task.state, executing);
                const record = artifact?.validations.filter((v) => v.check === check.check).at(-1);
                return (
                  <li key={check.check}>
                    <details className="group rounded-lg border border-transparent open:border-line open:bg-ink/50">
                      <summary className={`flex list-none items-center gap-2 rounded-lg px-2 py-1 text-sm ${record ? "cursor-pointer hover:bg-surface-2" : ""}`}>
                        <Icon status={status} />
                        <span className="text-fg-soft">{check.label}</span>
                        <span className={`ml-auto text-xs ${status === "passed" ? "text-ok" : status === "failed" ? "text-bad" : status === "running" ? "text-glacier" : "text-muted"}`}>
                          {CHECK_LABEL[status]}
                        </span>
                      </summary>
                      {record ? (
                        <div className="border-t border-line px-3 py-2 text-xs">
                          <p className="text-muted">
                            Trusted {record.executor} · {record.command ? <code className="font-mono">{record.command}</code> : "structured check"}
                            {record.returncode !== null ? ` · exit ${record.returncode}` : ""}
                          </p>
                          {record.output ? (
                            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.7rem] text-fg-soft">{record.output}</pre>
                          ) : null}
                        </div>
                      ) : null}
                    </details>
                  </li>
                );
              })}
              {task.review_required ? (
                <li className="flex items-center gap-2 px-2 py-1 text-sm">
                  <Icon status={reviewStatus} />
                  <span className="text-fg-soft">Independent review</span>
                  <span className={`ml-auto text-xs ${reviewStatus === "passed" ? "text-ok" : reviewStatus === "failed" ? "text-bad" : reviewStatus === "running" ? "text-glacier" : "text-muted"}`}>
                    {reviewStatus === "failed" ? "Changes requested" : CHECK_LABEL[reviewStatus]}
                  </span>
                </li>
              ) : null}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
