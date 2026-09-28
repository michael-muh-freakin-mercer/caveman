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


def cost_history(engine, platform, *, days: int = 30, min_builds: int = 5,
                 now: datetime | None = None) -> dict:
    """What recent builds on this server actually cost, per model mode.

    Only completed runs whose every model call reported a cost count, so the
    figures are real spend, never token-based guesses. A mode with fewer than
    ``min_builds`` such runs reports no figures: too few to tell a user what to
    expect. Figures are aggregates across accounts; no single run is exposed.
    """
    now = now or datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).isoformat()
    costs: dict[str, list[float]] = {}
    for record in platform.all_runs():
        if record.created_at < since:
            continue
        try:
            run = engine.load(record.id)
        except Exception:
            continue
        if run.status != "completed" or not run.usage_records:
            continue
        reported = [usage_cost(usage.raw_usage) for usage in run.usage_records]
        if any(cost is None for cost in reported):
            continue
        costs.setdefault(record.model_mode, []).append(sum(reported))
    modes = {}
    for mode, values in costs.items():
        values.sort()
        if len(values) < min_builds:
            modes[mode] = {"builds": len(values), "median_usd": None, "low_usd": None, "high_usd": None}
            continue
        # The middle 80% (10th to 90th percentile, nearest rank) keeps one outlier from setting the range.
        def rank(q: float) -> float:
            return values[min(len(values) - 1, max(0, round(q * (len(values) - 1))))]
        modes[mode] = {"builds": len(values), "median_usd": round(rank(0.5), 4),
                       "low_usd": round(rank(0.1), 4), "high_usd": round(rank(0.9), 4)}
    return {"window_days": days, "min_builds": min_builds, "modes": modes}

