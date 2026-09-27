"""Caveman API and worker: ownership, trust boundaries, durable execution, delivery.

Runs use the scripted test executor, so the Manager's *model* is scripted while
every state change goes through the real kernel and every check runs in the real
Bubblewrap sandbox.
"""
import asyncio
import io
import json
import tarfile
import time
from pathlib import Path

import pytest

pytest.importorskip("agents")
pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from caveman.api import create_app, project_name_from_prompt
from caveman.config import Settings, SettingsError
from caveman.platform_store import PlatformStore
from caveman.worker import Worker

TOKEN = "t" * 40
ALICE = {"Authorization": f"Bearer {TOKEN}", "X-Caveman-User": "alice"}
MALLORY = {"Authorization": f"Bearer {TOKEN}", "X-Caveman-User": "mallory"}


def sandbox_available() -> bool:
    return Path("/usr/bin/bwrap").exists() and Path("/usr/bin/prlimit").exists()


needs_sandbox = pytest.mark.skipif(not sandbox_available(), reason="Bubblewrap sandbox unavailable")


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path / "data", api_token=TOKEN, executor="scripted",
                    scripted_step_delay=0, heartbeat_seconds=0.2, lease_seconds=30,
                    stream_max_seconds=1.5, stream_poll_seconds=0.1)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def drain(settings):
    worker = Worker(settings)
    try:
        while asyncio.run(worker.run_once()):
            pass
    finally:
        worker.close()


