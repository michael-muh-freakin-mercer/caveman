"""Servers configured before the Caveman -> Cavman rename keep their settings and state."""
from pathlib import Path

from cavman.config import Settings
from cavman.legacy import alias_environment

TOKEN = "t" * 40


def test_new_installs_use_the_new_names(tmp_path):
    settings = Settings.from_env({"CAVMAN_API_TOKEN": TOKEN, "CAVMAN_DATA_DIR": str(tmp_path)})
    assert settings.database_schema == "cavman"
    assert settings.e2b_template == "cavman-sandbox"
    assert settings.operations_db == tmp_path / "cavman-operations.db"


def test_old_setting_names_still_apply_and_keep_the_old_schema_and_template(tmp_path):
    settings = Settings.from_env({"CAVEMAN_API_TOKEN": TOKEN, "CAVEMAN_DATA_DIR": str(tmp_path),
                                  "CAVEMAN_MAX_PROJECTS": "7"})
    assert settings.api_token == TOKEN
    assert settings.data_dir == tmp_path
    assert settings.max_projects == 7
    # Not the empty cavman_* schemas or a template that was never built.
    assert settings.database_schema == "caveman"
    assert settings.e2b_template == "caveman-sandbox"


def test_a_new_name_wins_over_the_old_one(tmp_path):
    settings = Settings.from_env({"CAVEMAN_API_TOKEN": "short", "CAVMAN_API_TOKEN": TOKEN,
                                  "CAVMAN_DATA_DIR": str(tmp_path), "CAVMAN_DATABASE_SCHEMA": "cavman"})
    assert settings.api_token == TOKEN
    assert settings.database_schema == "cavman"


def test_existing_sqlite_files_are_found_under_their_old_names(tmp_path):
    (tmp_path / "caveman-platform.db").write_bytes(b"")
    settings = Settings.from_env({"CAVMAN_API_TOKEN": TOKEN, "CAVMAN_DATA_DIR": str(tmp_path)})
    assert settings.platform_db == tmp_path / "caveman-platform.db"
    assert settings.operations_db == tmp_path / "cavman-operations.db"


def test_the_process_environment_answers_to_both_names():
    environ = {"CAVEMAN_NODE_ROOT": "/opt/node", "CAVEMAN_ENV": "old", "CAVMAN_ENV": "new"}
    alias_environment(environ)
    assert environ["CAVMAN_NODE_ROOT"] == "/opt/node"
    assert environ["CAVMAN_ENV"] == "new"
    assert Path(environ["CAVEMAN_NODE_ROOT"]) == Path("/opt/node")
