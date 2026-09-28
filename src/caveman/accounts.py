"""Account-level spending: a monthly USD cap and a monthly model-call cap per user.

A per-run budget alone does not bound what one account can spend, so every
account also has monthly ceilings. Cost counts only provider-reported cost; the
call cap bounds calls whose cost the provider did not report.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from walter.usage import usage_cost


def month_start(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


def _usage_since(engine, records, since: str) -> tuple[float, int, int]:
    """Provider-reported cost, model calls, and calls without a reported cost."""
    cost, calls, unknown = 0.0, 0, 0
    for record in records:
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
    return cost, calls, unknown


def server_usage(engine, platform, *, now: datetime | None = None) -> dict:
    """This month's spend across every account, for the operator metrics.

    Only runs created in this month or the 31 days before it are read, so a
    scrape stays cheap as history grows; calls a run makes more than a month
    after it was created are not counted here (the per-account caps still are).
    """
    since = month_start(now)
    horizon = (datetime.fromisoformat(since) - timedelta(days=31)).isoformat()
    cost, calls, unknown = _usage_since(engine, (r for r in platform.all_runs() if r.created_at >= horizon), since)
    return {"spent_usd": round(cost, 6), "model_calls": calls, "calls_without_cost": unknown}


def account_usage(engine, platform, settings, owner_id: str, *, now: datetime | None = None) -> dict:
    since = month_start(now)
    cost, calls, unknown = _usage_since(engine, platform.list_runs(owner_id), since)
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


def _tree_bytes(path) -> int:
    total = 0
    for root, _, names in os.walk(path):
        for name in names:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total


def account_disk_bytes(settings, platform, owner_id: str) -> int:
    """Bytes held for an account: its project repositories and delivery archives."""
    total = sum(_tree_bytes(settings.projects_dir / project.id) for project in platform.list_projects(owner_id))
    for record in platform.list_runs(owner_id):
        archive = settings.deliveries_dir / f"{record.id}.tar.gz"
        if archive.exists():
            total += archive.stat().st_size
    return total
