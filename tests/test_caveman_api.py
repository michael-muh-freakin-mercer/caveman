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
