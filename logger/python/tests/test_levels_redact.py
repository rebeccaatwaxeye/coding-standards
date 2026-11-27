"""Parity tests — fixtures mirror node/src/*.test.ts byte-for-byte."""


from nocturna_logger.levels import resolve_level, should_log
from nocturna_logger.redact import build_patterns, redact_data, redact_value

# ---- levels ----

def test_should_log_semantics(monkeypatch):
    # SILENT is a disable switch, not a point on the severity scale.
    assert not should_log("INFO", "SILENT")
    assert not should_log("SILENT", "DEBUG")
    assert not should_log("DEBUG", "ERROR")
    assert should_log("ERROR", "ERROR")
    assert should_log("CRITICAL", "ERROR")
    assert should_log("DEBUG", "DEBUG")


def test_env_detection_matrix(monkeypatch):
    for key in ("LOG_LEVEL", "NODE_ENV", "DEV"):
        monkeypatch.delenv(key, raising=False)

    assert resolve_level() == "ERROR"  # production default
    monkeypatch.setenv("NODE_ENV", "development")
    assert resolve_level() == "DEBUG"
    monkeypatch.delenv("NODE_ENV")
    monkeypatch.setenv("DEV", "true")
    assert resolve_level() == "DEBUG"
    monkeypatch.delenv("DEV")
    monkeypatch.setenv("NODE_ENV", "test")
    assert resolve_level() == "SILENT"
    monkeypatch.setenv("LOG_LEVEL", "warn")
    assert resolve_level() == "WARN"
    monkeypatch.delenv("NODE_ENV")
    monkeypatch.setenv("LOG_LEVEL", "garbage")
    assert resolve_level() == "ERROR"
    monkeypatch.delenv("LOG_LEVEL")
    assert resolve_level("INFO") == "INFO"  # explicit beats everything


# ---- redaction ----

def patterns():
    return build_patterns()


def test_defaults_include_password():
    ps = patterns()
    assert any(p.search("password") for p in ps)


def test_appends_custom_patterns_case_insensitively():
    ps = build_patterns(["internal_id"])
    assert any(p.search("INTERNAL_ID") for p in ps)


def test_can_omit_defaults():
    ps = build_patterns(["custom"], include_defaults=False)
    assert any(p.search("custom") for p in ps)
    assert not any(p.search("password") for p in ps)


def test_redacts_known_sensitive_keys():
    out = redact_value({"password": "hunter2", "user": "alice"}, patterns())
    assert out == {"password": "[REDACTED]", "user": "alice"}


def test_redacts_keys_case_insensitively():
    out = redact_value({"API_KEY": "abc", "ApiKey": "def", "apikey": "ghi"}, patterns())
    assert out == {
        "API_KEY": "[REDACTED]",
        "ApiKey": "[REDACTED]",
        "apikey": "[REDACTED]",
    }


def test_redacts_nested_objects_recursively():
    value = {
        "request": {
            "headers": {"authorization": "Bearer xyz", "content-type": "application/json"}
        }
    }
    out = redact_value(value, patterns())
    assert out == {
        "request": {
            "headers": {"authorization": "[REDACTED]", "content-type": "application/json"}
        }
    }


def test_redacts_inside_arrays():
    out = redact_value({"users": [{"token": "a"}, {"token": "b"}]}, patterns())
    assert out == {"users": [{"token": "[REDACTED]"}, {"token": "[REDACTED]"}]}


def test_preserves_non_sensitive_data():
    value = {"orderId": 42, "status": "ok", "nested": {"a": 1}}
    assert redact_value(value, patterns()) == value


def test_passes_primitives_through():
    assert redact_value("plain string", patterns()) == "plain string"
    assert redact_value(42, patterns()) == 42
    assert redact_data(None, patterns()) is None


def test_make_entry_shapes_error_payloads():
    from nocturna_logger.types import LogError, make_entry

    # dataclass error -> plain dict, optional keys dropped when empty
    entry = make_entry(
        "ts", "INFO", "api", "m", error=LogError(name="X", message="m")
    )
    assert entry["error"] == {"name": "X", "message": "m"}

    # real exception -> stack preserved
    try:
        raise KeyError("k")
    except KeyError as exc:
        entry = make_entry("ts", "INFO", "api", "m", error=exc)
    assert entry["error"]["name"] == "KeyError"
    assert "k" in entry["error"]["stack"]

    # dict error keeps only canonical keys
    entry = make_entry(
        "ts", "INFO", "api", "m", error={"name": "E", "message": "m", "password": "p"}
    )
    assert entry["error"]["message"] == "m"
    assert "password" not in entry["error"]

    # strings and other values wrap
    assert make_entry("ts", "INFO", "api", "m", error="oops")["error"] == {
        "name": "Error", "message": "oops",
    }
    assert make_entry("ts", "INFO", "api", "m", error=42)["error"] == {
        "name": "Error", "message": "42",
    }
