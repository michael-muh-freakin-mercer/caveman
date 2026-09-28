#!/usr/bin/env python3
"""Fail if the tree contains a secret-like string nobody has audited.

Rescans the repository against a copy of ``.secrets.baseline`` (detect-secrets)
and reports every finding not marked ``"is_secret": false`` in the baseline.
To accept a new false positive, rescan with ``detect-secrets scan --baseline
.secrets.baseline``, check the finding, set ``is_secret`` to false and commit.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

EXCLUDE = r"(^|/)(package-lock\.json|node_modules/|\.venv/|\.secrets\.baseline$)"


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory() as scratch:
        baseline = Path(scratch) / "baseline.json"
        shutil.copy(repo / ".secrets.baseline", baseline)
        subprocess.run(["detect-secrets", "scan", "--baseline", str(baseline), "--exclude-files", EXCLUDE],
                       cwd=repo, check=True)
        results = json.loads(baseline.read_text())["results"]
    unaudited = [(path, item["line_number"], item["type"]) for path, items in results.items()
                 for item in items if item.get("is_secret") is not False]
    for path, line, kind in unaudited:
        print(f"{path}:{line}: possible secret ({kind})")
    if unaudited:
        print(f"{len(unaudited)} unaudited finding(s). Remove the secret, or audit it into .secrets.baseline.")
        return 1
    print("No unaudited secrets.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
