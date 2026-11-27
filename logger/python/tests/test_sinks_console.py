"""Console sink routing tests (capsys) — mirror the console sink semantics."""

from nocturna_logger.sinks import ConsoleSink
from nocturna_logger.types import make_entry


def make(level="INFO"):
    return make_entry(
        timestamp="01-02-2026 14:05:32", level=level, module="api", message="hello"
    )


def test_info_goes_to_stdout_with_ansi(capsys):
    ConsoleSink().write(make("INFO"))
    captured = capsys.readouterr()
    assert "api" in captured.out
    assert "hello" in captured.out
    assert "\x1b[" in captured.out
    assert captured.err == ""


def test_warn_and_debug_go_to_stdout(capsys):
    sink = ConsoleSink()
    sink.write(make("DEBUG"))
    sink.write(make("WARN"))
    captured = capsys.readouterr()
    assert captured.out.count("api") == 2
    assert captured.err == ""


def test_error_and_critical_go_to_stderr(capsys):
    sink = ConsoleSink()
    sink.write(make("ERROR"))
    sink.write(make("CRITICAL"))
    captured = capsys.readouterr()
    assert captured.err.count("api") == 2
    assert captured.out == ""
