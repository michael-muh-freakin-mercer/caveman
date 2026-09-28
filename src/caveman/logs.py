"""Log setup: human-readable by default, one JSON object per line when
CAVEMAN_LOG_FORMAT=json (for log shippers)."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {"time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
                   "level": record.levelname, "logger": record.name, "message": record.getMessage()}
        for key in ("run_id", "job_id", "worker_id"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging() -> None:
    handler = logging.StreamHandler()
    if os.getenv("CAVEMAN_LOG_FORMAT", "").lower() == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(os.getenv("CAVEMAN_LOG_LEVEL", "INFO"))
