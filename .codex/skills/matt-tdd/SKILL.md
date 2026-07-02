---
name: matt-tdd
description: Use when implementing behavior that can be tested, especially bug fixes, validation, parsers, business rules, and shared utilities.
license: MIT
source: mattpocock/skills
---

# TDD

Use a small red-green-refactor loop.

## Steps

1. Define the behavior in one sentence.
2. Write or identify the smallest test that should fail for the missing behavior.
3. Run the test and confirm the failure is meaningful.
4. Implement the smallest change that makes it pass.
5. Re-run the focused test.
6. Run the nearest relevant regression check.
7. Refactor only if it reduces real complexity and tests still pass.

## Test Quality

- Test behavior, not implementation details.
- Prefer focused tests near the changed code.
- Add broader tests when touching shared contracts or user-facing workflows.
- Do not add brittle tests that only mirror current internals.

## AI Regression Checks

AI-generated fixes often miss the same blind spot during AI review. When fixing a bug:

- Add a regression test for the exact bug before relying on another review pass.
- Check every active execution path, especially sandbox/mock vs production, feature-flagged branches, and fallback branches.
- Assert response shapes and required fields explicitly when an API contract changed.
- Run the mechanical test or build check before doing subjective code review.
- If no framework exists, write a manual checklist that names the exact bug, expected behavior, and both paths checked.

## Safety

- Do not install test frameworks or rewrite project tooling unless the user approves.
- Do not run long or destructive suites when a focused check proves the change.
- If no test framework exists, write a clear manual verification checklist instead.
