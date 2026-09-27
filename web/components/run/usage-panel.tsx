"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatTokens, formatUsd } from "@/lib/format";
import type { UsageView } from "@/lib/types";

export function UsagePanel({ usage, onBudget, canEdit }: { usage: UsageView; onBudget: (value: number) => Promise<void>; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(usage.budget?.limit_usd ?? ""));
  const [error, setError] = useState<string | null>(null);
  const budget = usage.budget;
  const spentRatio = budget && budget.limit_usd ? Math.min(1, budget.spent_usd / budget.limit_usd) : 0;
  const callRatio = budget && budget.max_model_calls ? Math.min(1, budget.model_calls / budget.max_model_calls) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted">Provider-reported cost</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{formatUsd(usage.cost_usd, { complete: usage.cost_complete })}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Model calls</p>
          <p className="mt-1 text-lg tabular-nums text-fg">{usage.calls}</p>
        </div>
      </div>
      {!usage.cost_complete ? (
        <p className="text-xs text-muted">
          {usage.calls_without_cost} of {usage.calls} calls reported no cost, so the true total may be higher. Caveman does not estimate.
        </p>
      ) : null}
      {budget ? (
        <div className="space-y-3">
          <Meter label="Budget" detail={`${formatUsd(budget.spent_usd)} of ${formatUsd(budget.limit_usd)}`} ratio={spentRatio} warn={budget.warning} exceeded={budget.exceeded} />
          <Meter label="Model-call limit" detail={`${budget.model_calls} of ${budget.max_model_calls}`} ratio={callRatio} warn={callRatio >= 0.8} exceeded={callRatio >= 1} />
          {budget.warning && !budget.exceeded ? <p role="status" className="text-xs text-warn">This run is close to its limit.</p> : null}
          {canEdit ? (
            editing ? (
              <form
                className="flex items-end gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError(null);
                  try {
                    await onBudget(Number(value));
                    setEditing(false);
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "Could not update the budget.");
                  }
                }}
              >
                <label className="flex-1 text-xs text-muted">
                  Budget (USD)
                  <input type="number" min="0.5" step="0.5" value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface-2 px-2 text-sm text-fg" />
                </label>
                <Button size="sm" type="submit">Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </form>
            ) : (
              <button type="button" className="text-xs text-glacier hover:underline" onClick={() => setEditing(true)}>
                Change budget
              </button>
            )
          ) : null}
          {error ? <p role="alert" className="text-xs text-bad">{error}</p> : null}
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
        <div><dt className="text-muted">Input tokens</dt><dd className="tabular-nums text-fg-soft">{formatTokens(usage.tokens.input_tokens)}</dd></div>
        <div><dt className="text-muted">Output tokens</dt><dd className="tabular-nums text-fg-soft">{formatTokens(usage.tokens.output_tokens)}</dd></div>
        <div><dt className="text-muted">Cached tokens</dt><dd className="tabular-nums text-fg-soft">{formatTokens(usage.tokens.cached_tokens)}</dd></div>
        <div><dt className="text-muted">Total tokens</dt><dd className="tabular-nums text-fg-soft">{formatTokens(usage.tokens.total_tokens)}</dd></div>
      </dl>
      {Object.keys(usage.by_model).length ? (
        <table className="w-full text-xs">
          <caption className="sr-only">Usage by model</caption>
          <thead>
            <tr className="text-left text-muted"><th className="pb-1 font-normal">Model</th><th className="pb-1 text-right font-normal">Calls</th><th className="pb-1 text-right font-normal">Cost</th></tr>
          </thead>
          <tbody>
            {Object.entries(usage.by_model).map(([model, entry]) => (
              <tr key={model} className="border-t border-line">
                <td className="max-w-0 truncate py-1.5 pr-2 font-mono text-fg-soft" title={model}>{model.includes("/") ? model.slice(model.indexOf("/") + 1) : model}</td>
                <td className="py-1.5 text-right tabular-nums text-fg-soft">{entry.calls}</td>
                <td className="py-1.5 text-right tabular-nums text-fg-soft">{entry.calls_without_cost === entry.calls ? "not reported" : formatUsd(entry.cost_usd, { complete: entry.calls_without_cost === 0 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function Meter({ label, detail, ratio, warn, exceeded }: { label: string; detail: string; ratio: number; warn: boolean; exceeded: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-muted">{label}</span><span className="tabular-nums text-fg-soft">{detail}</span></div>
      <div className="mt-1.5 h-1.5 rounded-full bg-line-strong" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
        <div className={`h-1.5 rounded-full ${exceeded ? "bg-bad" : warn ? "bg-warn" : "bg-glacier"}`} style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}
