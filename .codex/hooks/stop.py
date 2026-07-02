#!/usr/bin/env python3
from __future__ import annotations

import re

import codex_hook_adapter as adapter


def _count(text: str, pattern: str) -> int:
    return len(re.findall(pattern, text, flags=re.MULTILINE))


def main() -> None:
    payload = adapter.load_payload()
    root = adapter.cwd_from_payload(payload)
    plan_path = root / "task_plan.md"
    if not plan_path.exists():
        return

    try:
        text = plan_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return

    total = _count(text, r"^### Phase")
    complete = text.count("**Status:** complete")
    in_progress = text.count("**Status:** in_progress")
    pending = text.count("**Status:** pending")

    if complete == 0 and in_progress == 0 and pending == 0:
        complete = text.count("[complete]")
        in_progress = text.count("[in_progress]")
        pending = text.count("[pending]")

    if complete == total and total > 0:
        message = f"[planning-with-files] ALL PHASES COMPLETE ({complete}/{total}). If the user has additional work, add new phases to task_plan.md before starting."
    else:
        message = f"[planning-with-files] Task incomplete ({complete}/{total} phases done). Update progress.md, then read task_plan.md and continue working on the remaining phases."

    if "ALL PHASES COMPLETE" in message:
        adapter.emit_json({"systemMessage": message})
        return

    if bool(payload.get("stop_hook_active")):
        adapter.emit_json({"systemMessage": message})
        return

    adapter.emit_json({"decision": "block", "reason": message})


if __name__ == "__main__":
    raise SystemExit(adapter.main_guard(main))
