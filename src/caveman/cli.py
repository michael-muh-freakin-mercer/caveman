"""`caveman` command: run the API server or a durable execution worker."""
from __future__ import annotations

import argparse
import sys

from dotenv import load_dotenv

from .config import Settings, SettingsError


def main(argv: list[str] | None = None) -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(prog="caveman", description="Caveman: type what you want, Caveman builds it.")
    commands = parser.add_subparsers(dest="command", required=True)
    api = commands.add_parser("api", help="Serve the Caveman API (private; the web app calls it).")
    api.add_argument("--host", default="127.0.0.1")
    api.add_argument("--port", type=int, default=8000)
    commands.add_parser("worker", help="Run a durable execution worker.")
    ops = commands.add_parser("ops", help="Operator commands for runs across all accounts.")
    ops_commands = ops.add_subparsers(dest="ops_command", required=True)
    stuck = ops_commands.add_parser("list", help="List runs with their state (newest first).")
    stuck.add_argument("--attention", action="store_true", help="Only runs that need an operator or user")
    requeue = ops_commands.add_parser("requeue", help="Queue a recovery job for a run with no active job.")
    requeue.add_argument("run_id")
    abandon = ops_commands.add_parser("abandon", help="Close a run through the kernel's abandon rules.")
    abandon.add_argument("run_id")
    abandon.add_argument("--reason", required=True)
    ops_commands.add_parser("purge-orphans", help="Remove data no account owns (left by an interrupted deletion).")
    migrate = ops_commands.add_parser(
        "migrate-to-postgres",
        help="Copy SQLite state into CAVEMAN_DATABASE_URL (API and workers stopped; empty target).")
    migrate.add_argument("--dry-run", action="store_true", help="Copy inside a transaction, then roll back")
    migrate.add_argument("--auth-sqlite", help="Also copy the web app's Better Auth SQLite file ...")
    migrate.add_argument("--auth-url", help="... into this postgres:// URL (the web app's new AUTH_DATABASE_URL)")
    args = parser.parse_args(argv)
    try:
        settings = Settings.from_env()
    except SettingsError as exc:
        raise SystemExit(f"Caveman configuration error: {exc}") from exc
    if args.command == "api":
        import uvicorn

        from .api import create_app
        uvicorn.run(create_app(settings), host=args.host, port=args.port, proxy_headers=False,
                    log_level="info")
    elif args.command == "worker":
        from .worker import main as worker_main
        worker_main(settings)
    elif args.command == "ops" and args.ops_command == "migrate-to-postgres":
        # Before run_ops: that opens the stores at CAVEMAN_DATABASE_URL as live ones.
        from pathlib import Path

        from .migrate import MigrationRefused, migrate_to_postgres
        try:
            results = migrate_to_postgres(settings, dry_run=args.dry_run,
                                          auth_sqlite=Path(args.auth_sqlite) if args.auth_sqlite else None,
                                          auth_url=args.auth_url)
        except MigrationRefused as exc:
            raise SystemExit(f"Migration refused, nothing was copied: {exc}") from exc
        for result in results:
            print(f"{result.name}: {result.source} -> {result.schema}: "
                  + ", ".join(f"{table} {count}" for table, count in result.tables.items()))
        print("Dry run: rolled back, nothing was kept." if args.dry_run
              else "Copied. Keep CAVEMAN_DATABASE_URL set and start the API and workers.")
    elif args.command == "ops":
        from .ops import run_ops
        raise SystemExit(run_ops(settings, args))


if __name__ == "__main__":
    main(sys.argv[1:])
