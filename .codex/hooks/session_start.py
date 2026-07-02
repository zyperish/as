#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import codex_hook_adapter as adapter
import user_prompt_context


def _run_session_catchup(root: Path) -> str:
    codex_root = adapter.HOOK_DIR.parent
    script = codex_root / "skills" / "planning-with-files" / "scripts" / "session-catchup.py"
    if not script.exists():
        return ""

    result = subprocess.run(
        [sys.executable, str(script), str(root)],
        text=True,
        capture_output=True,
        check=False,
    )
    output = "\n".join(part for part in (result.stdout.strip(), result.stderr.strip()) if part)
    return output.strip()


def main() -> None:
    payload = adapter.load_payload()
    root = adapter.cwd_from_payload(payload)
    parts = [
        _run_session_catchup(root),
        user_prompt_context.build_context(root),
    ]
    output = "\n\n".join(part for part in parts if part)
    if output:
        print(output)


if __name__ == "__main__":
    raise SystemExit(adapter.main_guard(main))
