#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any


HOOK_DIR = Path(__file__).resolve().parent

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass


def load_payload() -> dict[str, Any]:
    payload_file = os.environ.get("CODEX_HOOK_PAYLOAD_FILE", "")
    if payload_file:
        try:
            raw_file = Path(payload_file).read_text(encoding="utf-8").strip()
        except OSError:
            raw_file = ""
        if raw_file:
            try:
                payload = json.loads(raw_file)
            except json.JSONDecodeError:
                payload = {}
            return payload if isinstance(payload, dict) else {}

    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def cwd_from_payload(payload: dict[str, Any]) -> Path:
    cwd = payload.get("cwd")
    if isinstance(cwd, str) and cwd:
        return Path(cwd)
    return Path.cwd()


def emit_json(payload: dict[str, Any]) -> None:
    if not payload:
        return
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


def parse_json(text: str) -> dict[str, Any]:
    if not text.strip():
        return {}
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def main_guard(func, fail_closed: bool = False) -> int:
    try:
        func()
    except Exception as exc:  # pragma: no cover
        if fail_closed:
            emit_json({
                "decision": "block",
                "reason": f"Hook failed closed: {exc}",
            })
        else:
            try:
                sys.stderr.write(f"Hook failed open: {exc}\n")
            except OSError:
                pass
        return 0
    return 0
