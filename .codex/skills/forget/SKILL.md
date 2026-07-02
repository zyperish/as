---
name: forget
description: Tombstone or remove specific observations from local AM/agentmemory. Use when user says "forget this", "delete memory", "用完就删", or wants temporary/private records removed from recall.
argument-hint: "[what to forget - session ID, file path, or search term]"
user-invocable: true
---

# Forget / Tombstone AM Records

The user wants to remove data from AM/agentmemory: `$ARGUMENTS`.

## Default Rule

Prefer non-destructive tombstone, not physical deletion. Local AM recall filters tombstoned ids through `.codex/memory/am/tombstones.jsonl`.

Use physical deletion only if the user explicitly confirms exact records and explicitly asks for destructive deletion.

## Local AM Flow

1. Identify matching records with bounded recall or precise search:

```powershell
node .codex/tools/am-local-store.mjs recall --project-root . --query "<query>" --limit 10 --enhanced false
```

2. If an exact memory id is known, tombstone it:

```powershell
node .codex/tools/am-local-store.mjs forget --project-root . --id "<memory-id>" --reason "<short reason>"
```

3. Verify the exact id or unique title no longer appears in recall results:

```powershell
node .codex/tools/am-local-store.mjs recall --project-root . --query "<exact title or marker>" --limit 10 --enhanced false
```

4. Report:

- records matched,
- ids tombstoned,
- verification result,
- any records intentionally retained.

## Temporary Records

For "用完就删":

- Do not write one-turn retrieval context, raw worker output, temporary prompts, cache payloads, or long logs into AM.
- If a temporary AM record was created, tombstone it by id immediately after use.
- Keep durable user preferences, project facts, deployment decisions, reusable lessons, handoffs, and user-approved sensitive operational data.

## Safety

- Do not scan the full `memories.jsonl` unless the user is explicitly asking for AM maintenance and bounded recall is insufficient.
- Do not use HTTP services, dashboards, or MCP ports for deletion.
- Do not claim deletion if only a search was performed.
- Do not claim UI subagent history was cleared by AM tombstones; subagent lifecycle is managed separately by `close_agent` when an id is available.
