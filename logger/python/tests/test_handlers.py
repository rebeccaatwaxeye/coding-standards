"""Global handler tests — the exit path is monkeypatched out."""

import dataclasses
import sys
import threading

import pytest

import nocturna_logger.global_handlers as handlers_module
from nocturna_logger import install_global_handlers


@pytest.fixture(autouse=True)
def fresh_hooks():
    handlers_module._INSTALLED = False
    yield
    handlers_module._INSTALLED = False


class CaptureLogger:
    def __init__(self):
        self.entries = []

    def critical_with(self, message, meta):
        self.entries.append((message, meta))


def test_install_registers_excepthooks():
    logger = CaptureLogger()
    install_global_handlers(logger)
    assert sys.excepthook is not None
    assert threading.excepthook is not None


def test_excepthook_logs_critical_with_details(monkeypatch):
    logger = CaptureLogger()
    install_global_handlers(logger)
    captured = {}
    monkeypatch.setattr(
        handlers_module,
        "_log_critical_and_exit",
        lambda log, error, error_type: captured.update(
            {"log": log, "error": error, "type": error_type}
        ),
    )

    try:
        raise ValueError("boom")
    except ValueError as exc:
        sys.excepthook(type(exc), exc, exc.__traceback__)

    assert captured["type"] == "uncaughtException"
    error = dataclasses.asdict(captured["error"])
    assert error["name"] == "ValueError"
    assert error["message"] == "boom"
    assert "boom" in error["stack"]


def test_thread_excepthook_logs_critical(monkeypatch):
    logger = CaptureLogger()
    install_global_handlers(logger)
    captured = {}
    monkeypatch.setattr(
        handlers_module,
        "_log_critical_and_exit",
        lambda log, error, error_type: captured.update(
            {"log": log, "error": error, "type": error_type}
        ),
    )

    try:
        raise OSError("thread died")
    except OSError as exc:
        threading.excepthook(
            threading.ExceptHookArgs((type(exc), exc, exc.__traceback__, None))
        )

    assert captured["type"] == "unhandledThreadException"
    error = dataclasses.asdict(captured["error"])
    assert error["name"] == "OSError"
    assert error["message"] == "thread died"


def test_thread_excepthook_ignores_system_exit(monkeypatch):
    called = {}
    monkeypatch.setattr(
        handlers_module,
        "_log_critical_and_exit",
        lambda log, error, error_type: called.update({"called": True}),
    )
    logger = CaptureLogger()
    install_global_handlers(logger)
    threading.excepthook(
        threading.ExceptHookArgs((SystemExit, SystemExit(), None, None))
    )
    assert called == {}


def test_install_is_idempotent(monkeypatch):
    logger = CaptureLogger()
    install_global_handlers(logger)
    first_hook = sys.excepthook
    install_global_handlers(logger)
    assert sys.excepthook is first_hook
