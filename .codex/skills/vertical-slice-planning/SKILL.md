---
name: vertical-slice-planning
description: Use when turning a plan, PRD, feature request, refactor, or large task into independently verifiable implementation slices. It creates thin end-to-end slices with dependencies, HITL/AFK labels, and acceptance criteria without requiring an external issue tracker.
source: local-original-workflow
license: MIT
---

# Vertical Slice Planning

Use this when a plan is too large to execute safely in one chunk.

## Local Boundary

This local workflow does not require GitHub, Linear, or any issue tracker. It
can output Markdown tasks, planning files, or a user-facing checklist. It does
not include upstream runtime, copied third-party text, or external service
requirements, and it does not override read-only/no-write requests.

## Workflow

1. Gather the current plan/spec and any relevant project context.
2. If the codebase matters, inspect the smallest relevant area first.
3. Break work into tracer-bullet vertical slices:
   - each slice is independently verifiable,
   - each slice delivers a narrow complete path,
   - prefer several small slices over one broad layer-by-layer task.
4. Mark each slice:
   - `AFK`: can be done without further human decisions,
   - `HITL`: needs user/design/architecture confirmation.
5. Record dependencies and blockers.
6. Add acceptance criteria for each slice.
7. Ask for approval before writing issue files or changing project task docs.

## Slice Template

```md
## Slice N: Short title

Type: AFK or HITL
Blocked by: None or slice IDs

What to build:
End-to-end behavior, not a list of layers.

Acceptance criteria:
- [ ] Verifiable criterion
- [ ] Verifiable criterion
- [ ] Regression or safety check
```

## Rules

- Avoid horizontal slices such as "only database", "only UI", or "only tests" unless the whole task is intentionally one layer.
- Avoid stale file-path-heavy task bodies unless a file is the actual artifact.
- Prefer tasks that can be tested, previewed, or reviewed separately.
- Do not create external issues unless explicitly requested.
- For AFK-ready work, write an agent brief instead of a file-by-file recipe:
  - current behavior,
  - desired behavior,
  - key interfaces or contracts,
  - acceptance criteria,
  - out-of-scope items.
- Keep agent briefs behavioral and durable. Avoid line numbers and brittle file paths unless the file itself is the artifact.
- For rejected enhancement ideas, record the durable reason in an out-of-scope note when the project has an approved place for such notes.

## Agent Brief Template

```md
## Agent Brief

Category: bug or enhancement
Summary: one-line description

Current behavior:
What happens now.

Desired behavior:
What should happen after the slice is complete.

Key interfaces:
- Type, command, route, config shape, or user-facing contract that matters.

Acceptance criteria:
- [ ] Specific, testable criterion
- [ ] Regression or safety check

Out of scope:
- Adjacent work that should not be done in this slice.
```