def build(client, prompt="Build me a booking app for a tattoo studio", headers=ALICE, **extra):
    response = client.post("/api/builds", json={"prompt": prompt, **extra}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_settings_require_strong_service_token_and_refuse_scripted_production(tmp_path):
    with pytest.raises(SettingsError, match="CAVEMAN_API_TOKEN"):
        Settings.from_env({"CAVEMAN_API_TOKEN": "short"})
    with pytest.raises(SettingsError, match="production"):
        Settings.from_env({"CAVEMAN_API_TOKEN": TOKEN, "CAVEMAN_EXECUTOR": "scripted",
                           "CAVEMAN_ENV": "production"})
    with pytest.raises(SettingsError, match="cannot exceed"):
        Settings.from_env({"CAVEMAN_API_TOKEN": TOKEN, "CAVEMAN_DEFAULT_BUDGET_USD": "50",
                           "CAVEMAN_MAX_BUDGET_USD": "10"})
    settings = Settings.from_env({"CAVEMAN_API_TOKEN": TOKEN, "CAVEMAN_DATA_DIR": str(tmp_path)})
    assert settings.default_budget_usd == 5.0 and settings.default_max_model_calls == 300


def test_service_token_and_user_identity_are_required(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/projects").status_code == 401
    assert client.get("/api/projects", headers={"Authorization": "Bearer wrong",
                                                "X-Caveman-User": "alice"}).status_code == 401
    assert client.get("/api/projects", headers={"Authorization": f"Bearer {TOKEN}"}).status_code == 401
    assert client.get("/api/projects", headers={"Authorization": f"Bearer {TOKEN}",
                                                "X-Caveman-User": "bad user!"}).status_code == 401


def test_runs_and_projects_are_private_to_their_owner(client):
    created = build(client)
    run_id, project_id = created["run_id"], created["project_id"]
    assert client.get(f"/api/runs/{run_id}", headers=ALICE).status_code == 200
    for path in (f"/api/runs/{run_id}", f"/api/projects/{project_id}", f"/api/runs/{run_id}/events",
                 f"/api/runs/{run_id}/delivery/download"):
        assert client.get(path, headers=MALLORY).status_code == 404, path
    assert client.post(f"/api/runs/{run_id}/stop", headers=MALLORY).status_code == 404
    assert client.get("/api/runs", headers=MALLORY).json() == {"runs": []}
    other = client.post("/api/builds", json={"prompt": "Hijack", "project_id": project_id}, headers=MALLORY)
    assert other.status_code == 404


def test_browser_cannot_forge_kernel_evidence(client):
    run_id = build(client)["run_id"]
    forged = [
        ("post", f"/api/runs/{run_id}/tasks/core/accept"),
        ("post", f"/api/runs/{run_id}/validations"),
        ("post", f"/api/runs/{run_id}/reviews"),
        ("post", f"/api/runs/{run_id}/complete"),
        ("post", f"/api/runs/{run_id}/artifacts"),
    ]
    for method, path in forged:
        assert getattr(client, method)(path, json={"passed": True}, headers=ALICE).status_code in {404, 405}


def test_new_build_is_queued_not_executed_in_the_request(client, settings):
    created = build(client)
    assert created["run"]["state"] == "starting"
    platform = PlatformStore(settings.platform_db)
    try:
        jobs = platform.jobs(created["run_id"])
    finally:
        platform.close()
    assert [(job.kind, job.status) for job in jobs] == [("start", "queued")]
    detail = client.get(f"/api/runs/{created['run_id']}", headers=ALICE).json()
    assert detail["tasks"] == [] and detail["artifacts"] == [] and detail["usage"]["calls"] == 0
    assert detail["project_name"] == "Booking app for a tattoo studio"


def test_provider_must_be_configured_before_a_run_exists(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    settings = Settings(data_dir=tmp_path / "data", api_token=TOKEN)
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/builds", json={"prompt": "Build a CLI"}, headers=ALICE)
        assert response.status_code == 503
        assert "not configured" in response.json()["detail"]
        assert client.get("/api/runs", headers=ALICE).json() == {"runs": []}
        system = client.get("/api/system", headers=ALICE).json()
        assert system["provider"]["configured"] is False
        assert "OPENROUTER_API_KEY" not in json.dumps(system).replace("OPENROUTER_API_KEY is not set", "")


def test_budget_ceiling_is_bounded(client):
    response = client.post("/api/builds", json={"prompt": "Build an API", "settings": {"budget_usd": 1000}},
                           headers=ALICE)
    assert response.status_code == 422
    run_id = build(client, settings={"budget_usd": 2.5})["run_id"]
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["usage"]["budget"]["limit_usd"] == 2.5
    assert client.patch(f"/api/runs/{run_id}/budget", json={"budget_usd": 7}, headers=ALICE).status_code == 200
    assert client.patch(f"/api/runs/{run_id}/budget", json={"budget_usd": 700}, headers=ALICE).status_code == 422


@needs_sandbox
def test_completed_run_exposes_real_state_and_verified_delivery(client, settings):
    run_id = build(client)["run_id"]
    drain(settings)
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "complete" and detail["stage"] == "deliver"
    assert [t["state"] for t in detail["tasks"]] == ["Accepted", "Accepted"]
    core = next(t for t in detail["tasks"] if t["id"] == "core")
    assert {c["check"]: c["status"] for c in core["required_checks"]} == {"compile": "passed", "pytest": "passed"}
    code = next(a for a in detail["artifacts"] if a["task_id"] == "core")
    assert code["kind"] == "code_change" and code["changed_files"] == ["booking.py", "test_booking.py"]
    pytest_record = next(v for v in code["validations"] if v["check"] == "pytest")
    assert pytest_record["trusted"] and pytest_record["returncode"] == 0 and "2 passed" in pytest_record["output"]
    assert code["review_state"] == "passed"
    titles = [e["title"] for e in detail["timeline"]]
    assert "Build complete" in titles and "Validation passed: Candidate tests" in titles
    assert detail["usage"]["calls"] > 0 and detail["usage"]["cost_complete"] is False
    assert detail["delivery"]["status"] == "ready"
    download = client.get(f"/api/runs/{run_id}/delivery/download", headers=ALICE)
    assert download.status_code == 200
    with tarfile.open(fileobj=io.BytesIO(download.content)) as archive:
        names = archive.getnames()
        root = names[0].split("/")[0]
        assert f"{root}/booking.py" in names and f"{root}/CAVEMAN_BUILD_REPORT.md" in names
        assert f"{root}/docs/caveman/01-spec.md" in names
        assert not any("/.local" in n or n.endswith(".env") for n in names)
    artifact = client.get(f"/api/runs/{run_id}/artifacts/{code['id']}", headers=ALICE).json()
    assert "class Calendar" in artifact["diff"]
    assert str(settings.data_dir) not in json.dumps(detail) + json.dumps(artifact)


@needs_sandbox
def test_failed_validation_is_shown_with_its_recovery(client, settings):
    run_id = build(client, prompt="Booking core #fail-validation")["run_id"]
    drain(settings)
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "complete"
    [failure] = detail["failure_details"]
    assert failure["classification"] == "BAD_OUTPUT"
    assert failure["recovery"]["action"] == "REVISE"
    first, second = [a for a in detail["artifacts"] if a["task_id"] == "core"]
    assert first["status"] == "rejected" and first["validation_state"] == "failed"
    assert second["status"] == "accepted" and second["validation_state"] == "passed"
    assert any(e["title"] == "Validation failed: Candidate tests" for e in detail["timeline"])


@needs_sandbox
def test_approval_is_exact_scoped_and_resumes_execution(client, settings):
    run_id = build(client, prompt="Booking core #approval")["run_id"]
    drain(settings)
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "approval_needed"
    [approval] = [a for a in detail["approvals"] if a["status"] == "pending"]
    assert approval["scope"]["task_id"] == "core" and approval["why"]
    stale = client.post(f"/api/runs/{run_id}/approvals/{approval['id']}",
                        json={"decision": "approve", "scope_digest": "0" * 64}, headers=ALICE)
    assert stale.status_code == 409
    assert client.post(f"/api/runs/{run_id}/approvals/{approval['id']}",
                       json={"decision": "approve", "scope_digest": approval["scope_digest"]},
                       headers=MALLORY).status_code == 404
    decided = client.post(f"/api/runs/{run_id}/approvals/{approval['id']}",
                          json={"decision": "approve", "scope_digest": approval["scope_digest"]}, headers=ALICE)
    assert decided.status_code == 200 and decided.json()["continued"] is True
    again = client.post(f"/api/runs/{run_id}/approvals/{approval['id']}",
                        json={"decision": "reject", "scope_digest": approval["scope_digest"]}, headers=ALICE)
    assert again.status_code == 409
    drain(settings)
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "complete"
    decision = detail["approvals"][0]["decision"]
    assert decision["approved"] is True and decision["decided_by"] == "caveman-user:alice"


def test_stop_cancels_queued_work_and_continue_requeues(client, settings):
    run_id = build(client)["run_id"]
    stopped = client.post(f"/api/runs/{run_id}/stop", headers=ALICE)
    assert stopped.status_code == 202 and stopped.json()["job"]["status"] == "cancelled"
    assert client.get(f"/api/runs/{run_id}", headers=ALICE).json()["state"] == "paused"
    assert client.post(f"/api/runs/{run_id}/stop", headers=ALICE).status_code == 409
    assert client.post(f"/api/runs/{run_id}/continue", json={}, headers=ALICE).status_code == 202
    assert client.post(f"/api/runs/{run_id}/continue", json={}, headers=ALICE).status_code == 409


def test_abandon_uses_kernel_rules(client):
    run_id = build(client)["run_id"]
    assert client.post(f"/api/runs/{run_id}/abandon", json={"reason": "Changed my mind"},
                       headers=ALICE).status_code == 409  # still queued
    client.post(f"/api/runs/{run_id}/stop", headers=ALICE)
    closed = client.post(f"/api/runs/{run_id}/abandon", json={"reason": "Changed my mind"}, headers=ALICE)
    assert closed.status_code == 200 and closed.json()["state"] == "cancelled"


def test_expired_lease_becomes_explicit_recovery(settings, client):
    run_id = build(client)["run_id"]
    platform = PlatformStore(settings.platform_db)
    try:
        job = platform.claim("dead-worker", lease_seconds=0.01)
        assert job.run_id == run_id
        time.sleep(0.05)
        [recovery] = platform.reap_expired(max_recoveries=3)
        assert recovery.kind == "recover" and recovery.status == "queued"
        assert [j.outcome for j in platform.jobs(run_id)][0] == "interrupted"
        assert platform.heartbeat(job.id, "dead-worker", 30) is True  # lost lease stops the old worker
    finally:
        platform.close()
    assert client.get(f"/api/runs/{run_id}", headers=ALICE).json()["state"] == "recovering"


def test_event_stream_emits_state(client):
    run_id = build(client)["run_id"]
    with client.stream("GET", f"/api/runs/{run_id}/stream", headers=ALICE) as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        seen = list(response.iter_lines())  # the server closes the stream at its deadline
    assert "event: state" in seen
    assert any(line.startswith("id: 1") for line in seen)
    assert any('"title": "Build requested"' in line for line in seen)


def test_project_names_come_from_the_request():
    assert project_name_from_prompt("Build me a booking app for a tattoo studio") == \
        "Booking app for a tattoo studio"
    assert project_name_from_prompt("  make an API for invoices #approval ") == "API for invoices"
    assert len(project_name_from_prompt("Build " + "very long words " * 20)) <= 60


@needs_sandbox
def test_spending_ceiling_pauses_the_run_safely(settings):
    from dataclasses import replace
    limited = replace(settings, default_max_model_calls=3)
    with TestClient(create_app(limited)) as client:
        run_id = build(client)["run_id"]
        drain(limited)
        detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "budget_reached"
    assert detail["jobs"][-1]["outcome"] == "budget_exceeded"
    assert detail["usage"]["calls"] == 3 and detail["usage"]["budget"]["exceeded"] is True


@needs_sandbox
def test_stopping_a_running_build_records_interruption_honestly(settings):
    from dataclasses import replace
    slow = replace(settings, scripted_step_delay=0.3, heartbeat_seconds=0.1)
    with TestClient(create_app(slow)) as client:
        run_id = build(client)["run_id"]

        async def scenario():
            worker = Worker(slow)
            try:
                running = asyncio.create_task(worker.run_once())
                await asyncio.sleep(1.2)
                assert client.post(f"/api/runs/{run_id}/stop", headers=ALICE).status_code == 202
                await running
            finally:
                worker.close()
        asyncio.run(scenario())
        detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "paused" and detail["jobs"][-1]["outcome"] == "cancelled"
    assert detail["status"] == "active"
    assert not any(t["status"] in {"DELEGATED", "RUNNING"} for t in detail["tasks"])


@needs_sandbox
def test_sandbox_probe_reports_real_usability(client):
    from caveman.sandbox_probe import probe
    usable, detail = probe(max_age=0)
    assert usable, detail
    assert client.get("/api/system", headers=ALICE).json()["sandbox"]["available"] is True


def test_worker_refuses_to_start_without_isolation(settings, monkeypatch):
    import caveman.sandbox_probe as sandbox_probe
    from caveman import worker as worker_module
    monkeypatch.setattr(sandbox_probe, "probe", lambda **_: (False, "no namespaces"))
    with pytest.raises(SystemExit, match="refuses to start: no namespaces"):
        worker_module.main(settings)


@needs_sandbox
def test_dependent_code_tasks_build_on_integrated_work(client, settings):
    run_id = build(client, prompt="Booking API #dependent")["run_id"]
    drain(settings)
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "complete"
    api = next(a for a in detail["artifacts"] if a["task_id"] == "api")
    # The regression check ran the core's tests inside the api workspace: the
    # api candidate was built on the integrated core, not on an empty repo.
    regression = next(v for v in api["validations"] if v["check"] == "pytest_regression")
    assert regression["status"] == "passed" and "test_booking.py" in regression["command"]
    commits = [a["integrated_commit"] for a in detail["artifacts"]]
    assert all(commits) and len(set(commits)) == 2
    assert detail["delivery"]["commit"] == api["integrated_commit"]
    assert detail["delivery"]["files"] == ["api.py", "booking.py", "test_api.py", "test_booking.py"]
    assert sum(e["title"].startswith("Merged into the project") for e in detail["timeline"]) == 2


@needs_sandbox
def test_parallel_task_on_stale_base_is_rebuilt_with_its_work_carried_over(client, settings):
    run_id = build(client, prompt="Booking #parallel")["run_id"]
    drain(settings)
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "complete"
    [failure] = detail["failure_details"]
    assert failure["classification"] == "STALE_BASE" and failure["recovery"]["action"] == "RETRY"
    # Whichever task was accepted second was rebuilt on the integrated first.
    first, second = [a for a in detail["artifacts"] if a["task_id"] == failure["task_id"]]
    assert first["status"] == "rejected" and first["integrated_commit"] is None
    assert second["status"] == "accepted" and second["integrated_commit"]
    assert len(second["changed_files"]) == 2
    assert detail["delivery"]["files"] == ["booking.py", "notify.py", "test_booking.py", "test_notify.py"]


@needs_sandbox
def test_failed_integration_blocks_completion(client, settings, monkeypatch):
    from walter.sandbox import SandboxViolation, WorkspaceManager

    def refuse(self, *args, **kwargs):
        raise SandboxViolation("integration storage unavailable")
    monkeypatch.setattr(WorkspaceManager, "integrate", refuse)
    run_id = build(client, prompt="Booking core")["run_id"]
    drain(settings)
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["status"] == "active"
    core = next(t for t in detail["tasks"] if t["id"] == "core")
    assert core["state"] == "Accepted"
    assert all(a["integrated_commit"] is None for a in detail["artifacts"])
    assert detail["delivery"] is None


@needs_sandbox
def test_delivery_refuses_an_integration_branch_moved_outside_caveman(client, settings):
    import subprocess
    from caveman.delivery import DeliveryError, assemble
    from caveman.engine import Engine
    from caveman.platform_store import PlatformStore

    run_id = build(client, prompt="Booking core")["run_id"]
    drain(settings)
    platform = PlatformStore(settings.platform_db)
    record = platform.run_by_id(run_id)
    platform.close()
    engine = Engine(settings)
    repo = engine.project_repo(record.project_id)
    subprocess.run(["git", "-C", str(repo), "update-ref", "refs/heads/walter-integration", "HEAD"], check=True)
    with pytest.raises(DeliveryError, match="moved outside Caveman"):
        assemble(engine.load(run_id), repo, settings.deliveries_dir, "x", cost_usd=0, cost_complete=True)



@needs_sandbox
@pytest.mark.parametrize("prompt", ["Booking app", "Booking #parallel", "Booking #approval"])
def test_manager_orchestration_mode_still_completes(settings, prompt):
    from dataclasses import replace
    manager_mode = replace(settings, orchestration="manager")
    with TestClient(create_app(manager_mode)) as client:
        run_id = build(client, prompt=prompt)["run_id"]
        drain(manager_mode)
        detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
        if detail["state"] == "approval_needed":
            approval = detail["approvals"][0]
            client.post(f"/api/runs/{run_id}/approvals/{approval['id']}",
                        json={"decision": "approve", "scope_digest": approval["scope_digest"]}, headers=ALICE)
            drain(manager_mode)
            detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "complete" and detail["orchestration"] == "manager"
    assert detail["usage"]["by_role"]["manager"]["calls"] > 1


@needs_sandbox
def test_workflow_mode_spends_one_planning_call_and_no_manager_calls(client, settings):
    run_id = build(client)["run_id"]
    drain(settings)
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "complete" and detail["orchestration"] == "workflow"
    assert detail["usage"]["by_role"]["planner"]["calls"] == 1
    assert "manager" not in detail["usage"]["by_role"]


@needs_sandbox
def test_rejected_capability_leaves_the_task_blocked(client, settings):
    run_id = build(client, prompt="Booking core #approval")["run_id"]
    drain(settings)
    approval = client.get(f"/api/runs/{run_id}", headers=ALICE).json()["approvals"][0]
    assert approval["action"] == "change_capability" and approval["title"] == "Grant a capability"
    client.post(f"/api/runs/{run_id}/approvals/{approval['id']}",
                json={"decision": "reject", "scope_digest": approval["scope_digest"]}, headers=ALICE)
    drain(settings)
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["status"] == "active" and detail["state"] in {"blocked", "waiting"}
    assert detail["approvals"][0]["status"] == "rejected"
    assert detail["capability_requests"][0]["status"] == "denied"
    assert next(t for t in detail["tasks"] if t["id"] == "core")["state"] == "Blocked"


def test_workflow_mode_refuses_follow_up_instructions(client):
    run_id = build(client)["run_id"]
    client.post(f"/api/runs/{run_id}/stop", headers=ALICE)
    response = client.post(f"/api/runs/{run_id}/continue", json={"message": "add dark mode"}, headers=ALICE)
    assert response.status_code == 422


@needs_sandbox
def test_typescript_build_is_validated_by_node_tests(client, settings):
    from walter.sandbox import _detect_node_root
    if _detect_node_root() is None:
        pytest.skip("Node unavailable")
    run_id = build(client, prompt="Booking UI helper #node")["run_id"]
    drain(settings)
    detail = client.get(f"/api/runs/{run_id}", headers=ALICE).json()
    assert detail["state"] == "complete", detail["jobs"][-1]["message"]
    [artifact] = detail["artifacts"]
    [check] = artifact["validations"]
    assert check["check"] == "node_test" and check["label"] == "Node tests" and check["status"] == "passed"
    assert "# pass 1" in check["output"]
    assert detail["delivery"]["files"] == ["slots.test.ts", "slots.ts"]


@needs_sandbox
def test_account_monthly_call_cap_blocks_new_work_and_tightens_runs(settings):
    from dataclasses import replace
    capped = replace(settings, account_monthly_max_calls=5)
    with TestClient(create_app(capped)) as client:
        first = build(client)["run_id"]
        drain(capped)
        detail = client.get(f"/api/runs/{first}", headers=ALICE).json()
        # The run was cut off at the account's remaining allowance, not its own 300 calls.
        assert detail["state"] == "budget_reached" and detail["usage"]["calls"] == 5
        spending = client.get("/api/account", headers=ALICE).json()["spending"]
        assert spending["exhausted"] is True and spending["model_calls"] == 5
        refused = client.post("/api/builds", json={"prompt": "Another build"}, headers=ALICE)
        assert refused.status_code == 402 and "monthly spending limit" in refused.json()["detail"]
        assert client.post(f"/api/runs/{first}/continue", json={}, headers=ALICE).status_code == 402
        # Other accounts are unaffected.
        assert client.post("/api/builds", json={"prompt": "Mallory's build"}, headers=MALLORY).status_code == 201


def test_metrics_are_disabled_by_default_and_token_protected(settings):
    from dataclasses import replace
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/metrics").status_code == 404
    metered = replace(settings, metrics_token="m" * 32)
    with TestClient(create_app(metered)) as client:
        build(client)
        assert client.get("/api/metrics").status_code == 401
        assert client.get("/api/metrics", headers={"Authorization": f"Bearer {TOKEN}"}).status_code == 401
        body = client.get("/api/metrics", headers={"Authorization": "Bearer " + "m" * 32}).text
    assert 'caveman_jobs{status="queued",outcome=""} 1' in body
    assert "caveman_runs 1" in body and "caveman_sandbox_available" in body


def test_operator_commands_list_requeue_and_abandon(settings, capsys):
    import argparse
    from caveman.ops import run_ops
    with TestClient(create_app(settings)) as client:
        run_id = build(client)["run_id"]
        client.post(f"/api/runs/{run_id}/stop", headers=ALICE)
    assert run_ops(settings, argparse.Namespace(ops_command="list", attention=True)) == 0
    [row] = json.loads(capsys.readouterr().out)
    assert row["run_id"] == run_id and row["state"] == "paused" and row["owner"] == "alice"
    assert run_ops(settings, argparse.Namespace(ops_command="requeue", run_id=run_id)) == 0
    capsys.readouterr()
    assert run_ops(settings, argparse.Namespace(ops_command="abandon", run_id=run_id, reason="cleanup")) == 1
    platform = PlatformStore(settings.platform_db)
    platform.request_cancel(run_id)
    platform.close()
    assert run_ops(settings, argparse.Namespace(ops_command="abandon", run_id=run_id, reason="cleanup")) == 0
    assert json.loads(capsys.readouterr().out.splitlines()[-1])["status"] == "abandoned"


def test_json_log_format_is_one_object_per_line():
    import logging
    from caveman.logs import JsonFormatter
    record = logging.LogRecord("caveman.worker", logging.INFO, __file__, 1, "Job %s done", ("j1",), None)
    record.run_id = "r1"
    payload = json.loads(JsonFormatter().format(record))
    assert payload["message"] == "Job j1 done" and payload["run_id"] == "r1" and payload["level"] == "INFO"
