import sys
import types

from cavman.error_reporting import configure_error_reporting


def fake_sdk(monkeypatch):
    calls = {}
    sdk = types.ModuleType("sentry_sdk")
    sdk.init = lambda **kwargs: calls.setdefault("init", kwargs)
    sdk.set_tag = lambda key, value: calls.setdefault("tags", {}).update({key: value})
    monkeypatch.setitem(sys.modules, "sentry_sdk", sdk)
    return calls


def test_off_without_dsn(monkeypatch):
    calls = fake_sdk(monkeypatch)
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert configure_error_reporting("api") is False
    assert calls == {}


def test_blank_dsn_is_off(monkeypatch):
    calls = fake_sdk(monkeypatch)
    monkeypatch.setenv("SENTRY_DSN", "  ")
    assert configure_error_reporting("worker") is False
    assert calls == {}


def test_on_with_dsn_and_never_sends_user_content(monkeypatch):
    calls = fake_sdk(monkeypatch)
    monkeypatch.setenv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/1")
    monkeypatch.setenv("CAVMAN_ENV", "production")
    monkeypatch.delenv("SENTRY_ENVIRONMENT", raising=False)
    assert configure_error_reporting("worker") is True
    init = calls["init"]
    assert init["dsn"] == "https://key@o0.ingest.sentry.io/1"
    assert init["environment"] == "production"
    # Prompts, code and tokens live in request bodies, cookies and frame locals.
    assert init["send_default_pii"] is False
    assert init["include_local_variables"] is False
    assert init["max_request_body_size"] == "never"
    assert init["traces_sample_rate"] == 0.0
    assert calls["tags"] == {"component": "worker"}


def test_missing_sdk_warns_instead_of_crashing(monkeypatch, caplog):
    monkeypatch.setitem(sys.modules, "sentry_sdk", None)
    monkeypatch.setenv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/1")
    assert configure_error_reporting("api") is False
    assert "sentry-sdk is not installed" in caplog.text
