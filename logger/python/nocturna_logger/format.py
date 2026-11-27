"""Formatters shared by the sinks (§14.5). Byte-for-byte identical to
``@nocturna/logger``'s formats — the parity fixtures in the tests of every
language's package assert this.
"""

import json
from typing import Any

LEVEL_ICON = {
    "DEBUG": "\U0001F41B",  # 🐛
    "INFO": "\u2139\uFE0F",  # ℹ️
    "WARN": "\u26A0\uFE0F",  # ⚠️
    "ERROR": "\u274C",  # ❌
    "CRITICAL": "\U0001F525",  # 🔥
}

LEVEL_ANSI = {
    "DEBUG": "\x1b[36m",  # cyan
    "INFO": "\x1b[32m",  # green
    "WARN": "\x1b[33m",  # yellow
    "ERROR": "\x1b[31m",  # red
    "CRITICAL": "\x1b[35m",  # magenta
}

RESET = "\x1b[0m"
DIM = "\x1b[2m"
BOLD = "\x1b[1m"
LEVEL_PAD = 8  # widest is "CRITICAL" = 8 chars


def _location_prefix(entry: dict[str, Any]) -> str:
    location = entry.get("location")
    return f"/{location}" if location else ""


def _build_meta_suffix(entry: dict[str, Any]) -> str:
    """`` {traceId=x, op=y, error=z}`` suffix — the fixed order mirrors TS."""
    parts: list[str] = []
    if entry.get("traceId"):
        parts.append(f"traceId={entry['traceId']}")
    if entry.get("operation"):
        parts.append(f"op={entry['operation']}")
    error = entry.get("error")
    if error:
        parts.append(f"error={error['message']}")
    return f" {{{', '.join(parts)}}}" if parts else ""


def _error_json(error: dict[str, Any]) -> dict[str, Any]:
    obj: dict[str, Any] = {"name": error["name"], "message": error["message"]}
    if error.get("stack"):
        obj["stack"] = error["stack"]
    if error.get("code"):
        obj["code"] = error["code"]
    return obj



def format_plain_text(entry: dict[str, Any]) -> str:
    """Plain-text format for file sinks.

    Format: ``[2026-08-29 14:05:32] [ERROR  ] [module/file:line] message {meta}``
    """
    level = entry["level"].ljust(LEVEL_PAD)
    tag = f"{entry['module']}{_location_prefix(entry)}"
    meta = _build_meta_suffix(entry)
    return f"[{entry['timestamp']}] [{level}] [{tag}] {entry['message']}{meta}\n"


def format_json(entry: dict[str, Any]) -> str:
    """One-liner JSON format for structured output (containers, aggregators).

    Each line is a complete JSON object — safe for log streaming.
    Key order is fixed: ts, level, module, msg, loc, traceId, op, data, error.
    """
    obj: dict[str, Any] = {
        "ts": entry["timestamp"],
        "level": entry["level"],
        "module": entry["module"],
        "msg": entry["message"],
    }
    if entry.get("location"):
        obj["loc"] = entry["location"]
    if entry.get("traceId"):
        obj["traceId"] = entry["traceId"]
    if entry.get("operation"):
        obj["op"] = entry["operation"]
    if entry.get("data") is not None:
        obj["data"] = entry["data"]
    if entry.get("error"):
        obj["error"] = _error_json(entry["error"])
    return json.dumps(obj, separators=(",", ":")) + "\n"


def format_ansi(entry: dict[str, Any]) -> str:
    """ANSI-formatted console line (terminal)."""
    icon = LEVEL_ICON.get(entry["level"], "")
    ansi_level = LEVEL_ANSI.get(entry["level"], "")
    location = _location_prefix(entry)
    meta = _build_meta_suffix(entry)
    level = entry["level"].ljust(LEVEL_PAD)
    return (
        f"{DIM}[{entry['timestamp']}]{RESET} "
        f"{ansi_level}{BOLD}{icon} {level}{RESET} "
        f"{BOLD}{entry['module']}{location}{RESET} "
        f"{entry['message']}{meta}\n"
    )


def format_browser_args(entry: dict[str, Any]) -> list:
    """Browser console arguments — badge style + message, for
    ``console[level](...)``. 10 browser-safe colours — module name hashed
    to pick one (mirrors the TS implementation).
    """
    browser_colours = [
        "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e",
        "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef", "#f43f5e",
    ]
    hash_module = 0
    for ch in entry["module"]:
        hash_module = ord(ch) + ((hash_module << 5) - hash_module)
    hash_module = abs(hash_module)
    color = browser_colours[hash_module % len(browser_colours)]
    icon = LEVEL_ICON.get(entry["level"], "")
    location = _location_prefix(entry)
    badge = f"%c {entry['module']}{location} %c {icon} {entry['level']} {entry['message']}"
    badge_style = (
        f"background:{color};color:#fff;padding:2px 4px;"
        "border-radius:3px;font-weight:bold;"
    )
    reset_style = "background:transparent;color:inherit;"
    args: list = [badge, badge_style, reset_style]
    if entry.get("error"):
        args.append(entry["error"])
    return args
