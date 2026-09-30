"""Operator commands. They act on durable state directly and never spend credits."""
from __future__ import annotations

import json

from .engine import Engine
from .views import Projector

ATTENTION = {"approval_needed", "waiting", "blocked", "paused", "budget_reached", "failed", "recovering"}


def run_ops(settings, args) -> int:
    engine = Engine(settings)
    platform = settings.open_platform_store()
    projector = Projector(engine.redact, settings)
    try:
        if args.ops_command == "list":
            rows = []
            for record in platform.all_runs():
                run = engine.load(record.id)
                state = projector.run_state(run, platform.jobs(record.id))
                if args.attention and state["state"] not in ATTENTION:
                    continue
                last = platform.latest_job(record.id)
                rows.append({"run_id": record.id, "owner": record.owner_id, "state": state["state"],
                             "created_at": record.created_at,
                             "last_job": {"kind": last.kind, "status": last.status, "outcome": last.outcome}
                             if last else None})
            print(json.dumps(rows, indent=2))
            return 0
        if args.ops_command == "requeue":
            if engine.load(args.run_id).status != "active":
                print("Run is not active.")
                return 1
            job, created = platform.enqueue(args.run_id, "recover")
            print(json.dumps({"job_id": job.id, "created": created, "status": job.status}))
            return 0 if created else 1
        if args.ops_command == "abandon":
            if platform.active_job(args.run_id) is not None:
                print("Run has an active job; wait for it or stop it first.")
                return 1
            run = engine.abandon(args.run_id, args.reason, actor_id="cavman-operator")
            print(json.dumps({"run_id": run.id, "status": run.status}))
            return 0
        if args.ops_command == "purge-orphans":
            from .erasure import purge_orphans
            print(json.dumps(purge_orphans(settings, engine, platform)))
            return 0
    finally:
        platform.close()
    return 2
