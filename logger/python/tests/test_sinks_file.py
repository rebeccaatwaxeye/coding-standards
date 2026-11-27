"""File sink tests — rotation, retention, and size-cap pruning.

The clock is frozen by monkeypatching ``nocturna_logger.sinks._now``;
mtimes are set with ``os.utime`` (seconds precision), mirroring the
TS file-sink test suite.
"""

import os
import time

import pytest

import nocturna_logger.sinks as sinks_module
from nocturna_logger.sinks import FileSink, FileSinkOptions, file_sink

# Frozen clock sits in the past so real mtimes (now) read as negative age —
# same trick the TS suite uses with vitest fake timers.
NOW = time.time() - 5 * 365 * 24 * 60 * 60
TODAY = time.strftime("%Y-%m-%d", time.localtime(NOW))
NEXT_DAY = time.strftime("%Y-%m-%d", time.localtime(NOW + 24 * 60 * 60))


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch):
    monkeypatch.setattr(sinks_module, "_now", lambda: NOW)


@pytest.fixture
def tmp_dir(tmp_path):
    return str(tmp_path)


def read(dir_path, name):
    with open(os.path.join(dir_path, name), encoding="utf-8") as file:
        return file.read()


def backdate(dir_path, name, mtime, size=10):
    path = os.path.join(dir_path, name)
    with open(path, "w", encoding="utf-8") as file:
        file.write("x" * size)
    os.utime(path, (mtime, mtime))


def make_entry():
    return {
        "timestamp": "07-11-2026 12:00:00",
        "level": "INFO",
        "module": "api",
        "message": "hello",
    }


def test_creates_dated_plain_text_file(tmp_dir):
    sink = file_sink(FileSinkOptions(dir=tmp_dir))
    sink.write(make_entry())
    assert read(tmp_dir, f"app-{TODAY}.log") == (
        "[07-11-2026 12:00:00] [INFO    ] [api] hello\n"
    )


def test_appends_same_day_entries_to_one_file(tmp_dir):
    sink = FileSink(FileSinkOptions(dir=tmp_dir))
    sink.write(make_entry())
    sink.write(make_entry())
    content = read(tmp_dir, f"app-{TODAY}.log")
    assert len(content.splitlines()) == 2


def test_rolls_over_on_the_next_day(tmp_dir, monkeypatch):
    sink = FileSink(FileSinkOptions(dir=tmp_dir))
    sink.write(make_entry())
    monkeypatch.setattr(sinks_module, "_now", lambda: NOW + 24 * 60 * 60)
    sink.write(make_entry())
    assert os.path.exists(os.path.join(tmp_dir, f"app-{TODAY}.log"))
    assert os.path.exists(os.path.join(tmp_dir, f"app-{NEXT_DAY}.log"))


def test_prunes_files_older_than_retain_days(tmp_dir):
    backdate(tmp_dir, "app-2020-01-01.log", NOW - 20 * 24 * 60 * 60)
    backdate(tmp_dir, "app-2026-10-30.log", NOW - 8 * 24 * 60 * 60)
    sink = file_sink(FileSinkOptions(dir=tmp_dir))
    sink.write(make_entry())
    assert not os.path.exists(os.path.join(tmp_dir, "app-2020-01-01.log"))
    assert os.path.exists(os.path.join(tmp_dir, "app-2026-10-30.log"))


def test_removes_oldest_first_when_size_cap_exceeded(tmp_dir):
    # ~4.2 KB total vs a ~3.1 KB cap: only the oldest file must go.
    backdate(tmp_dir, f"app-{TODAY}.log", NOW, size=0)
    backdate(tmp_dir, "app-2020-01-01.log", NOW, size=2048)
    backdate(tmp_dir, "app-2021-01-01.log", NOW, size=2048)
    sink = FileSink(
        FileSinkOptions(dir=tmp_dir, retain_days=0, max_total_size_mb=0.003)
    )
    sink.write(make_entry())
    assert not os.path.exists(os.path.join(tmp_dir, "app-2020-01-01.log"))
    assert os.path.exists(os.path.join(tmp_dir, "app-2021-01-01.log"))
    assert os.path.exists(os.path.join(tmp_dir, f"app-{TODAY}.log"))


def test_keeps_old_files_when_pruning_disabled(tmp_dir):
    backdate(tmp_dir, "app-2020-01-01.log", NOW - 30 * 24 * 60 * 60)
    sink = FileSink(
        FileSinkOptions(dir=tmp_dir, retain_days=0, max_total_size_mb=0.0)
    )
    sink.write(make_entry())
    assert os.path.exists(os.path.join(tmp_dir, "app-2020-01-01.log"))
    assert os.path.exists(os.path.join(tmp_dir, f"app-{TODAY}.log"))


def test_honours_explicit_retention_overrides(tmp_dir):
    backdate(tmp_dir, "app-2026-11-06.log", NOW - 2 * 24 * 60 * 60)
    sink = FileSink(FileSinkOptions(dir=tmp_dir, retain_days=1))
    sink.write(make_entry())
    assert not os.path.exists(os.path.join(tmp_dir, "app-2026-11-06.log"))
