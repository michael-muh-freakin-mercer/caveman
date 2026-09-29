"""SQLite -> PostgreSQL migration: a real build's state survives the move and
the API serves it from PostgreSQL; unsafe copies are refused without writing."""
import asyncio
import dataclasses
import sqlite3
import time
import uuid
from pathlib import Path

import pytest

pytest.importorskip("agents")
pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from caveman.api import create_app
from caveman.config import Settings
from caveman.migrate import AUTH_TABLES, MigrationRefused, copy_sqlite_to_postgres, migrate_to_postgres
from caveman.worker import Worker

TOKEN = "t" * 40
ALICE = {"Authorization": f"Bearer {TOKEN}", "X-Caveman-User": "alice"}

needs_sandbox = pytest.mark.skipif(not (Path("/usr/bin/bwrap").exists() and Path("/usr/bin/prlimit").exists()),
                                   reason="Bubblewrap sandbox unavailable")


def _settings(tmp_path, database_url=None, schema="caveman"):
    return Settings(data_dir=tmp_path / "data", api_token=TOKEN, executor="scripted",
                    scripted_step_delay=0, heartbeat_seconds=0.2, lease_seconds=30,
                    database_url=database_url, database_schema=schema)


def _drain(settings):
    worker = Worker(settings)
    try:
        while asyncio.run(worker.run_once()):
            pass
    finally:
        worker.close()


@pytest.fixture
def schema():
    return "m_" + uuid.uuid4().hex[:12]


@needs_sandbox
def test_completed_build_moves_to_postgres_and_is_served_from_it(tmp_path, postgres_url, schema):
    sqlite_settings = _settings(tmp_path)
    with TestClient(create_app(sqlite_settings)) as client:
        created = client.post("/api/builds", json={"prompt": "Build me a booking app for a tattoo studio"},
                              headers=ALICE).json()
        _drain(sqlite_settings)
        before = client.get(f"/api/runs/{created['run_id']}", headers=ALICE).json()
        events_before = client.get(f"/api/runs/{created['run_id']}/events", headers=ALICE).json()
    assert before["state"] == "complete"

    pg_settings = dataclasses.replace(sqlite_settings, database_url=postgres_url, database_schema=schema)
    rehearsal = migrate_to_postgres(pg_settings, dry_run=True)
    assert {result.name for result in rehearsal} == {"operations", "platform"}
    import psycopg
    with psycopg.connect(postgres_url) as connection:
        assert connection.execute(f'SELECT count(*) FROM "{schema}_platform".runs').fetchone()[0] == 0

    copied = {result.name: result.tables for result in migrate_to_postgres(pg_settings)}
    assert copied["platform"]["runs"] == 1 and copied["operations"]["events"] > 0

    with TestClient(create_app(pg_settings)) as client:
        after = client.get(f"/api/runs/{created['run_id']}", headers=ALICE).json()
        assert after["state"] == "complete" and after["tasks"] == before["tasks"]
        assert client.get(f"/api/runs/{created['run_id']}/events", headers=ALICE).json() == events_before
        download = client.get(f"/api/runs/{created['run_id']}/delivery/download", headers=ALICE)
        assert download.status_code == 200
        # New work lands on top of the copied state.
        follow = client.post("/api/builds", json={"prompt": "Build me a quiz app"}, headers=ALICE).json()
        _drain(pg_settings)
        assert client.get(f"/api/runs/{follow['run_id']}", headers=ALICE).json()["state"] == "complete"
        assert len(client.get("/api/runs", headers=ALICE).json()["runs"]) == 2

    with pytest.raises(MigrationRefused, match="already has"):
        migrate_to_postgres(pg_settings)


def test_refuses_without_database_url_or_while_a_job_is_running(tmp_path, postgres_url, schema):
    settings = _settings(tmp_path)
    with pytest.raises(MigrationRefused, match="CAVEMAN_DATABASE_URL"):
        migrate_to_postgres(settings)
    from caveman.platform_store import PlatformStore
    settings.data_dir.mkdir(parents=True)
    store = PlatformStore(settings.platform_db)
    project = store.create_project("alice", "Demo", "", {})
    run = store.create_run(uuid.uuid4().hex, project.id, "alice", "Build a demo", executor="scripted",
                           budget_usd=1.0, max_model_calls=10)
    job, _ = store.enqueue(run.id, "start")
    store.close()
    with sqlite3.connect(settings.platform_db) as connection:
        connection.execute("UPDATE jobs SET status='running', lease_owner='w', lease_expires=? WHERE id=?",
                           (time.time() + 60, job.id))
    with pytest.raises(MigrationRefused, match="running"):
        migrate_to_postgres(dataclasses.replace(settings, database_url=postgres_url, database_schema=schema))


def test_converts_better_auth_types_and_refuses_unknown_columns(tmp_path, postgres_url, schema):
    import psycopg
    with psycopg.connect(postgres_url, autocommit=True) as connection:
        connection.execute(f'CREATE SCHEMA "{schema}"')
        connection.execute(f'CREATE TABLE "{schema}"."user"(id TEXT PRIMARY KEY, "emailVerified" BOOLEAN NOT NULL, '
                           f'"createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL)')
    source = tmp_path / "auth.db"
    with sqlite3.connect(source) as connection:
        connection.execute('CREATE TABLE "user"(id TEXT PRIMARY KEY, "emailVerified" INTEGER, '
                           '"createdAt" DATE, "updatedAt" DATE)')
        connection.execute('INSERT INTO "user" VALUES(?,?,?,?)',
                           ("u1", 1, "2026-09-28T23:29:08.659Z", 1790638148659))
    result = copy_sqlite_to_postgres(source, postgres_url, schema, name="auth")
    assert result.tables == {"user": 1}
    with psycopg.connect(postgres_url) as connection:
        verified, created, updated = connection.execute(
            f'SELECT "emailVerified", "createdAt", "updatedAt" FROM "{schema}"."user"').fetchone()
    assert verified is True
    assert created.isoformat().startswith("2026-09-28T23:29:08.659")
    assert updated.timestamp() == pytest.approx(1790638148.659)

    with sqlite3.connect(source) as connection:
        connection.execute('ALTER TABLE "user" ADD COLUMN surprise TEXT')
    with psycopg.connect(postgres_url, autocommit=True) as connection:
        connection.execute(f'DELETE FROM "{schema}"."user"')
    with pytest.raises(MigrationRefused, match="surprise"):
        copy_sqlite_to_postgres(source, postgres_url, schema, name="auth")


def test_refuses_an_auth_file_missing_better_auth_tables(tmp_path):
    pytest.importorskip("psycopg")
    source = tmp_path / "auth.db"
    with sqlite3.connect(source) as connection:
        connection.execute('CREATE TABLE "user"(id TEXT PRIMARY KEY)')
    # Refused before PostgreSQL is contacted, so the URL is never used.
    with pytest.raises(MigrationRefused, match="account, session, verification"):
        copy_sqlite_to_postgres(source, "postgresql://unused.invalid/db", "public", name="auth",
                                only=AUTH_TABLES)


def test_refuses_when_only_one_core_store_exists(tmp_path):
    from caveman.platform_store import PlatformStore
    settings = _settings(tmp_path, database_url="postgresql://unused.invalid/db")
    settings.data_dir.mkdir(parents=True)
    PlatformStore(settings.platform_db).close()
    assert not settings.operations_db.exists()
    with pytest.raises(MigrationRefused, match="both core stores"):
        migrate_to_postgres(settings)
