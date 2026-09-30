"""PostgreSQL stores keep the SQLite stores' contract across connections and hosts."""
import asyncio
import threading
import uuid

import pytest

from walter.orchestration import Orchestrator
from walter.store import ConcurrentUpdate, PostgresStore, open_store


def schema():
    return "t_" + uuid.uuid4().hex[:12]


def test_run_store_round_trips_and_detects_concurrent_writers(postgres_url):
    name = schema()
    first, second = PostgresStore(postgres_url, name), PostgresStore(postgres_url, name)
    try:
        core = Orchestrator(first)
        run = core.create_run("Build a thing", ["A measurable criterion here"])
        assert second.load(run.id).objective == "Build a thing" and len(second.events(run.id)) == 1
        stale = second.load(run.id)
        core.store.save(first.load(run.id), [core_event(run.id)], stale.version)
        with pytest.raises(ConcurrentUpdate):
            second.save(stale, [core_event(run.id)], stale.version)
        assert [event.sequence for event in second.events(run.id)] == [1, 2]
        assert [r.id for r in second.list_runs()] == [run.id] == second.run_ids()
        with pytest.raises(KeyError):
            second.events("missing")
        assert second.delete_run(run.id) and first.run_ids() == []
    finally:
        first.close()
        second.close()


def core_event(run_id):
    from walter.models import Event
    return Event(run_id=run_id, kind="test.event", data={})


def test_serialized_writers_never_lose_an_update(postgres_url):
    name = schema()
    setup = PostgresStore(postgres_url, name)
    run = Orchestrator(setup).create_run("Count", ["A measurable criterion here"])
    errors, done = [], []

    def writer():
        store = PostgresStore(postgres_url, name)
        try:
            for _ in range(10):
                while True:
                    try:
                        with store.transaction():
                            current = store.load(run.id)
                            store.save(current, [core_event(run.id)], current.version)
                        done.append(1)
                        break
                    except ConcurrentUpdate:
                        continue
        except Exception as exc:  # pragma: no cover - surfaced below
            errors.append(exc)
        finally:
            store.close()
    threads = [threading.Thread(target=writer) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert not errors and len(done) == 40
    assert setup.load(run.id).version == 41 and len(setup.events(run.id)) == 41
    setup.close()


def test_open_store_selects_the_backend(postgres_url, tmp_path):
    from walter.store import SQLiteStore
    assert type(open_store(tmp_path / "ops.db")) is SQLiteStore
    store = open_store(postgres_url, schema=schema())
    assert isinstance(store, PostgresStore)
    store.close()


def test_platform_queue_hands_each_job_to_exactly_one_worker(postgres_url):
    from cavman.platform_store import PlatformStore
    name = schema()
    stores = [PlatformStore(postgres_url, schema=name) for _ in range(4)]
    try:
        run_ids = [uuid.uuid4().hex for _ in range(12)]
        for run_id in run_ids:
            # One project per run: jobs of the same project are never claimed together.
            stores[0].create_project("alice", "Demo", project_id=run_id)
            stores[0].create_run(run_id, run_id, "alice", "Build", executor="scripted",
                                 budget_usd=5.0, max_model_calls=10)
            assert stores[1].enqueue(run_id, "start")[1] and not stores[2].enqueue(run_id, "start")[1]
        claimed, lock = [], threading.Lock()

        def worker(index):
            while (job := stores[index].claim(f"w{index}", 30)) is not None:
                with lock:
                    claimed.append(job.run_id)
        threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert sorted(claimed) == sorted(run_ids)
        job = stores[0].jobs(run_ids[0])[0]
        assert stores[0].heartbeat(job.id, job.lease_owner, 30) is False
        assert stores[0].reap_expired(3, now=job.lease_expires + 3600)  # lease precision survives
        stores[0].save_workflow_state(run_ids[0], {"a": 1})
        stores[0].save_workflow_state(run_ids[0], {"a": 2})
        assert stores[1].workflow_state(run_ids[0]) == {"a": 2}
        stores[0].save_delivery(run_ids[0], "ready", {"files": []}, "x.tar.gz")
        assert stores[1].delivery(run_ids[0]).archive_name == "x.tar.gz"
        assert stores[1].publication(run_ids[0]) is None
        stores[0].save_publication(run_ids[0], "alice", "a/b", "https://github.com/a/b", "c" * 40, True)
        assert stores[1].publication(run_ids[0])["private"] == 1
        assert stores[1].get_run("alice", run_ids[0]).model_mode == "automatic"
        assert len(stores[1].runs_created_since("2000-01-01T00:00:00+00:00")) == 12
        assert stores[1].runs_created_since("9999-01-01T00:00:00+00:00") == []
        assert sorted(stores[1].delete_owner("alice")["projects"]) == sorted(run_ids)
    finally:
        for store in stores:
            store.close()


def test_a_scripted_build_completes_with_all_state_in_postgres(postgres_url, tmp_path):
    pytest.importorskip("agents")
    pytest.importorskip("fastapi")
    from pathlib import Path

    from fastapi.testclient import TestClient

    from cavman.api import create_app
    from cavman.config import Settings
    from cavman.worker import Worker

    if not Path("/usr/bin/bwrap").exists():
        pytest.skip("Bubblewrap sandbox unavailable")
    token = "t" * 40
    headers = {"Authorization": f"Bearer {token}", "X-Cavman-User": "alice"}
    settings = Settings(data_dir=tmp_path / "data", api_token=token, executor="scripted",
                        scripted_step_delay=0, database_url=postgres_url, database_schema=schema())
    with TestClient(create_app(settings)) as client:
        run_id = client.post("/api/builds", json={"prompt": "Build me a booking app"}, headers=headers).json()["run_id"]
        worker = Worker(settings)
        try:
            while asyncio.run(worker.run_once()):
                pass
        finally:
            worker.close()
        detail = client.get(f"/api/runs/{run_id}", headers=headers).json()
    assert detail["state"] == "complete" and detail["delivery"]["status"] == "ready"
    assert not settings.operations_db.exists() and not settings.platform_db.exists()


def test_many_first_connections_create_the_schema_once(postgres_url):
    name, errors = schema(), []

    def connect():
        try:
            PostgresStore(postgres_url, name).close()
        except Exception as exc:  # pragma: no cover - surfaced below
            errors.append(exc)
    threads = [threading.Thread(target=connect) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
