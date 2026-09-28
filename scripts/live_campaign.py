#!/usr/bin/env python3
"""Run a batch of real build requests through Caveman and report what happened.

This spends provider credits when run with the default executor. Every run has
its own ceiling (--run-budget-usd), and the campaign stops starting new runs
once --total-budget-usd of provider-reported cost has been spent.

    .venv/bin/python scripts/live_campaign.py                      # real models
    .venv/bin/python scripts/live_campaign.py --executor scripted  # free dry run

The report (markdown + JSON) records, per request: final state, tasks accepted,
failure classes, model calls by role, provider-reported cost (and whether some
calls reported none), elapsed time and delivered files.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src"))

from dotenv import load_dotenv  # noqa: E402

DEFAULT_PROMPTS = [
    "Build a Python library that parses and validates ISO 8601 durations, with tests",
    "Build a command-line todo manager in Python that stores tasks in a JSON file, with tests",
    "Build a TypeScript module that formats money amounts for several currencies, with node:test tests",
    "Build a Python REST-style request router (no framework) with path parameters, with tests",
    "Build a booking availability engine for a tattoo studio in Python, with tests",
    "Build a TypeScript rate limiter (token bucket) with node:test tests",
    "Write a product specification for a habit-tracking app, then implement its streak calculation in Python",
    "Build a Python markdown-to-HTML converter supporting headings, emphasis and lists, with tests",
    "Build a TypeScript CSV parser that handles quoted fields, with node:test tests",
    "Build an inventory check-out tracker core in Python (items, check-out, return, overdue), with tests",
]


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--prompts", type=Path, help="File with one build request per line")
    parser.add_argument("--limit", type=int, default=None, help="Run only the first N requests")
    parser.add_argument("--run-budget-usd", type=float, default=1.0)
    parser.add_argument("--total-budget-usd", type=float, default=10.0)
    parser.add_argument("--max-calls", type=int, default=150, help="Model-call ceiling per run")
    parser.add_argument("--executor", choices=["provider", "scripted"], default="provider")
    parser.add_argument("--orchestration", choices=["workflow", "manager"], default="workflow")
    parser.add_argument("--data-dir", type=Path, help="Keep campaign state here (default: temporary)")
    parser.add_argument("--out", type=Path, default=REPO / "docs" / "live-campaign")
    parser.add_argument("--allow-unknown-cost", action="store_true",
                        help="Keep going after a run whose provider did not report cost for every call "
                             "(by default the campaign stops, because the spend cap could not be enforced)")
    parser.add_argument("--auto-approve-capabilities", action="store_true",
                        help="Approve specialist capability requests automatically (campaign data only)")
    parser.add_argument("--min-completion", type=float, default=None, metavar="RATE",
                        help="Exit 1 if fewer than this share of requests complete (e.g. 1.0 for all); "
                             "for CI, where a report alone would pass silently")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    load_dotenv(REPO / ".env")
    args = parse_args(argv)
    from walter.runtime import RuntimeConfig, RuntimeConfigurationError

    if args.executor == "provider":
        try:
            config = RuntimeConfig.from_env()
        except RuntimeConfigurationError as exc:
            print(f"Refusing to start: {exc}", file=sys.stderr)
            return 2
        models = f"{config.manager_model} / {config.worker_model}"
    else:
        models = "scripted"

    from fastapi.testclient import TestClient

    from caveman.api import create_app
    from caveman.config import Settings
    from caveman.worker import Worker

    prompts = (args.prompts.read_text().splitlines() if args.prompts else DEFAULT_PROMPTS)
    prompts = [p.strip() for p in prompts if p.strip()][: args.limit]
    data_dir = args.data_dir or Path(tempfile.mkdtemp(prefix="caveman-campaign-"))
    token = "campaign-" + "x" * 40
    settings = Settings(data_dir=data_dir, api_token=token, executor=args.executor,
                        orchestration=args.orchestration, default_budget_usd=args.run_budget_usd,
                        max_budget_usd=max(args.run_budget_usd, 0.01),
                        default_max_model_calls=args.max_calls, scripted_step_delay=0)
    headers = {"Authorization": f"Bearer {token}", "X-Caveman-User": "campaign"}
    rows, spent, halted = [], 0.0, ""
    started_at = datetime.now(timezone.utc)
    with TestClient(create_app(settings)) as client:
        for prompt in prompts:
            if halted:
                rows.append({"prompt": prompt, "state": f"skipped ({halted})"})
                continue
            if spent + args.run_budget_usd > args.total_budget_usd:
                # Start a run only if its whole ceiling still fits under the total.
                rows.append({"prompt": prompt, "state": "skipped (campaign budget reached)"})
                continue
            began = time.monotonic()
            response = client.post("/api/builds", json={"prompt": prompt}, headers=headers)
            if response.status_code != 201:
                rows.append({"prompt": prompt, "state": f"not started ({response.json().get('detail')})"})
                continue
            run_id = response.json()["run_id"]
            for _ in range(10):  # bounded: jobs, approvals and continuations
                worker = Worker(settings)
                try:
                    while asyncio.run(worker.run_once()):
                        pass
                finally:
                    worker.close()
                detail = client.get(f"/api/runs/{run_id}", headers=headers).json()
                pending = [a for a in detail["approvals"] if a["status"] == "pending"]
                if not (pending and args.auto_approve_capabilities):
                    break
                for approval in pending:
                    if approval["action"] != "change_capability":
                        break
                    client.post(f"/api/runs/{run_id}/approvals/{approval['id']}", headers=headers,
                                json={"decision": "approve", "scope_digest": approval["scope_digest"],
                                      "reason": "Live campaign auto-approval of a capability request"})
            detail = client.get(f"/api/runs/{run_id}", headers=headers).json()
            usage = detail["usage"]
            spent += usage["cost_usd"]
            rows.append({
                "prompt": prompt, "run_id": run_id, "state": detail["state"],
                "tasks": f"{detail['tasks_accepted']}/{detail['tasks_total']}",
                "failures": sorted({f["classification"] for f in detail["failure_details"]}),
                "calls": usage["calls"], "calls_by_role": {k: v["calls"] for k, v in usage["by_role"].items()},
                "cost_usd": usage["cost_usd"], "cost_complete": usage["cost_complete"],
                "elapsed_s": round(time.monotonic() - began, 1),
                "files": (detail["delivery"] or {}).get("files", []),
                "last_message": (detail["jobs"][-1]["message"] if detail["jobs"] else "") or "",
            })
            print(f"{detail['state']:>16}  ${usage['cost_usd']:.4f}  {prompt}")
            if not usage["cost_complete"] and args.executor == "provider" and not args.allow_unknown_cost:
                halted = "stopped: the provider did not report cost for every call, so spend cannot be capped"
                print(halted, file=sys.stderr)
    args.out.mkdir(parents=True, exist_ok=True)
    stamp = started_at.strftime("%Y%m%dT%H%M%SZ")
    completed = [r for r in rows if r.get("state") == "complete"]
    costs = sorted(r["cost_usd"] for r in rows if "cost_usd" in r)
    summary = {
        "started_at": started_at.isoformat(), "executor": args.executor, "orchestration": args.orchestration,
        "models": models, "requests": len(rows), "completed": len(completed),
        "completion_rate": round(len(completed) / len(rows), 3) if rows else 0.0,
        "total_cost_usd": round(spent, 6), "median_cost_usd": costs[len(costs) // 2] if costs else None,
        "cost_complete": all(r.get("cost_complete", True) for r in rows), "runs": rows,
    }
    (args.out / f"{stamp}.json").write_text(json.dumps(summary, indent=2))
    lines = [f"# Live campaign {stamp}", "",
             f"Executor: {args.executor} · orchestration: {args.orchestration} · models: {models}", "",
             f"Completed {len(completed)} of {len(rows)} requests "
             f"({summary['completion_rate']:.0%}); provider-reported cost ${spent:.4f}"
             + ("" if summary["cost_complete"] else " (some calls reported no cost)") + ".", "",
             "| Request | State | Tasks | Failures | Calls | Cost | Time |", "|---|---|---|---|---|---|---|"]
    for row in rows:
        lines.append("| {} | {} | {} | {} | {} | {} | {} |".format(
            row["prompt"].replace("|", "/"), row.get("state"), row.get("tasks", ""),
            ", ".join(row.get("failures", [])), row.get("calls", ""),
            f"${row['cost_usd']:.4f}" + ("" if row.get("cost_complete", True) else "+") if "cost_usd" in row else "",
            f"{row['elapsed_s']}s" if "elapsed_s" in row else ""))
    (args.out / f"{stamp}.md").write_text("\n".join(lines) + "\n")
    print(f"Report: {args.out / (stamp + '.md')}")
    if args.min_completion is not None and summary["completion_rate"] < args.min_completion:
        print(f"Completion {summary['completion_rate']:.0%} is below the required "
              f"{args.min_completion:.0%}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
