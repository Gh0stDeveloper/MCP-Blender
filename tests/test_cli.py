from __future__ import annotations

import os
from pathlib import Path

from nexora_forge_mcp.cli import (
    load_config,
    process_alive,
    read_env,
    save_config,
    slug,
    sql_string,
    write_env,
)


def test_env_roundtrip(tmp_path: Path) -> None:
    target = tmp_path / ".env"
    values = {"A": "one", "B": "two-three", "EMPTY": ""}
    write_env(target, values)
    assert read_env(target) == values


def test_install_config_roundtrip(tmp_path: Path) -> None:
    value = {"mode": "individual", "version": 1}
    save_config(tmp_path, value)
    assert load_config(tmp_path) == value


def test_slug_and_sql_quote() -> None:
    assert slug("NEXORA: DEADFALL Team") == "nexora-deadfall-team"
    assert sql_string("Ghost's Team") == "'Ghost''s Team'"


def test_process_alive_for_current_process() -> None:
    assert process_alive(os.getpid())
