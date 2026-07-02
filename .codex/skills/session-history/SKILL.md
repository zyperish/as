---
name: session-history
description: Show what happened in recent past sessions on this project. Use when user asks "what did we do last time", "session history", "past sessions", or wants an overview of previous work.
user-invocable: true
---

Fetch recent session history from local AM first:

```powershell
node .codex\tools\am-local-store.mjs session-history --project-root . --limit 20
```

Use local archives and AM session records as the source of truth. Do not default to `memory_sessions` MCP or an agentmemory server.

Present a clean reverse-chronological timeline:

- session id or archive file,
- channel/source,
- timestamp or modified time,
- project/root if available,
- key summary when available,
- any durable decisions or next-step handoff references.

Rules:

- Do not make up sessions. Only show what the local command or archive files returned.
- Prefer summaries and compact archive metadata before opening large conversation archives.
- If the user asks for details from a specific session, open only that archive or run targeted recall.
- If local AM is unavailable, say `WARN: local AM session history unavailable` and fall back to bounded reads of `.codex\conversation-archive`.
- MCP tools such as `memory_sessions` are compatibility fallback only, not the default path for this workspace.
