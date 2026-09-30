"use client";

import { ShieldAlert } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status";
import { relativeTime } from "@/lib/format";
import type { ApprovalView } from "@/lib/types";

export function ApprovalCard({
  approval,
  onDecide,
}: {
  approval: ApprovalView;
  onDecide: (decision: "approve" | "reject", reason: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  const pending = approval.status === "pending";

  async function decide(decision: "approve" | "reject") {
    setBusy(decision);
    setError(null);
    try {
      await onDecide(decision, reason);
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : "The decision was not recorded.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      className={`rounded-lg p-5 ${pending ? "border-2 border-ink bg-surface shadow-ember" : "border border-line bg-surface-2/60"}`}
      aria-labelledby={`approval-${approval.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className={`mt-0.5 h-5 w-5 shrink-0 ${pending ? "text-ember-deep" : "text-muted"}`} aria-hidden="true" />
          <div>
            <h3 id={`approval-${approval.id}`} className="text-base font-semibold text-fg">
              {approval.title}
            </h3>
            <p className="mt-1 text-sm text-fg-soft">{approval.what}</p>
          </div>
        </div>
        <StatusPill tone={pending ? "ember" : approval.status === "approved" ? "ok" : "neutral"}>
          {pending ? "Waiting for you" : approval.status[0].toUpperCase() + approval.status.slice(1)}
        </StatusPill>
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="eyebrow text-[0.62rem] text-muted">Why</dt>
          <dd className="mt-1 text-fg-soft">{approval.why}</dd>
        </div>
        <div>
          <dt className="eyebrow text-[0.62rem] text-muted">Risk</dt>
          <dd className="mt-1 text-fg-soft">{approval.risk}</dd>
        </div>
        {approval.changes.length ? (
          <div className="sm:col-span-2">
            <dt className="eyebrow text-[0.62rem] text-muted">What changes</dt>
            <dd className="mt-1">
              <ul className="list-inside list-disc space-y-0.5 text-fg-soft">
                {approval.changes.map((change) => (
                  <li key={change} className="break-words">{change}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="eyebrow text-[0.62rem] text-muted">Exact scope</dt>
          <dd className="mt-1">
            <details className="rounded-lg border border-line bg-surface-2">
              <summary className="cursor-pointer px-3 py-2 font-mono text-xs text-muted">
                digest {approval.scope_digest.slice(0, 16)}… · target {approval.target}
              </summary>
              <pre className="max-h-64 overflow-auto border-t border-line px-3 py-2 font-mono text-xs text-fg-soft">
                {JSON.stringify(approval.scope, null, 2)}
              </pre>
            </details>
          </dd>
        </div>
      </dl>
      {pending ? (
        <div className="mt-5 border-t border-line pt-4">
          <label htmlFor={reasonId} className="text-xs text-muted">
            Note (optional, recorded with your decision)
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={2000}
            className="mt-1 w-full resize-y rounded-md border-2 border-line-strong bg-surface px-3 py-2 text-sm text-fg focus:border-ink focus:outline-none"
          />
          {error ? (
            <p role="alert" className="mt-2 text-sm text-bad">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => decide("approve")} disabled={busy !== null}>
              {busy === "approve" ? "Approving…" : "Approve"}
            </Button>
            <Button variant="secondary" onClick={() => decide("reject")} disabled={busy !== null}>
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Your decision applies only to this exact scope. If Cavman changes the request, it will ask again.
          </p>
        </div>
      ) : approval.decision ? (
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          {approval.decision.approved ? "Approved" : "Rejected"}
          {approval.decided_at ? ` ${relativeTime(approval.decided_at)}` : ""} — “{approval.decision.reason}”
        </p>
      ) : null}
    </article>
  );
}
