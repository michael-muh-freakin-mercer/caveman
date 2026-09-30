"use client";

import { FileCode2, FileText, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StatusPill } from "@/components/ui/status";
import { relativeTime, shortId } from "@/lib/format";
import type { ArtifactView } from "@/lib/types";

const STATUS_TONE = { accepted: "ok", candidate: "glacier", rejected: "bad", superseded: "neutral" } as const;

export function ArtifactsPanel({ runId, artifacts }: { runId: string; artifacts: ArtifactView[] }) {
  const [open, setOpen] = useState<ArtifactView | null>(null);
  const [full, setFull] = useState<ArtifactView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  function show(artifact: ArtifactView) {
    setOpen(artifact);
    setFull(null);
    setError(null);
    fetch(`/api/cavman/runs/${runId}/artifacts/${artifact.id}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? setFull(await r.json()) : setError("Could not load this artifact.")))
      .catch(() => setError("Could not load this artifact."));
  }

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  if (!artifacts.length) return <p className="text-sm text-muted">No artifacts yet. Specialists’ submitted work appears here.</p>;

  return (
    <>
      <ul className="divide-y divide-line">
        {[...artifacts].reverse().map((artifact) => (
          <li key={artifact.id} id={`artifact-${artifact.id}`} className="scroll-mt-24 py-3 first:pt-0 last:pb-0">
            <button type="button" onClick={() => show(artifact)} className="flex w-full items-start gap-3 rounded-lg p-1 text-left hover:bg-surface-2">
              {artifact.kind === "code_change" ? (
                <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-glacier" aria-hidden="true" />
              ) : (
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-glacier" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{artifact.task_title}</span>
                <span className="block text-xs text-muted">
                  v{artifact.version} · {artifact.kind === "code_change" ? `${artifact.changed_files.length} files` : "document"} ·{" "}
                  {relativeTime(artifact.created_at)} · <span className="font-mono">{shortId(artifact.content_digest, 10)}</span>
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusPill tone={STATUS_TONE[artifact.status]}>{artifact.status[0].toUpperCase() + artifact.status.slice(1)}</StatusPill>
                {artifact.integrated_commit ? (
                  <span className="font-mono text-[0.68rem] text-ok" title="Merged into the project's integration branch">
                    merged {shortId(artifact.integrated_commit, 7)}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        className="m-auto max-h-[88dvh] w-[min(960px,94vw)] rounded-xl border-2 border-ink bg-surface p-0 text-fg shadow-[6px_6px_0_0_var(--color-ink)] backdrop:bg-ink/50"
        aria-labelledby="artifact-dialog-title"
      >
        {open ? (
          <div className="flex max-h-[88dvh] flex-col">
            <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 id="artifact-dialog-title" className="truncate text-base font-semibold">{open.task_title}</h2>
                <p className="mt-1 text-xs text-muted">
                  Version {open.version} · {open.status} · validation {open.validation_state.replace("_", " ")} · review {open.review_state.replace("_", " ")}
                </p>
              </div>
              <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="overflow-auto px-5 py-4">
              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <div><dt className="text-muted">Content digest</dt><dd className="break-all font-mono text-fg-soft">{open.content_digest}</dd></div>
                {open.workspace_fingerprint ? (
                  <div><dt className="text-muted">Workspace fingerprint</dt><dd className="break-all font-mono text-fg-soft">{open.workspace_fingerprint}</dd></div>
                ) : null}
                {open.integrated_commit ? (
                  <div><dt className="text-muted">Merged into the project at</dt><dd className="break-all font-mono text-fg-soft">{open.integrated_commit}</dd></div>
                ) : null}
                {open.workspace_id ? (
                  <div><dt className="text-muted">Candidate workspace</dt><dd className="font-mono text-fg-soft">{open.workspace_id}</dd></div>
                ) : null}
                <div><dt className="text-muted">Built on</dt><dd className="font-mono text-fg-soft">{open.input_artifact_ids.length ? open.input_artifact_ids.map((id) => shortId(id)).join(", ") : "no upstream artifacts"}</dd></div>
              </dl>
              {open.changed_files.length ? (
                <div className="mt-4">
                  <p className="eyebrow text-[0.62rem] text-muted">Changed files</p>
                  <ul className="mt-1 font-mono text-xs text-fg-soft">{open.changed_files.map((f) => <li key={f}>{f}</li>)}</ul>
                </div>
              ) : null}
              <div className="mt-4">
                {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
                {!full && !error ? (
                  <p className="flex items-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</p>
                ) : null}
                {full ? (
                  <>
                    <p className="eyebrow text-[0.62rem] text-muted">Specialist output</p>
                    <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs text-fg-soft">{full.content}</pre>
                    {full.diff ? (
                      <>
                        <p className="eyebrow mt-4 text-[0.62rem] text-muted">Code changes</p>
                        <pre className="mt-1 max-h-[28rem] overflow-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed">
                          {full.diff.split("\n").map((line, index) => (
                            <span key={index} className={`block ${line.startsWith("+") ? "text-ok" : line.startsWith("-") ? "text-bad" : line.startsWith("diff --git") ? "text-glacier" : "text-fg-soft"}`}>
                              {line || " "}
                            </span>
                          ))}
                        </pre>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
