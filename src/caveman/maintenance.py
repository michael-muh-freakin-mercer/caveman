"""Periodic cleanup, run by one worker per interval.

- Candidate worktrees, branches and grants of finished runs are retired through
  the sandbox's own ``retire_run`` once nothing can need them: a completed run
  whose delivery archive is ready (its code is on the integration branch and in
  the archive), or a run the kernel closed any other way.
- Cached npm installs unused for ``node_deps_max_age_days`` are removed; a later
  build simply installs them again.
- Rate-limit records older than a day are pruned.

Each project is held with a platform lease while it is cleaned, so no job of
that project runs at the same time; a project that is busy is skipped until the
next pass. Durable run history is never touched.
"""
from __future__ import annotations

import logging
import shutil
import time
from uuid import uuid4

from walter.sandbox import WorkspaceManager

logger = logging.getLogger("caveman.maintenance")

LEASE_SECONDS = 900


def _prune_node_deps(repo, cutoff: float) -> int:
    root = repo / ".local" / "sandboxes" / "node-deps"
    removed = 0
    if not root.is_dir():
        return 0
    for entry in root.iterdir():
        marker = entry / ".complete"
        try:
            stale = entry.is_dir() and not entry.is_symlink() and (
                not marker.exists() or marker.stat().st_mtime < cutoff)
        except OSError:
            continue
        if stale:
            shutil.rmtree(entry, ignore_errors=True)
            removed += 1
    return removed


def _finished(engine, platform, record) -> bool:
    status = engine.load(record.id).status
    if status == "completed":
        delivery = platform.delivery(record.id)
        return delivery is not None and delivery.status == "ready"
    return status != "active"


def run_maintenance(settings, engine, platform, *, now: float | None = None) -> dict:
    now = time.time() if now is None else now
    holder = f"maintenance:{uuid4().hex[:12]}"
    cutoff = now - settings.node_deps_max_age_days * 86400
    retire: dict[str, list[str]] = {}
    for record in platform.unretired_runs():
        try:
            if _finished(engine, platform, record):
                retire.setdefault(record.project_id, []).append(record.id)
        except KeyError:
            platform.mark_retired(record.id)  # no kernel record left
    _, projects = platform.known_ids()
    summary = {"runs_retired": 0, "node_deps_pruned": 0, "projects_skipped": 0}
    for project_id in sorted(projects):
        repo = engine.project_repo(project_id)
        if not repo.is_dir():
            continue
        if not platform.acquire_project(project_id, holder, LEASE_SECONDS, now=now):
            summary["projects_skipped"] += 1
            continue
        try:
            run_ids = retire.get(project_id, [])
            if run_ids:
                workspaces = WorkspaceManager(repo)
                for run_id in run_ids:
                    workspaces.retire_run(run_id)
                    platform.mark_retired(run_id)
                    summary["runs_retired"] += 1
            summary["node_deps_pruned"] += _prune_node_deps(repo, cutoff)
        except Exception:
            logger.exception("Maintenance failed for project %s", project_id)
        finally:
            platform.release_project(project_id, holder)
    summary["rate_events_pruned"] = platform.prune_rate_events(now - 86400)
    logger.info("Maintenance pass", extra=summary)
    return summary
