#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

import codex_hook_adapter as adapter


def _read_head(path: Path, limit: int) -> str:
    lines: list[str] = []
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for idx, line in enumerate(handle):
                if idx >= limit:
                    break
                lines.append(line.rstrip("\n").lstrip("\ufeff") if idx == 0 else line.rstrip("\n"))
    except OSError:
        return ""
    return "\n".join(lines).rstrip()


def _read_tail(path: Path, limit: int) -> str:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    if lines:
        lines[0] = lines[0].lstrip("\ufeff")
    return "\n".join(lines[-limit:]).rstrip()


def build_context(root: Path) -> str:
    plan_path = root / "task_plan.md"
    if not plan_path.exists():
        return ""

    parts = [
        "[planning-with-files] ACTIVE PLAN - current state:",
        _read_head(plan_path, 50),
        "",
        "=== recent progress ===",
        _read_tail(root / "progress.md", 20),
        "",
        "[planning-with-files] Read findings.md for research context. Continue from the current phase.",
    ]
    return "\n".join(part for part in parts if part is not None).rstrip()


def main() -> None:
    payload = adapter.load_payload()
    root = adapter.cwd_from_payload(payload)
    context = build_context(root)
    if context:
        print(context)


if __name__ == "__main__":
    raise SystemExit(adapter.main_guard(main))
