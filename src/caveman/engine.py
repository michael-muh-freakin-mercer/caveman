"""Thin trusted boundary between the Caveman platform and the orchestration core.

Every mutation here is a call into the existing kernel (``walter.orchestration``),
which reloads the run, authorizes the transition and commits it with its events.
Nothing in this module records validation, review, acceptance or completion: the
platform has no way to forge them, and neither does the browser.
"""
from __future__ import annotations

import re
import sqlite3
import subprocess
from contextlib import contextmanager
from pathlib import Path

from walter.adapter import INITIAL_COMPLETION_CRITERION
from walter.models import ApprovalStatus, Event, Run
from walter.orchestration import GateError, Orchestrator
from walter.store import ConcurrentUpdate

from .config import Settings

_GIT_ENV = {"PATH": "/usr/bin:/bin", "HOME": "/nonexistent", "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_TERMINAL_PROMPT": "0"}

PROJECT_GITIGNORE = """# Caveman orchestration state (candidate worktrees, grants). Never delivered.
.local/
__pycache__/
.pytest_cache/
"""


class ApprovalScopeChanged(ValueError):
    """The approval shown to the user is no longer the exact pending request."""


def git(*args: str, cwd: Path | None = None) -> str:
    """Run git with hooks, global config and prompts disabled."""
    result = subprocess.run(
        ["/usr/bin/git", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false",
         "-c", "user.name=Caveman", "-c", "user.email=caveman@localhost", *args],
        cwd=cwd, env=_GIT_ENV, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"git {args[0]} failed")
    return result.stdout


_SECRET_PATTERNS = [
    re.compile(r"sk-or-v1-[A-Za-z0-9]{8,}"),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/=-]{16,}"),
]


class Redactor:
    """Remove host paths and credential-shaped strings from user-facing text."""

    def __init__(self, settings: Settings):
        self._paths = sorted({str(settings.data_dir), str(Path.home()),
                              str(Path(__file__).resolve().parents[2])}, key=len, reverse=True)

    def __call__(self, text: str | None, limit: int | None = None) -> str:
        if not text:
            return ""
        for path in self._paths:
            if path and path != "/":
                text = text.replace(path, "<caveman>")
        text = re.sub(r"<caveman>/projects/[0-9a-f]{32}/repo", "<project>", text)
        for pattern in _SECRET_PATTERNS:
            text = pattern.sub("[redacted]", text)
        if limit is not None and len(text) > limit:
            omitted = len(text) - limit
            text = f"[{omitted} earlier characters omitted]\n" + text[-limit:]
        return text


class Engine:
    def __init__(self, settings: Settings):
        self.settings = settings
        settings.ensure_directories()
        if not settings.database_url:
            # WAL lets the API read run state while a worker commits; the setting is
            # persistent on the database file and changes no kernel semantics.
            connection = sqlite3.connect(str(settings.operations_db))
            try:
                connection.execute("PRAGMA journal_mode=WAL")
            finally:
                connection.close()
        with self.core():  # creates the operational schema on first use
            pass
        self.redact = Redactor(settings)

    @contextmanager
    def core(self):
        store = self.settings.open_operations_store()
        try:
            yield Orchestrator(store)
        finally:
            store.close()

    def project_repo(self, project_id: str) -> Path:
        if not re.fullmatch(r"[0-9a-f]{32}", project_id):
            raise ValueError("Invalid project identifier")
        return self.settings.projects_dir / project_id / "repo"

    def init_project_repo(self, project_id: str, name: str, description: str) -> Path:
        """Create the project's own repository; generated work never lands in Caveman's."""
        repo = self.project_repo(project_id)
        repo.mkdir(parents=True, exist_ok=False)
        git("init", "-q", "-b", "main", cwd=repo)
        (repo / ".gitignore").write_text(PROJECT_GITIGNORE)
        summary = description.strip().splitlines()[0][:500] if description.strip() else ""
        (repo / "README.md").write_text(f"# {name}\n\n{summary}\n\nCreated by Caveman.\n")
        git("add", ".gitignore", "README.md", cwd=repo)
        git("commit", "-q", "-m", "Initialize project", cwd=repo)
        return repo

    def create_run(self, objective: str, constraints: list[str]) -> Run:
        with self.core() as core:
            return core.create_run(objective, [INITIAL_COMPLETION_CRITERION], constraints=constraints)

    def load(self, run_id: str) -> Run:
        with self.core() as core:
            return core.get_run(run_id)

    def events(self, run_id: str, after: int = 0) -> list[Event]:
        with self.core() as core:
            return [event for event in core.store.events(run_id) if event.sequence > after]

    def version(self, run_id: str) -> tuple[int, int]:
        """(snapshot version, event cursor) without loading the full snapshot."""
        with self.core() as core:
            return core.store.version_info(run_id)

    def decide_approval(self, run_id: str, approval_id: str, *, approved: bool, human_id: str,
                        reason: str, expected_scope_digest: str) -> Run:
        """Record a human decision on exactly the request the user was shown.

        The client must echo the scope digest it displayed. If the pending
        request's digest differs (superseded, replaced, or never shown), the
        decision is refused rather than applied to a scope nobody reviewed.
        """
        for attempt in range(3):
            with self.core() as core:
                run = core.get_run(run_id)
                request = run.approvals.get(approval_id)
                if request is None:
                    raise KeyError(approval_id)
                if request.status != ApprovalStatus.PENDING:
                    raise GateError(f"This approval is no longer pending (status: {request.status.value}).")
                if request.scope_digest != expected_scope_digest:
                    raise ApprovalScopeChanged(
                        "The approval request changed since it was displayed. Review the current scope.")
                try:
                    core.decide_approval(run_id, approval_id, approved=approved,
                                         human_id=human_id, reason=reason)
                    return core.get_run(run_id)
                except ConcurrentUpdate:
                    if attempt == 2:
                        raise
        raise AssertionError("unreachable")

    def abandon(self, run_id: str, reason: str, actor_id: str) -> Run:
        with self.core() as core:
            return core.abandon(run_id, reason, actor_id=actor_id)

    def recover_interrupted(self, run_id: str) -> bool:
        """Apply the core's offline interruption recovery when work was in flight.

        ``Orchestrator.resume`` converts DELEGATED/RUNNING assignments to FAILED
        with TIMEOUT evidence, so recovery is an explicit Manager decision.
        """
        from walter.models import TaskStatus

        with self.core() as core:
            run = core.get_run(run_id)
            if run.status != "active":
                return False
            if not any(task.status in {TaskStatus.DELEGATED, TaskStatus.RUNNING}
                       for task in run.tasks.values()):
                return False
            core.resume(run_id)
            return True
