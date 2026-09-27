"""The live campaign harness, dry-run with the scripted executor (no credits)."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("agents")

REPO = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(not Path("/usr/bin/bwrap").exists(), reason="Bubblewrap unavailable")
def test_campaign_dry_run_writes_a_report(tmp_path):
    prompts = tmp_path / "prompts.txt"
    prompts.write_text("Build a booking core\nBuild a booking core #fail-validation\n")
    completed = subprocess.run(
        [sys.executable, str(REPO / "scripts/live_campaign.py"), "--executor", "scripted",
         "--prompts", str(prompts), "--out", str(tmp_path / "out"), "--data-dir", str(tmp_path / "data")],
        capture_output=True, text=True, timeout=300)
    assert completed.returncode == 0, completed.stderr[-2000:]
    [report] = list((tmp_path / "out").glob("*.json"))
    summary = json.loads(report.read_text())
    assert summary["requests"] == 2 and summary["completed"] == 2
    assert summary["runs"][1]["failures"] == ["BAD_OUTPUT"]
    assert "| Request | State |" in (tmp_path / "out" / report.name.replace(".json", ".md")).read_text()


def test_campaign_refuses_to_start_without_provider_config(tmp_path, monkeypatch):
    env = {"PATH": "/usr/bin:/bin", "HOME": str(tmp_path)}
    completed = subprocess.run([sys.executable, str(REPO / "scripts/live_campaign.py"),
                                "--out", str(tmp_path / "out")],
                               capture_output=True, text=True, timeout=120, env=env, cwd=tmp_path)
    assert completed.returncode == 2 and "OPENROUTER_API_KEY" in completed.stderr
    assert not (tmp_path / "out").exists()
