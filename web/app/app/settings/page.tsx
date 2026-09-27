import type { Metadata } from "next";
import { ApiError } from "@/components/app/api-error";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { githubEnabled } from "@/lib/auth";
import { formatUsd } from "@/lib/format";
import { load } from "@/lib/load";
import { requireUser } from "@/lib/session";
import type { SystemView } from "@/lib/types";

export const metadata: Metadata = { title: "Settings" };

const MODES = [
  { name: "Automatic", body: "Caveman uses the models configured on the server.", available: true },
  { name: "Budget", body: "Prefer the most economical capable models.", available: false },
  { name: "Balanced", body: "Trade cost against quality per task.", available: false },
  { name: "Maximum Quality", body: "Prefer the strongest models regardless of cost.", available: false },
];

export default async function SettingsPage() {
  const user = await requireUser("/app/settings");
  const system = await load<SystemView>(user.id, "system");
  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" />
      <div className="grid gap-6 px-4 py-6 sm:px-8 sm:py-8 xl:grid-cols-2">
        <Panel title="Account">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs text-muted">Name</dt><dd className="text-fg">{user.name}</dd></div>
            <div><dt className="text-xs text-muted">Email</dt><dd className="text-fg">{user.email}</dd></div>
          </dl>
        </Panel>
        <Panel title="GitHub" description="Caveman never pushes or creates repositories without your explicit approval.">
          <p className="text-sm text-fg-soft">
            {githubEnabled
              ? "GitHub sign-in is available. It grants Caveman your public profile and email only."
              : "GitHub sign-in is not configured on this server."}
          </p>
          <p className="mt-3 text-sm text-muted">Publishing builds to a GitHub repository is not available yet. Download the verified project from a completed run instead.</p>
        </Panel>
        {system.ok ? (
          <>
            <Panel title="Models" description="Model routing happens on the server; you never need to pick a model.">
              <ul className="space-y-3">
                {MODES.map((mode) => (
                  <li key={mode.name} className="flex items-start justify-between gap-4 rounded-lg border border-line p-3">
                    <div>
                      <p className="text-sm font-medium text-fg">{mode.name}</p>
                      <p className="text-xs text-muted">{mode.body}</p>
                    </div>
                    <StatusPill tone={mode.available ? "ok" : "neutral"}>{mode.available ? "Active" : "Coming later"}</StatusPill>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 space-y-2 border-t border-line pt-4 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-muted">Provider</dt><dd className="text-fg-soft">{system.data.provider.configured ? system.data.provider.provider : "Not configured"}</dd></div>
                {system.data.provider.manager_model ? <div className="flex justify-between gap-3"><dt className="text-muted">Manager model</dt><dd className="font-mono text-fg-soft">{system.data.provider.manager_model}</dd></div> : null}
                {system.data.provider.worker_model ? <div className="flex justify-between gap-3"><dt className="text-muted">Specialist model</dt><dd className="font-mono text-fg-soft">{system.data.provider.worker_model}</dd></div> : null}
              </dl>
            </Panel>
            <Panel title="Spending" description="Every run gets a ceiling. You can raise it per run.">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Default budget per run</dt><dd className="tabular-nums text-fg">{formatUsd(system.data.budget.default_usd)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Maximum budget per run</dt><dd className="tabular-nums text-fg">{formatUsd(system.data.budget.max_usd)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Model-call limit per run</dt><dd className="tabular-nums text-fg">{system.data.budget.default_max_model_calls}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Warning at</dt><dd className="tabular-nums text-fg">{Math.round(system.data.budget.warning_ratio * 100)}%</dd></div>
              </dl>
            </Panel>
            <Panel title="Sandbox" description="Generated code runs isolated from Caveman and your secrets.">
              <div className="flex items-center justify-between text-sm">
                <span className="text-fg-soft">Isolation backend</span>
                <StatusPill tone={system.data.sandbox.available ? "ok" : "bad"}>{system.data.sandbox.available ? "Available" : "Unavailable"}</StatusPill>
              </div>
              <p className="mt-3 text-xs text-muted">Supported toolchains: {system.data.capabilities.sandbox_toolchains.join(", ")}. Live previews: not available.</p>
            </Panel>
          </>
        ) : (
          <div className="xl:col-span-2"><ApiError status={system.status} message={system.message} /></div>
        )}
      </div>
    </>
  );
}
