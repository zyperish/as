---
name: karpathy-guidelines
description: Use when writing, reviewing, or refactoring code to avoid bad assumptions, overengineering, unrelated edits, and unverifiable work.
license: MIT
source: forrestchang/andrej-karpathy-skills
---

# Karpathy Guidelines

Use these rules before nontrivial coding work.

## Think Before Coding

- State important assumptions.
- Surface ambiguity instead of guessing silently.
- Present meaningful tradeoffs when there is more than one plausible path.
- Push back when a simpler or safer approach exists.

## Simplicity First

- Build only what was asked.
- Avoid speculative features and one-use abstractions.
- Prefer the smallest clear implementation.
- If a solution becomes much larger than necessary, simplify it.

## Surgical Changes

- Touch only files needed for the request.
- Preserve user edits and existing style.
- Do not refactor nearby code just because it looks imperfect.
- Remove only dead code created by your own change unless the user asks for broader cleanup.

## Goal-Driven Execution

- Define success criteria before implementation.
- Prefer tests or concrete checks that prove the task is done.
- Log errors and avoid repeating the same failed action.
- Finish with what changed, what was verified, and any remaining risk.
