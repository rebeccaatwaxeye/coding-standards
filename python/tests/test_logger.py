"""Logger and sink behaviour tests — mirror node/src/*.test.ts."""

import re

import pytest

from nocturna_logger import (
    LoggerOptions,
    LogMeta,
)


class CaptureSink:
    """Test sink that captures entries instead of writing them."""

    def __init__(self):
        self.entries = []

    def write(self, entry):
        self.entries.append(entry)

    def dispose(self):
        self.disposed = True


@pytest.fixture(autouse=True)
def _dev_env(monkeypatch):
    monkeypatch.delenv("LOG_LEVEL", raising=False)
    monkeypatch.setenv("NODE_ENV", "development")


def build_logger(level=None, sink=None, module="test", sinks=None):
    options = LoggerOptions(module=module)
    if level is not None:
        options.level = level
    if sinks is not None:
        options.sinks = sinks
    if sink is not None:
        options.sinks = [sink]
    from nocturna_logger import create_logger

    return create_logger(options)


# ---- level filtering ----

def test_emits_all_levels_when_configured_at_debug():
    sink = CaptureSink()
    log = build_logger(level="DEBUG", sink=sink)
    log.debug("d")
    log.info("i")
    log.warn("w")
    log.error("e")
    log.critical("c")
    assert [e["level"] for e in sink.entries] == [
        "DEBUG", "INFO", "WARN", "ERROR", "CRITICAL",
    ]


def test_emits_only_error_and_critical_at_production_floor():
    sink = CaptureSink()
    log = build_logger(level="ERROR", sink=sink)
    log.debug("d")
    log.info("i")
    log.warn("w")
    log.error("e")
    log.critical("c")
    assert [e["level"] for e in sink.entries] == ["ERROR", "CRITICAL"]


def test_callable_shorthand_is_info():
    sink = CaptureSink()
    log = build_logger(level="DEBUG", sink=sink)
    log("hello")
    assert sink.entries[0]["level"] == "INFO"
    assert sink.entries[0]["message"] == "hello"


def test_module_is_bound_once():
    sink = CaptureSink()
    log = build_logger(module="worker", sink=sink)
    assert log.module == "worker"
    log.info("x")
    assert sink.entries[0]["module"] == "worker"


# ---- meta, redaction, errors ----

def test_meta_fields_reach_the_entry():
    sink = CaptureSink()
    log = build_logger(level="DEBUG", sink=sink)
    log.info("x", LogMeta(trace_id="t1", operation="op1", data={"orderId": 7}))
    entry = sink.entries[0]
    assert entry["traceId"] == "t1"
    assert entry["operation"] == "op1"
    assert entry["data"] == {"orderId": 7}


def test_redaction_runs_before_sinks():
    sink = CaptureSink()
    log = build_logger(level="DEBUG", sink=sink)
    log.info("login", LogMeta(data={"password": "hunter2", "user": "alice"}))
    assert sink.entries[0]["data"] == {"password": "[REDACTED]", "user": "alice"}


def test_errors_normalise_with_stack_preserved():
    sink = CaptureSink()
    log = build_logger(level="DEBUG", sink=sink)
    try:
        raise ValueError("boom")
    except ValueError as exc:
        log.error("query failed", LogMeta(error=exc))
    error = sink.entries[0]["error"]
    assert error["name"] == "ValueError"
    assert error["message"] == "boom"
    assert "boom" in error["stack"]


def test_error_from_string():
    sink = CaptureSink()
    log = build_logger(level="DEBUG", sink=sink)
    log.error("failed", LogMeta(error="oops"))
    assert sink.entries[0]["error"] == {"name": "Error", "message": "oops"}


def test_redacts_error_payload_keys():
    sink = CaptureSink()
    log = build_logger(level="DEBUG", sink=sink)
    log.error("failed", LogMeta(error={"name": "X", "message": "m", "password": "p"}))
    # TS parity: normaliseError keeps only name/message/stack/code — extra
    # keys are dropped before redaction can ever see them.
    assert sink.entries[0]["error"]["message"] == "m"
    assert "password" not in sink.entries[0]["error"]


def test_message_coercion():
    sink = CaptureSink()
    log = build_logger(level="DEBUG", sink=sink)
    log.info(None)
    log.info("text")
    log.info(42)
    log.info({"a": 1})
    try:
        raise ValueError("bad")
    except ValueError as exc:
        log.info(exc)
    assert [e["message"] for e in sink.entries] == [
        "", "text", "42", '{"a":1}', "bad",
    ]


# ---- location ----

def test_captures_caller_location():
    sink = CaptureSink()
    log = build_logger(level="DEBUG", sink=sink)
    log.info("located")
    location = sink.entries[0]["location"]
    assert location is not None
    assert "test_logger.py" in location
    assert re.search(r":\d+$", location)


# ---- sink failure handling ----

class ExplodingSink:
    def write(self, entry):
        raise OSError("disk full")

    def dispose(self):
        pass


def test_failing_sink_is_disabled_and_reported(capsys):
    good = CaptureSink()
    log = build_logger(level="DEBUG", sinks=[ExplodingSink(), good])
    log.info("one")
    log.info("two")
    captured = capsys.readouterr()
    assert "sink failed" in captured.err
    assert "[logger/test]" in captured.err
    assert len(good.entries) == 2


# ---- dispose ----

def test_dispose_calls_sink_dispose():
    sink = CaptureSink()
    log = build_logger(level="DEBUG", sink=sink)
    log.dispose()
    assert getattr(sink, "disposed", False)


# ---- env resolution through the logger ----

def test_env_level_overrides_default(monkeypatch):
    monkeypatch.setenv("LOG_LEVEL", "WARN")
    sink = CaptureSink()
    log = build_logger(sink=sink)
    log.info("hidden")
    log.warn("visible")
    assert [e["level"] for e in sink.entries] == ["WARN"]
