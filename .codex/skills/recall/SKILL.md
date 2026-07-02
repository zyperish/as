---
name: recall
description: Search local AM memory for past observations, sessions, project facts, user preferences, and reusable lessons. Use when the user says "recall", "remember", "what did we do", or needs context from past sessions.
argument-hint: "[search query]"
user-invocable: true
---

The user wants to recall past context about: $ARGUMENTS

Use the local no-port AM store first. From the project root, run:

```powershell
node .codex\tools\am-local-store.mjs recall --project-root . --query "<query>" --limit 10
```

Use `--enhanced true` only when the user asks for a deeper AM audit or when ordinary recall looks stale/incomplete and the task depends on current memory quality:

```powershell
node .codex\tools\am-local-store.mjs recall --project-root . --query "<query>" --limit 10 --enhanced true
```

Rules:

- Treat current verified facts, `project_rule`, `workflow_rule`, and `user_preference` records as stronger than old archive summaries.
- Treat `needsVerification` / `verify_first` records as drafts unless the query explicitly asks for drafts, pending work, blockers, handoff, or verification context.
- Do not present tombstoned records as active memory.
- Do not read huge JSONL files directly for ordinary recall.
- Do not make up observations. Only present what AM actually returned.

If local AM is unavailable, say `WARN: local AM recall unavailable` and use project files or session history as a fallback. MCP tools such as `memory_smart_search` are compatibility fallback only, not the default path for this workspace.
