# AM Local Memory Workflow

AM is the local memory layer for this template. It uses stdio MCP and local files only; no REST backend, viewer, runtime, or health port is required.

## Read-Only / No-Write Override

When the current user request or a higher-priority instruction says read-only, no-write, audit only, do not edit files, or do not save records, this override wins over AM closeout habits and hooks. Allowed AM operations are only `status`, `start`, and bounded `recall`. Skip `stage`, `finish`, `reflect`, `remember`, `memory_consolidate`, `memory_reflect`, viewer/static export, archive promotion, and Obsidian writes unless the user later explicitly authorizes writing.

## Required Per-Turn Behavior

- AM is the highest-priority local context system. Use `.codex\tools\am-first.mjs` before acting for non-trivial work, and run AM closeout after every completed response/turn.
- Explicit current-turn read-only/no-write requests override AM write behavior: use `status`, `start`, or `recall` only, and skip `stage`, `finish`, `reflect`, `remember`, and archive promotion unless the user separately approves writing records.
- `read-rules-and-memory.ps1` reads `AI_READ_THIS_FIRST.md`, queries local AM, and includes recent archive snippets.
- Keep `AGENTMEMORY_INJECT_CONTEXT=false`.
- If local AM recall fails, say `WARN: local AM recall unavailable`.
- Do not start a service to make memory work.
- The `Stop` hook runs `am-first finish` automatically every turn with a concise explicit closeout summary. It does not promote latest-archive summaries, consolidations, or archive-derived reflections unless `--promote-archives` or `--force` is used intentionally.

## AM-First Command Flow

Use this local no-port command as the normal entry point:

```powershell
node .codex\tools\am-first.mjs status --project-root .
node .codex\tools\am-first.mjs start --project-root . --query "<current task>"
node .codex\tools\am-first.mjs stage --project-root . --summary "<phase summary, evidence, next action>"
node .codex\tools\am-first.mjs finish --project-root . --summary "<final outcome and verification>"
node .codex\tools\am-first.mjs reflect --project-root . --summary "<reusable lesson or rule>"
node .codex\tools\am-first.mjs viewer --project-root .
```

Command responsibilities:

| Command | Uses | Purpose |
| --- | --- | --- |
| `status` | diagnose, health, goal board, project board, cleanup dry-run | AM health and maintenance snapshot. |
| `start` | diagnose, recall, session history, goal status, boards, health | Compact context pack before work starts. |
| `stage` | goal stage review/checkpoint or episodic remember | Phase summary, drift check, next actions. |
| `finish` | remember, latest archive summary, consolidate, reflect, diagnose, recall verify | End-of-work memory summary and maintenance. |
| `reflect` | procedural remember, reflection, diagnose, recall verify | Save reusable lessons and future rules. |
| `viewer` | static export | Refresh local HTML console without opening a port. |

Do not store raw long logs, binary assets, or generated caches through AM-first. Explicit AM-first summaries may include sensitive operational data when the user requires durable storage or the task cannot proceed without it; keep those entries local, minimal, structured, and easy to retrieve. Archive-derived promotion remains secret-scanned before summary, consolidation, or reflection.

Archive-derived maintenance is conservative by default:

- `finish` always writes the explicit final summary and verifies recall.
- `reflect` always writes the explicit reusable reflection and verifies recall.
- `finish` and `reflect` do not promote latest-archive summaries/consolidations/reflections by default.
- Use `--promote-archives` or `--force` only when archive-derived memory is intentionally needed; AM-first scans the latest archive for secret-like content before promotion.
- `status` and `start` are read-only context commands; they should not append maintenance records.

## Memory Specification

AM keeps full archives first, then derives structured memory:

| Layer | Stores | Examples |
| --- | --- | --- |
| Episodic | sessions and conversation summaries | what happened recently, handoffs, task outcomes |
| Semantic | durable facts and project state | user preferences, architecture decisions, deployment state |
| Procedural | reusable lessons and workflows | how to verify, what to avoid, coding/planning habits |
| Diagnostic | failures and maintenance status | hook failures, encoding warnings, queue state |

Every durable memory should include source, timestamp, project, importance, confidence, reusable flag, and concepts where possible.

## Tool Trigger Matrix

| Tool | Use When | Do Not Use When |
| --- | --- | --- |
| `memory_recall` | Direct-topic recall of named files, preferences, fixes, or recent decisions. | The query is broad and needs a session timeline. |
| `search` | Compatibility alias for `memory_recall`. | Use `memory_recall` when calling intentionally. |
| `session_history` | The user asks what happened last time or wants recent work history. | The user needs one durable fact. |
| `remember` | Save a durable fact, decision, preference, fix, architecture note, or handoff. | The content is transient or speculative. |
| `memory_consolidate` | Promote archive-derived facts after a meaningful phase. | During ordinary small turns. |
| `memory_reflect` | Extract reusable workflow lessons from recent work. | During urgent debugging or tiny fixes. |
| `memory_diagnose` | AM store, hook, encoding, archive, or queue state looks inconsistent. | The task has no memory concern. |
| `forget` | The user asks to forget/remove a specific memory. | Do not use for cleanup without user request. |

## End-Of-Turn Behavior

- Archive the readable user/assistant transcript.
- Save the archive as an episodic memory.
- Run `am-first finish` after every completed response/turn. The Stop hook performs this automatically, including small direct answers.
- Exception: for explicit read-only/no-write turns, do not write AM closeout or derived memories unless the user approves it. If platform hooks still archive externally, treat that archive as runtime evidence, not as promoted AM memory.
- Run `am-first reflect` when the main value is a lesson, correction, or future rule.
- Summarize the latest archive only when explicitly promoting archives.
- Consolidate durable facts only when explicitly promoting archives.
- Reflect reusable lessons from the current explicit summary by default; derive from archives only when explicitly promoting archives.
- Diagnose AM store counts and encoding warnings.

## Goal And Recovery Behavior

- Use `stage` after each meaningful phase so AM Goal can detect drift and keep next actions fresh.
- A participant or subagent cannot mark a goal complete by itself; completion still needs AM goal audit and Coordinator/user-level verification.
- If a turn or process is interrupted, use AM goal resume packets and the latest stage/finish records to continue instead of restarting from memory.
- If a cached CCOW WT/LW project finishes, copy only its final summary, durable lessons, and evidence references into AM; the CCOW cache pool itself is project-lifecycle scratch, not long-term AM.

## Reporting

When memory work matters, report briefly:

```text
AM: local stdio PASS; used memory_recall + archive summary.
```

Do not over-report raw JSON or irrelevant memories.
