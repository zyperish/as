---
name: matt-zoom-out
description: Use when a task touches unfamiliar code or architecture and you need a short system-level map before editing.
license: MIT
source: mattpocock/skills
---

# Zoom Out

Before changing unfamiliar code, map the surrounding system.

## Steps

1. Identify the entry point, owner module, and nearest tests.
2. Summarize the data flow in a few bullets.
3. Name the contracts that must not break.
4. Identify high-risk dependencies and side effects.
5. Decide the smallest safe place to change.

## Output

- What this area does.
- What calls it.
- What it calls.
- What tests or checks cover it.
- What change is safest.

Keep the summary short. Do not turn this into a broad architecture audit unless the user asks.
