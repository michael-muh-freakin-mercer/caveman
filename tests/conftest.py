"""Shared fixtures."""
import glob
import os
import shutil
import subprocess
import tempfile

import pytest


def _start_cluster():
    """A throwaway PostgreSQL cluster on a Unix socket, or None if the binaries are missing."""
    found = sorted(glob.glob("/usr/lib/postgresql/*/bin/initdb"))
    if not found:
        return None, None
    bin_dir = os.path.dirname(found[-1])
    root = tempfile.mkdtemp(prefix="caveman-pg-", dir="/tmp")
    prefix = []
    if os.geteuid() == 0:  # initdb refuses to run as root
        shutil.chown(root, "postgres")
        prefix = ["runuser", "-u", "postgres", "--"]
    data = os.path.join(root, "data")
    subprocess.run([*prefix, f"{bin_dir}/initdb", "-D", data, "-A", "trust", "-U", "caveman",
                    "-E", "UTF8", "--locale=C.UTF-8"], check=True, capture_output=True)
    subprocess.run([*prefix, f"{bin_dir}/pg_ctl", "-D", data, "-w", "-l", os.path.join(root, "log"),
                    "-o", f"-k {root} -p 55439 -c listen_addresses=''", "start"], check=True, capture_output=True)

    def stop():
        subprocess.run([*prefix, f"{bin_dir}/pg_ctl", "-D", data, "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(root, ignore_errors=True)
    return f"postgresql://caveman@/postgres?host={root}&port=55439", stop


@pytest.fixture(scope="session")
def postgres_url():
    """CAVEMAN_TEST_DATABASE_URL, or a local throwaway cluster; skips when neither exists."""
    pytest.importorskip("psycopg")
    url = os.environ.get("CAVEMAN_TEST_DATABASE_URL")
    if url:
        yield url
        return
    try:
        url, stop = _start_cluster()
    except (OSError, subprocess.CalledProcessError) as exc:
        pytest.skip(f"PostgreSQL could not be started: {exc}")
    if url is None:
        pytest.skip("PostgreSQL is not installed")
    try:
        yield url
    finally:
        stop()
