import { formatUsd } from "@/lib/format";
import type { EstimateView } from "@/lib/types";

/**
 * What a build is likely to cost, from what recent builds here actually cost.
 * Never a guess: with too little history it says so and shows only the limits.
 */
export function CostEstimate({ estimate, mode, modeLabel, budget }: {
  estimate: EstimateView;
  mode: string;
  modeLabel: string;
  budget: number;
}) {
  const history = estimate.modes[mode];
  const account = estimate.account;
  const remaining = account.remaining_usd;
  const ceiling = Number.isFinite(budget) && budget > 0 ? budget : estimate.default_budget_usd;
  const typical =
    history && history.median_usd !== null && history.low_usd !== null && history.high_usd !== null ? (
      <>
        Recent {modeLabel} builds here cost about <strong className="font-medium text-fg">{formatUsd(history.median_usd)}</strong>{" "}
        (most between {formatUsd(history.low_usd)} and {formatUsd(history.high_usd)}; {history.builds} builds in the last{" "}
        {estimate.window_days} days). Bigger requests cost more.
      </>
    ) : (
      <>No cost history for {modeLabel} builds yet, so Cavman can&rsquo;t say what this one will cost.</>
    );
  return (
    <div data-testid="cost-estimate" className="mt-4 rounded-lg border border-line bg-surface/60 px-4 py-3 text-xs leading-relaxed text-muted">
      <p>{typical}</p>
      <p className="mt-1">
        This build stops at <span className="text-fg-soft">{formatUsd(ceiling)}</span>. You have{" "}
        {account.cost_complete ? null : "at most "}
        <span className="text-fg-soft">{formatUsd(remaining)}</span> of {formatUsd(account.limit_usd)} and{" "}
        {account.remaining_calls} of {account.max_model_calls} model calls left this month.
        {account.cost_complete
          ? null
          : ` ${account.calls_without_cost} ${account.calls_without_cost === 1 ? "call" : "calls"} reported no cost, so you may have less.`}
      </p>
      {account.exhausted || remaining <= 0 || account.remaining_calls <= 0 ? (
        <p role="status" className="mt-1 text-warn">
          Your monthly allowance is used up, so new builds can&rsquo;t start until next month or an operator raises the limit.
        </p>
      ) : remaining < ceiling || account.remaining_calls < estimate.default_max_model_calls ? (
        <p role="status" className="mt-1 text-warn">
          Your remaining monthly allowance is below this build&rsquo;s limits, so it may pause before finishing.
        </p>
      ) : null}
    </div>
  );
}
