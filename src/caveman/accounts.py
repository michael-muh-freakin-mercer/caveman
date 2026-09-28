"""Account-level spending: a monthly USD cap and a monthly model-call cap per user.

A per-run budget alone does not bound what one account can spend, so every
account also has monthly ceilings. Cost counts only provider-reported cost; the
call cap bounds calls whose cost the provider did not report.
"""
from __future__ import annotations

from datetime import datetime, timezone

from walter.usage import usage_cost


def month_start(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


def account_usage(engine, platform, settings, owner_id: str, *, now: datetime | None = None) -> dict:
    since = month_start(now)
    cost, calls, unknown = 0.0, 0, 0
    for record in platform.list_runs(owner_id):
        try:
            run = engine.load(record.id)
        except Exception:
            continue
        for usage in run.usage_records:
            if usage.created_at < since:
                continue
            calls += 1
            reported = usage_cost(usage.raw_usage)
            if reported is None:
                unknown += 1
            else:
                cost += reported
    limit_usd = settings.account_monthly_budget_usd
    limit_calls = settings.account_monthly_max_calls
    return {
        "period_start": since,
        "spent_usd": round(cost, 6),
        "limit_usd": limit_usd,
        "remaining_usd": max(0.0, round(limit_usd - cost, 6)),
        "model_calls": calls,
        "max_model_calls": limit_calls,
        "remaining_calls": max(0, limit_calls - calls),
        "calls_without_cost": unknown,
        "cost_complete": unknown == 0,
        "exhausted": cost >= limit_usd or calls >= limit_calls,
        "warning": cost >= limit_usd * settings.budget_warning_ratio
                   or calls >= limit_calls * settings.budget_warning_ratio,
    }
