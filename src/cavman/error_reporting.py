"""Error reporting to Sentry for the API and workers, off unless SENTRY_DSN is set.

Reports carry stack traces and log context only: no request bodies, cookies,
client IPs or local variables, since those hold users' prompts, code and
tokens. Unhandled exceptions and ERROR log records become events (the SDK's
logging integration), so a job failure that is logged is also reported.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)


def configure_error_reporting(component: str) -> bool:
    """Start Sentry for `component` ("api" or "worker"); return whether it is on."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk
    except ImportError:
        log.warning("SENTRY_DSN is set but sentry-sdk is not installed (pip install '.[sentry]'); "
                    "errors are not being reported")
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT") or os.getenv("CAVMAN_ENV") or "production",
        release=os.getenv("SENTRY_RELEASE") or None,
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        traces_sample_rate=0.0,
    )
    sentry_sdk.set_tag("component", component)
    return True
