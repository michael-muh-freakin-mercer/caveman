"""Caveman platform settings, resolved from the environment.

Provider credentials are deliberately not read here: the orchestration core's
``RuntimeConfig.from_env`` stays the only place that reads them, and only the
worker process needs them.
"""
from __future__ import annotations

import math
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

ORCHESTRATION_WORKFLOW = "workflow"
ORCHESTRATION_MANAGER = "manager"

EXECUTOR_PROVIDER = "provider"
EXECUTOR_SCRIPTED = "scripted"

MIN_API_TOKEN_LENGTH = 32


class SettingsError(ValueError):
    """Raised when the Caveman platform configuration is missing or unsafe."""


def _float(values: Mapping[str, str], name: str, default: float, *, minimum: float = 0.0) -> float:
    raw = values.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError:
        raise SettingsError(f"{name} must be a number; got {raw!r}.") from None
    if not math.isfinite(value) or value < minimum:
        raise SettingsError(f"{name} must be a finite number >= {minimum}; got {raw!r}.")
    return value


def _int(values: Mapping[str, str], name: str, default: int, *, minimum: int = 1) -> int:
    raw = values.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        raise SettingsError(f"{name} must be an integer; got {raw!r}.") from None
    if value < minimum:
        raise SettingsError(f"{name} must be >= {minimum}; got {raw!r}.")
    return value


MODEL_MODES = ("budget", "balanced", "quality")


