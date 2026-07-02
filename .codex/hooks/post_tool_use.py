#!/usr/bin/env python3
from __future__ import annotations

import codex_hook_adapter as adapter


def main() -> None:
    payload = adapter.load_payload()
    root = adapter.cwd_from_payload(payload)
    if (root / "task_plan.md").exists():
        adapter.emit_json({
            "systemMessage": "[planning-with-files] Update progress.md with what you just did. If a phase is now complete, update task_plan.md status."
        })


if __name__ == "__main__":
    raise SystemExit(adapter.main_guard(main))
