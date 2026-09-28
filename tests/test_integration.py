"""Integration branch: accepted candidates fast-forward a staging ref with exactly
their validated bytes, later candidates build on it, and stale bases are refused."""
import subprocess

import pytest

from walter.models import FailureClass, TaskNode, TaskStatus
from walter.contracts import TaskPacket, WorkerResult
from walter.orchestration import GateError, Orchestrator
from walter.sandbox import INTEGRATION_REF, IntegrationStale, SandboxViolation, WorkspaceManager
from walter.store import SQLiteStore


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                          text=True).stdout.strip()


@pytest.fixture
def manager(tmp_path):
    repo = tmp_path / "project"
    repo.mkdir()
    (repo / "README.md").write_text("# project\n")
    (repo / "old.py").write_text("OLD = 1\n")
    (repo / ".gitignore").write_text(".local/\ndist/\n")
    git(repo, "init", "-q")
    git(repo, "add", ".")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init")
    return WorkspaceManager(repo), repo


def test_integration_branch_starts_at_head_and_is_not_the_checked_out_branch(manager):
    workspaces, repo = manager
    assert workspaces.integration_head() is None
    head = workspaces.integration_head(create=True)
    assert head == git(repo, "rev-parse", "HEAD")
    assert git(repo, "branch", "--show-current") != "walter-integration"
    assert workspaces.integration_head(create=True) == head  # idempotent


def test_integrate_fast_forwards_exactly_the_candidate_inventory(manager):
    workspaces, repo = manager
    base = workspaces.integration_head(create=True)
    grant = workspaces.create_candidate("run", "a", "author", base_revision=base)
    workspaces.write_file(grant.id, "app.py", "APP = 1\n", worker_id="author")
    workspaces.write_file(grant.id, "dist/bundle.js", "built\n", worker_id="author")  # gitignored, still delivered
    workspaces.delete_file(grant.id, "old.py", worker_id="author")
    fingerprint = workspaces.freeze(grant.id)
    commit = workspaces.integrate(grant.id, fingerprint, "Add app")
    assert git(repo, "rev-parse", INTEGRATION_REF) == commit
    assert git(repo, "rev-parse", f"{commit}^") == base
    files = set(git(repo, "ls-tree", "-r", "--name-only", commit).splitlines())
    assert {"app.py", "dist/bundle.js", "README.md"} <= files and "old.py" not in files
    assert git(repo, "show", f"{commit}:app.py") == "APP = 1"
    # The user's branch and working tree are untouched.
    assert git(repo, "rev-parse", "HEAD") == base and (repo / "old.py").exists()
    # Integrating the same candidate twice is refused: the head has moved past its base.
    with pytest.raises(IntegrationStale):
        workspaces.integrate(grant.id, fingerprint, "Add app")


def test_changed_candidate_or_stale_base_is_refused(manager):
    workspaces, _ = manager
    base = workspaces.integration_head(create=True)
    first = workspaces.create_candidate("run", "a", "a-author", base_revision=base)
    second = workspaces.create_candidate("run", "b", "b-author", base_revision=base)
    workspaces.write_file(first.id, "a.py", "A = 1\n", worker_id="a-author")
    workspaces.write_file(second.id, "b.py", "B = 1\n", worker_id="b-author")
    with pytest.raises(SandboxViolation, match="changed after acceptance"):
        workspaces.integrate(first.id, "0" * 64, "A")
    workspaces.integrate(first.id, workspaces.freeze(first.id), "A")
    with pytest.raises(IntegrationStale):
        workspaces.integrate(second.id, workspaces.freeze(second.id), "B")