def _profiles(values: Mapping[str, str]) -> tuple[tuple[str, str, str], ...]:
    """CAVEMAN_MODELS_<MODE>="manager=<model>,worker=<model>" for budget, balanced, quality."""
    profiles = []
    for mode in MODEL_MODES:
        raw = (values.get(f"CAVEMAN_MODELS_{mode.upper()}") or "").strip()
        if not raw:
            continue
        parts = dict(item.split("=", 1) for item in raw.split(",") if "=" in item)
        manager, worker = parts.get("manager", "").strip(), parts.get("worker", "").strip()
        if not manager or not worker:
            raise SettingsError(f"CAVEMAN_MODELS_{mode.upper()} must be 'manager=<model>,worker=<model>'.")
        profiles.append((mode, manager, worker))
    return tuple(profiles)


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    api_token: str
    environment: str = "development"
    executor: str = EXECUTOR_PROVIDER
    # workflow: plain code drives plan/delegate/validate/review/accept; models
    # plan, work and review. manager: the Manager model drives every step.
    orchestration: str = ORCHESTRATION_WORKFLOW
    # Spending is bounded by default: every run gets a USD ceiling (enforced on
    # provider-reported cost) and a model-call ceiling (which also bounds calls
    # whose cost the provider did not report).
    default_budget_usd: float = 5.0
    max_budget_usd: float = 100.0
    default_max_model_calls: int = 300
    # Per-account monthly ceilings across all runs.
    account_monthly_budget_usd: float = 25.0
    account_monthly_max_calls: int = 3000
    budget_warning_ratio: float = 0.8
    manager_max_turns: int = 60
    worker_concurrency: int = 1
    lease_seconds: float = 90.0
    heartbeat_seconds: float = 5.0
    max_recoveries: int = 3
    scripted_step_delay: float = 0.25
    github_api_url: str = "https://api.github.com"
    # Optional routing profiles: mode -> (manager/planner model, specialist model).
    # "automatic" always exists and uses WALTER_MODEL / WALTER_WORKER_MODEL.
    model_profiles: tuple[tuple[str, str, str], ...] = ()
    # Prometheus scrape token; the metrics endpoint is disabled when unset.
    metrics_token: str | None = None
    # Event streams end after this long; EventSource reconnects with Last-Event-ID.
    stream_max_seconds: float = 300.0
    stream_poll_seconds: float = 1.0

    @property
    def operations_db(self) -> Path:
        return self.data_dir / "caveman-operations.db"

    @property
    def platform_db(self) -> Path:
        return self.data_dir / "caveman-platform.db"

    @property
    def sessions_db(self) -> Path:
        return self.data_dir / "caveman-sessions.db"

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"

    @property
    def deliveries_dir(self) -> Path:
        return self.data_dir / "deliveries"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        values = os.environ if env is None else env
        token = values.get("CAVEMAN_API_TOKEN", "").strip()
        if len(token) < MIN_API_TOKEN_LENGTH:
            raise SettingsError(
                "CAVEMAN_API_TOKEN must be set to a random secret of at least "
                f"{MIN_API_TOKEN_LENGTH} characters (for example `openssl rand -hex 32`). "
                "The web server presents it on every API call; browsers never see it.")
        environment = values.get("CAVEMAN_ENV", "development").strip().lower() or "development"
        executor = values.get("CAVEMAN_EXECUTOR", EXECUTOR_PROVIDER).strip().lower()
        if executor not in {EXECUTOR_PROVIDER, EXECUTOR_SCRIPTED}:
            raise SettingsError(
                f"CAVEMAN_EXECUTOR must be '{EXECUTOR_PROVIDER}' or '{EXECUTOR_SCRIPTED}'; got {executor!r}.")
        if executor == EXECUTOR_SCRIPTED and environment == "production":
            raise SettingsError(
                "The scripted test executor drives runs with scripted models and is refused "
                "when CAVEMAN_ENV=production.")
        orchestration = values.get("CAVEMAN_ORCHESTRATION", ORCHESTRATION_WORKFLOW).strip().lower()
        if orchestration not in {ORCHESTRATION_WORKFLOW, ORCHESTRATION_MANAGER}:
            raise SettingsError(
                f"CAVEMAN_ORCHESTRATION must be '{ORCHESTRATION_WORKFLOW}' or '{ORCHESTRATION_MANAGER}'; "
                f"got {orchestration!r}.")
        data_dir = Path(values.get("CAVEMAN_DATA_DIR", ".local/caveman")).expanduser().resolve()
        default_budget = _float(values, "CAVEMAN_DEFAULT_BUDGET_USD", 5.0, minimum=0.01)
        max_budget = _float(values, "CAVEMAN_MAX_BUDGET_USD", 100.0, minimum=0.01)
        if default_budget > max_budget:
            raise SettingsError("CAVEMAN_DEFAULT_BUDGET_USD cannot exceed CAVEMAN_MAX_BUDGET_USD.")
        return cls(
            data_dir=data_dir,
            api_token=token,
            environment=environment,
            executor=executor,
            orchestration=orchestration,
            model_profiles=_profiles(values),
            github_api_url=(values.get("CAVEMAN_GITHUB_API_URL") or "https://api.github.com").strip(),
            metrics_token=(values.get("CAVEMAN_METRICS_TOKEN") or "").strip() or None,
            default_budget_usd=default_budget,
            max_budget_usd=max_budget,
            default_max_model_calls=_int(values, "CAVEMAN_DEFAULT_MAX_MODEL_CALLS", 300),
            account_monthly_budget_usd=_float(values, "CAVEMAN_ACCOUNT_MONTHLY_BUDGET_USD", 25.0, minimum=0.01),
            account_monthly_max_calls=_int(values, "CAVEMAN_ACCOUNT_MONTHLY_MAX_CALLS", 3000),
            manager_max_turns=_int(values, "CAVEMAN_MANAGER_MAX_TURNS", 60),
            worker_concurrency=_int(values, "CAVEMAN_WORKER_CONCURRENCY", 1),
            lease_seconds=_float(values, "CAVEMAN_LEASE_SECONDS", 90.0, minimum=5.0),
            heartbeat_seconds=_float(values, "CAVEMAN_HEARTBEAT_SECONDS", 5.0, minimum=0.1),
            max_recoveries=_int(values, "CAVEMAN_MAX_RECOVERIES", 3, minimum=0),
            scripted_step_delay=_float(values, "CAVEMAN_SCRIPTED_STEP_DELAY", 0.25),
        )

    def ensure_directories(self) -> None:
        for directory in (self.data_dir, self.projects_dir, self.deliveries_dir):
            directory.mkdir(parents=True, exist_ok=True)
        # Platform state holds ownership and job records; keep it private.
        os.chmod(self.data_dir, 0o700)
