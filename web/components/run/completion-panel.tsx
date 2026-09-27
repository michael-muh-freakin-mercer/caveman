import { CheckCircle2, Download, FileText, FolderOpen, Layers } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { duration, formatUsd } from "@/lib/format";
import type { RunDetail } from "@/lib/types";

export function CompletionPanel({ run }: { run: RunDetail }) {
  const accepted = run.artifacts.filter((a) => a.status === "accepted");
  const checks = run.tasks.flatMap((t) => t.required_checks);
  const passed = checks.filter((c) => c.status === "passed").length;
  const finishedAt = run.jobs.at(-1)?.finished_at ?? run.updated_at;
  const delivery = run.delivery;
  return (
    <section aria-labelledby="complete-title" className="stone overflow-hidden rounded-2xl border border-ok/30 bg-gradient-to-br from-ok/[0.07] via-surface to-surface">
      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-medium text-ok">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Verified by the completion gate
          </p>
          <h2 id="complete-title" className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Build complete
          </h2>
          {run.final_result ? <p className="mt-3 whitespace-pre-line text-fg-soft">{run.final_result}</p> : null}
          <div className="mt-6 flex flex-wrap gap-2">
            {delivery?.downloadable ? (
              <a href={`/api/caveman/runs/${run.id}/delivery/download`} className={buttonClass("primary", "md")} download>
                <Download className="h-4 w-4" aria-hidden="true" /> Download project
              </a>
            ) : null}
            <Link href={`/app/projects/${run.project_id}`} className={buttonClass("secondary", "md")}>
              <FolderOpen className="h-4 w-4" aria-hidden="true" /> Open Project
            </Link>
            <a href="#artifacts" className={buttonClass("secondary", "md")}>
              <Layers className="h-4 w-4" aria-hidden="true" /> View Artifacts
            </a>
            {delivery?.report ? (
              <a href="#build-report" className={buttonClass("ghost", "md")}>
                <FileText className="h-4 w-4" aria-hidden="true" /> View Build Report
              </a>
            ) : null}
          </div>
          {delivery === null ? <p className="mt-3 text-xs text-muted">Assembling your download from the accepted work…</p> : null}
          {delivery?.status === "failed" ? (
            <p role="alert" className="mt-3 text-sm text-bad">The download could not be assembled: {delivery.error}</p>
          ) : null}
        </div>
        <dl className="grid min-w-[16rem] grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div><dt className="text-xs text-muted">Project</dt><dd className="text-fg">{run.project_name}</dd></div>
          <div><dt className="text-xs text-muted">Build status</dt><dd className="text-ok">Complete</dd></div>
          <div><dt className="text-xs text-muted">Trusted checks</dt><dd className="text-fg">{checks.length ? `${passed} of ${checks.length} passed` : "None required"}</dd></div>
          <div><dt className="text-xs text-muted">Accepted work</dt><dd className="text-fg">{accepted.length} artifact{accepted.length === 1 ? "" : "s"}</dd></div>
          <div><dt className="text-xs text-muted">Total cost</dt><dd className="tabular-nums text-fg">{formatUsd(run.usage.cost_usd, { complete: run.usage.cost_complete })}</dd></div>
          <div><dt className="text-xs text-muted">Elapsed</dt><dd className="tabular-nums text-fg">{duration(run.created_at, finishedAt)}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-muted">Repository</dt><dd className="text-fg-soft">
                Local project repository{delivery?.commit ? <> · commit <span className="font-mono">{delivery.commit.slice(0, 7)}</span></> : null} · not published
              </dd></div>
          <div className="col-span-2"><dt className="text-xs text-muted">Preview</dt><dd className="text-fg-soft">Not available — Caveman does not run generated apps on this site.</dd></div>
        </dl>
      </div>
      {delivery?.status === "ready" ? (
        <div id="build-report" className="scroll-mt-24 border-t border-line bg-ink/40 px-6 py-5 sm:px-8">
          <p className="eyebrow text-[0.62rem] text-muted">Delivered · {delivery.total_files} files in total, including the project’s starting files</p>
          <ul className="mt-3 grid gap-x-6 gap-y-1 font-mono text-xs text-fg-soft sm:grid-cols-2 lg:grid-cols-3">
            {[...delivery.files, ...delivery.documents, delivery.report].filter(Boolean).map((file) => (
              <li key={file} className="truncate">{file}</li>
            ))}
          </ul>
          <div className="mt-4">
            <p className="eyebrow text-[0.62rem] text-muted">Success criteria met</p>
            <ul className="mt-2 space-y-1 text-sm text-fg-soft">
              {run.criteria.map((criterion) => (
                <li key={criterion} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />{criterion}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
