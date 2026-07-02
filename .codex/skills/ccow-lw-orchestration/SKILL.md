---
name: ccow-lw-orchestration
description: Use for non-small tasks when the user expects CCOW-style multi-LW/subagent parallel work, independent review, workflow summaries, and coordinator-led integration. Applies to planning, code edits, debugging, audits, deployment, AM/rule changes, cross-file analysis, and project delivery unless the task is clearly small.
---

# CCOW LW Orchestration

Use this skill to run complex work as a coordinator plus parallel LW/subagents.

## Task Size

Small tasks may stay local: single-step answers, simple read-only commands, tiny lookups, and changes that need no multi-phase verification.

Non-small tasks should use this workflow: planning, implementation, debugging, audit, deployment, AM or rules changes, cross-file analysis, asset/project delivery, and anything requiring independent review.

## Coordinator Duties

- Define the goal, constraints, evidence paths, and acceptance checks.
- Split work into independent slices with clear ownership.
- Start multiple LW/subagents in the same phase when the work can run independently.
- Default to coordinator-only work in the main thread: define, dispatch, synchronize, integrate, verify, and report.
- Keep urgent blocking work local if waiting would stall the critical path.
- Integrate results, resolve conflicts, and make the final judgment.
- Do not dump raw subagent logs into chat; write long detail to project reports.
- Track every spawned LW/subagent id and its purpose so lifecycle cleanup is auditable.

## Hard Parallel Dispatch

CCOW is not satisfied by declaring WT/LW/W/TW labels. For non-small work with independent lanes, use this dispatch algorithm:

1. Identify at least two independent same-phase lanes, or state that CCOW is degraded because true independent lanes do not exist.
2. Spawn all same-phase LW/TW tasks back-to-back before waiting for any result.
3. Do not immediately wait after the first spawn unless no other independent lane exists.
4. While workers run, the Coordinator must do non-overlapping useful work: file targeting, constraints matrix, acceptance checks, test selection, integration skeleton, or risk review.
5. Wait only after local non-overlapping work is exhausted or a worker result is required for the next integration step.
6. If subagent tools are unavailable or concurrency is limited, say `CCOW degraded: no true subagent parallelism` and use local parallel tool calls only where they are genuinely independent.
7. A run only counts as effective CCOW if removing CCOW would reduce speed, evidence coverage, independent review quality, conflict detection, or implementation throughput.

Forbidden shortcuts:

- Do not spawn one worker, wait for it, then spawn the next and call that parallel.
- Do not ask multiple workers the same broad question.
- Do not let the Coordinator idle while workers run.
- Do not call a run full CCOW when it is only a sequential checklist.

## WT/LW/W/TW Contract

- Treat `WT` as the work squad, not as a single agent.
- Treat `LW` as the functional lead for a WT. The LW owns coordination and final `wt_packet` synthesis for its squad scope.
- Treat `W` as an explicit work lane inside a WT, such as scope, implementation, verification, review, memory, or recovery.
- Treat `TW` as the task worker executing or auditing a specific W lane.
- When using the WT Cache Pool, create one brief per `WT/LW` pair and record W lanes and TW ids in the brief or packet when they are known.
- For `w_packet` evidence, include the lane (`wLane` or `wLanes`) and task worker (`taskWorkerId` or `taskWorkerIds`) so the Coordinator can audit LW -> W -> TW execution.
- Do not call a run "full CCOW" if W lanes and TW execution are not represented in the plan, packets, scoreboard, or final workflow pack.

## Parallelism Check

At the start and end of a CCOW run, explicitly verify:

- which LW/subagents were started,
- whether they were started concurrently,
- which starts failed because of tool/thread limits,
- what local parallel work compensated for any limit.
- spawn order, first wait time/order, and what the Coordinator did while workers were active,
- whether worker outputs were independent, scoped, and evidence-backed,
- whether the run was effective CCOW or only degraded/nominal CCOW.

Do not describe sequential work as CCOW parallel work.

## LW Prompt Shape

Each LW gets:

- one concrete subtask,
- exact file/path or source scope,
- forbidden actions,
- required evidence,
- output format,
- reminder that other workers may be active and user edits must not be reverted.

For external research, split by topic, not by asking several workers to answer the same broad question.

## Independent Review

For substantial results, run or request an independent review pass. Reviewers should check evidence, missing files, tests, policy conflicts, synchronization rules, and residual risk.

Avoid feeding reviewers the intended answer unless they need a specific artifact to verify.

## Agent Lifecycle

- Do not spawn LW/subagents unless the current user request explicitly asks for CCOW, subagents, delegation, parallel agent work, or there is another active instruction that authorizes it. If the user is complaining about too many subagents, do not spawn more; run CCOW degraded with local evidence lanes.
- Create a lifecycle ledger immediately after each spawn: agent id, nickname if shown, purpose, owner lane, started time/order, expected close condition, and whether it may edit files.
- Close spawned LW/subagents as soon as their result is integrated, rejected, or no longer needed. Completed agents also count as open until closed.
- After every `close_agent`, record the close result or error. If a known id returns `not found`, record it as not currently manageable; do not claim the UI history was cleared.
- Keep an agent open only when it has clear continuation value approved by the current task; record the reason, expected next use, owner, and next close checkpoint.
- End every CCOW run with a lifecycle check: no subagents spawned, or closed agents, retained agents with reasons, and failed close attempts.
- Do not leave completed, blocked, or stale agents open just for historical context; preserve useful detail in the project report or handoff instead.
- If the platform exposes no list-all or bulk-close tool, say so plainly. Do not pretend nickname-only historical agents were cleaned when only id-based close is available.
- Do not write raw worker logs, temporary prompts, or one-turn coordination payloads into AM. If temporary AM records were created only for the current task, tombstone them by id after use; keep only durable rules, verified facts, user preferences, and compact handoff summaries.

## Workflow Reference Pack

At stage and final handoff, record a compact CCOW pack:

```text
Goal:
LW split:
Started concurrently:
Tool/thread limits:
Spawn order:
Wait order:
Coordinator work while workers ran:
Agent lifecycle:
Files changed:
Commands run:
Evidence:
Review findings:
Risks:
Next dispatchable tasks:
Effective CCOW verdict:
```

## Safety

- Use AM/local memory first when available, but do not read huge session JSONL.
- Keep work local/no-port by default.
- Do not scan whole drives; stay in project root and named evidence paths.
- Do not start dashboards, HTTP services, Docker, or background daemons unless explicitly approved.
- Do not install packages or write global config unless explicitly approved.
- Do not add CCOW as a base-template active MCP service.
