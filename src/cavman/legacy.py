"""Compatibility with installs set up before the Caveman -> Cavman rename.

Settings written as ``CAVEMAN_*`` keep working (a ``CAVMAN_*`` setting of the
same name wins). An install still configured that way also keeps its old
database schema, E2B template and SQLite file names, so upgrading the code
never points it at empty state. ``scripts/migrate-to-cavman.sh`` rewrites an
existing ``.env`` to the new names and pins those old values explicitly.
"""
from __future__ import annotations

import os
from collections.abc import Mapping, MutableMapping
from pathlib import Path

PREFIX = "CAVMAN_"
LEGACY_PREFIX = "CAVEMAN_"


def is_legacy(values: Mapping[str, str]) -> bool:
    """True when any setting still uses the pre-rename CAVEMAN_ prefix."""
    return any(key.startswith(LEGACY_PREFIX) for key in values)


def with_legacy_names(values: Mapping[str, str]) -> dict[str, str]:
    """A copy of ``values`` where each CAVEMAN_X also answers as CAVMAN_X unless that is set."""
    merged = dict(values)
    for key, value in values.items():
        if key.startswith(LEGACY_PREFIX):
            merged.setdefault(PREFIX + key[len(LEGACY_PREFIX):], value)
    return merged


def alias_environment(environ: MutableMapping[str, str] | None = None) -> None:
    """Expose CAVEMAN_X as CAVMAN_X in the process environment for code that reads it directly."""
    environ = os.environ if environ is None else environ
    for key, value in list(environ.items()):
        if key.startswith(LEGACY_PREFIX):
            environ.setdefault(PREFIX + key[len(LEGACY_PREFIX):], value)


def prefer_existing(path: Path, legacy: Path) -> Path:
    """The pre-rename path when only it exists (so old local state is still found), else ``path``."""
    return legacy if legacy.exists() and not path.exists() else path
