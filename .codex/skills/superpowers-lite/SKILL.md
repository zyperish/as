---
name: superpowers-lite
description: Use when a coding task needs disciplined specification, implementation planning, TDD, verification, code review, or multi-step execution. This is a local, compact workflow and does not install or bundle an upstream plugin.
source: local-original-workflow
license: MIT
---

# Superpowers Lite

Use this skill to keep larger coding work structured without importing the full Superpowers plugin.

## Local Boundary

This skill is local workflow guidance only. It does not install external
plugins, copy upstream code/assets/long text, create branches/worktrees, or
enable external services. It is subordinate to system/developer/user
instructions and read-only/no-write requests.

## Workflow

1. Clarify the user goal and success criteria before coding when the request is broad.
2. For this user's workspace, non-small tasks should trigger `ccow-lw-orchestration` when LW/subagent tools are available: split independent work, start workers concurrently, and keep the main rollout as coordinator/integrator.
3. Convert the goal into a short implementation plan with concrete files, checks, and rollback risks.
4. Prefer test-first work for shared logic, parsers, command behavior, and bug fixes.
5. Execute in small increments and verify after each meaningful change.
6. Review the result against the user request, not against a self-invented broader goal.
7. Finish with concrete verification evidence and any residual risk.

## Guardrails

- Do not create worktrees, branches, commits, or PR flows unless the user asks.
- Do not launch subagents unless the current task or durable user preference explicitly calls for agent delegation; when used, verify the work was actually parallel and record any thread/tool limits.
- Do not copy external plugin code, assets, or whole skill libraries into this template.
- Keep this skill subordinate to local safety rules in `.codex/AI_READ_THIS_FIRST.md`.