def test_carry_over_replays_a_previous_attempt_onto_a_newer_base(manager):
    workspaces, repo = manager
    base = workspaces.integration_head(create=True)
    first = workspaces.create_candidate("run", "a", "a-author", base_revision=base)
    stale = workspaces.create_candidate("run", "b", "b-author", base_revision=base)
    workspaces.write_file(first.id, "a.py", "A = 1\n", worker_id="a-author")
    workspaces.write_file(stale.id, "b.py", "B = 1\n", worker_id="b-author")
    workspaces.integrate(first.id, workspaces.freeze(first.id), "A")
    retry = workspaces.create_candidate("run", "b", "b-retry",
                                        base_revision=workspaces.integration_head())
    assert workspaces.carry_over(stale.id, retry.id) is True
    assert set(workspaces.list_files(retry.id)) >= {"a.py", "b.py"}
    assert workspaces.changed_paths(retry.id) == ["b.py"]
    commit = workspaces.integrate(retry.id, workspaces.freeze(retry.id), "B")
    assert {"a.py", "b.py"} <= set(git(repo, "ls-tree", "-r", "--name-only", commit).splitlines())


def test_conflicting_carry_over_leaves_a_clean_workspace(manager):
    workspaces, _ = manager
    base = workspaces.integration_head(create=True)
    first = workspaces.create_candidate("run", "a", "a-author", base_revision=base)
    stale = workspaces.create_candidate("run", "b", "b-author", base_revision=base)
    workspaces.write_file(first.id, "shared.py", "X = 'from a'\n", worker_id="a-author")
    workspaces.write_file(stale.id, "shared.py", "X = 'from b'\n", worker_id="b-author")
    workspaces.integrate(first.id, workspaces.freeze(first.id), "A")
    retry = workspaces.create_candidate("run", "b", "b-retry",
                                        base_revision=workspaces.integration_head())
    assert workspaces.carry_over(stale.id, retry.id) is False
    assert workspaces.changed_paths(retry.id) == []
    assert workspaces.read_file(retry.id, "shared.py") == "X = 'from a'\n"


def _accepted_workspace_run(tmp_path):
    core = Orchestrator(SQLiteStore(tmp_path / "ops.db"))
    run = core.create_run("objective", ["criterion that is measurable"])
    packet = TaskPacket(task_id="t", role="dev", objective="o", deliverable="d",
                        acceptance_criteria=["c"], stop_condition="s")
    core.add_tasks(run.id, [TaskNode(packet=packet, required_checks=["pytest"], review_required=True)])
    core.bind_workspace(run.id, "t", "ws")
    assignment = core.delegate(run.id, "t", "worker")
    core.start(run.id, "t")
    result = WorkerResult(task_id="t", status="completed", summary="s", deliverable="code")
    artifact = core.submit(run.id, "t", assignment.id, "worker", result, workspace_fingerprint="f" * 64)
    core.validate(run.id, artifact.id, "pytest", True, "ok", "executor", workspace_fingerprint="f" * 64)
    core.review(run.id, artifact.id, "reviewer", True, "ok", workspace_fingerprint="f" * 64)
    return core, run.id, artifact.id


def test_kernel_records_integration_only_for_accepted_workspace_artifacts(tmp_path):
    core, run_id, artifact_id = _accepted_workspace_run(tmp_path)
    with pytest.raises(GateError, match="canonical accepted"):
        core.record_integration(run_id, artifact_id, "a" * 40)
    core.accept(run_id, "t", reason="gates passed", workspace_fingerprint="f" * 64)
    with pytest.raises(GateError, match="full object id"):
        core.record_integration(run_id, artifact_id, "abc")
    core.record_integration(run_id, artifact_id, "a" * 40)
    core.record_integration(run_id, artifact_id, "a" * 40)  # idempotent
    with pytest.raises(GateError, match="different commit"):
        core.record_integration(run_id, artifact_id, "b" * 40)
    run = core.get_run(run_id)
    assert run.artifacts[artifact_id].integrated_commit == "a" * 40
    assert [e.kind for e in core.store.events(run_id)].count("artifact.integrated") == 1


def test_stale_base_failure_routes_to_retry(tmp_path):
    core, run_id, _ = _accepted_workspace_run(tmp_path)
    failure = core.fail(run_id, "t", FailureClass.STALE_BASE, "integration moved")
    decision = core.recover(run_id, failure.id, "rebuild on current code")
    assert decision.action == "RETRY"
    assert core.get_run(run_id).tasks["t"].status == TaskStatus.READY
