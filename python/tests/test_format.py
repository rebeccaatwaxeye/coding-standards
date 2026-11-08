"""Format parity tests — expected strings mirror node/src/format.test.ts."""

import json

from nocturna_logger.format import format_ansi, format_json, format_plain_text
from nocturna_logger.types import make_entry as _make_entry


def make_entry(level="INFO", **overrides):
    entry = _make_entry(
        timestamp="01-02-2026 14:05:32",
        level=level,
        module="api",
        message="server listening",
    )
    entry.update(overrides)
    return entry


# ---- plain text ----

def test_plain_text_formats_timestamp_padded_level_tag_message():
    entry = make_entry(location="server.py:42")
    assert format_plain_text(entry) == (
        "[01-02-2026 14:05:32] [INFO    ] [api/server.py:42] server listening\n"
    )


def test_plain_text_pads_critical_to_eight_chars():
    assert "[CRITICAL]" in format_plain_text(make_entry("CRITICAL"))


def test_plain_text_omits_location_when_absent():
    assert format_plain_text(make_entry()) == (
        "[01-02-2026 14:05:32] [INFO    ] [api] server listening\n"
    )


def test_plain_text_appends_meta_suffix():
    entry = make_entry(
        traceId="abc",
        operation="boot",
        error={"name": "Error", "message": "boom"},
    )
    line = format_plain_text(entry)
    assert line.rstrip("\n").endswith("{traceId=abc, op=boot, error=boom}")


# ---- json ----

def test_json_emits_core_fields_in_fixed_order():
    line = format_json(make_entry())
    assert line.endswith("\n")
    value = json.loads(line)
    assert value["ts"] == "01-02-2026 14:05:32"
    assert value["level"] == "INFO"
    assert value["module"] == "api"
    assert value["msg"] == "server listening"
    assert list(value.keys()) == ["ts", "level", "module", "msg"]


def test_json_omits_optional_fields_when_absent():
    value = json.loads(format_json(make_entry()))
    assert "loc" not in value
    assert "traceId" not in value
    assert "op" not in value
    assert "data" not in value
    assert "error" not in value


def test_json_includes_optional_fields_when_present():
    entry = make_entry(
        location="a.py:1",
        traceId="t1",
        operation="op1",
        data={"x": 1},
        error={"name": "Error", "message": "boom"},
    )
    value = json.loads(format_json(entry))
    assert value["loc"] == "a.py:1"
    assert value["traceId"] == "t1"
    assert value["op"] == "op1"
    assert value["data"] == {"x": 1}
    assert value["error"] == {"name": "Error", "message": "boom"}


# ---- ansi ----

def test_ansi_wraps_timestamp_in_dim_codes():
    line = format_ansi(make_entry())
    assert "\x1b[2m[01-02-2026 14:05:32]\x1b[0m" in line


def test_ansi_maps_each_level_to_colour_and_icon():
    cases = [
        ("DEBUG", "\x1b[36m", "\U0001F41B"),
        ("INFO", "\x1b[32m", "\u2139\uFE0F"),
        ("WARN", "\x1b[33m", "\u26A0\uFE0F"),
        ("ERROR", "\x1b[31m", "\u274C"),
        ("CRITICAL", "\x1b[35m", "\U0001F525"),
    ]
    for level, ansi, icon in cases:
        line = format_ansi(make_entry(level))
        assert ansi in line, f"missing {ansi} for {level}"
        assert icon in line, f"missing {icon} for {level}"


def test_ansi_bolds_the_module_tag():
    line = format_ansi(make_entry(location="a.py:9"))
    assert "\x1b[1mapi/a.py:9\x1b[0m" in line


def test_ansi_meta_suffix_matches_plain_text():
    entry = make_entry(traceId="t", error={"message": "m"})
    ansi_line = format_ansi(entry)
    plain_line = format_plain_text(entry)
    assert "{traceId=t, error=m}" in ansi_line
    assert "{traceId=t, error=m}" in plain_line


def test_browser_args_badge_style_and_colour():
    from nocturna_logger.format import format_browser_args

    args = format_browser_args(make_entry(location="ui.py:3"))
    badge, badge_style, reset_style = args[0], args[1], args[2]
    assert badge.startswith("%c api/ui.py:3 %c")
    assert "INFO" in badge
    assert badge_style.startswith("background:#") and "color:#fff" in badge_style
    assert reset_style == "background:transparent;color:inherit;"


def test_browser_args_colour_is_deterministic_per_module():
    from nocturna_logger.format import format_browser_args

    a = format_browser_args(make_entry(module="api"))[0]
    b = format_browser_args(make_entry(module="api"))[0]
    c = format_browser_args(make_entry(module="worker"))[0]
    assert a == b and a != c


def test_browser_args_appends_error():
    from nocturna_logger.format import format_browser_args

    error = {"name": "TypeError", "message": "x"}
    args = format_browser_args(make_entry(error=error))
    assert args[-1] == error
