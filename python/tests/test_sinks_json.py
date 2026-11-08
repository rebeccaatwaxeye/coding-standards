"""JSON sink tests — stdout via capsys, file mode, failure reporting."""

import json
import os

from nocturna_logger.sinks import JsonSink, JsonSinkOptions


def make_entry(message="hello"):
    return {
        "timestamp": "01-02-2026 14:05:32",
        "level": "INFO",
        "module": "api",
        "message": message,
    }


def test_stdout_writes_one_json_line_per_entry(capsys):
    sink = JsonSink(JsonSinkOptions(output="stdout"))
    sink.write(make_entry("first"))
    sink.write(make_entry("second"))
    captured = capsys.readouterr()
    lines = captured.out.splitlines()
    assert len(lines) == 2
    first = json.loads(lines[0])
    assert first["module"] == "api"
    assert first["msg"] == "first"
    assert json.loads(lines[1])["msg"] == "second"


def test_file_mode_appends_jsonl_and_creates_parent_dirs(tmp_path):
    path = str(tmp_path / "nested" / "dir" / "structured.jsonl")
    sink = JsonSink(JsonSinkOptions(output="file", file_path=path))
    sink.write(make_entry("first"))
    sink.write(make_entry())
    with open(path, encoding="utf-8") as file:
        lines = file.read().rstrip("\n").split("\n")
    assert len(lines) == 2
    assert json.loads(lines[0])["msg"] == "first"
    assert json.loads(lines[1])["msg"] == "hello"


def test_file_mode_reports_failures_without_raising(capsys):
    sink = JsonSink(
        JsonSinkOptions(output="file", file_path="/proc/definitely/not/writable/x.jsonl")
    )
    sink.write(make_entry())
    captured = capsys.readouterr()
    assert "write failed" in captured.err
    assert "[logger/json]" in captured.err


def test_default_output_is_stdout(capsys, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    sink = JsonSink()
    sink.write(make_entry())
    captured = capsys.readouterr()
    assert captured.out != ""
    assert not os.path.exists("logs/structured.jsonl")
