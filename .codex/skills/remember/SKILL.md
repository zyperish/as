---
name: remember
description: Explicitly save a durable insight, decision, project fact, user preference, or reusable lesson to local AM. Use when the user says "remember this", "save this", or wants future sessions to preserve knowledge.
argument-hint: "[what to remember]"
user-invocable: true
---

The user wants to save this to long-term memory: $ARGUMENTS

Use the local no-port AM store first. Create a small UTF-8 JSON payload file, then run:

```powershell
node .codex\tools\am-local-store.mjs remember --project-root . --payload-file "<payload.json>"
```

Payload shape:

```json
{
  "title": "short searchable title",
  "content": "durable fact, preference, decision, or reusable lesson",
  "type": "user_preference",
  "layer": "semantic",
  "importance": "high",
  "confidence": 0.8,
  "reusable": true,
  "needsVerification": false,
  "concepts": ["specific-keyword"],
  "files": [],
  "source": { "kind": "user_request", "path": "" }
}
```

Rules:

- Save only durable memory: user preferences, project facts, deployment decisions, reusable rules, or handoffs.
- Do not save temporary tool output, raw logs, subagent prompts, cache packets, one-turn retrieval context, or full solution records.
- If a record is only temporary and has already been written, use `forget`/tombstone after it is consumed.
- Chinese payloads must go through `--payload-file` or another explicit UTF-8 API. Do not pipe Chinese JSON through PowerShell.
- Local AM may store user-approved or task-required sensitive operational facts, but keep them local, concise, and out of Obsidian/skills/templates.
- Mark uncertain facts with `needsVerification: true`; do not present those later as current verified facts.

After saving, verify with:

```powershell
node .codex\tools\am-local-store.mjs recall --project-root . --query "<specific query>" --limit 5
```

If local AM is unavailable, say `WARN: local AM remember unavailable` and record the durable point in the relevant project/Obsidian document instead. MCP tools such as `memory_save` are compatibility fallback only, not the default path for this workspace.
