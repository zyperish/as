# MCP Port Plan

Base template rule: active MCP entries must not occupy HTTP ports. The base
`.mcp.json` enables only `agentmemory` by default; other helpers are optional
no-port entries that may be installed per project.

| Name | Kind | Ports | Startup Policy | Notes |
| --- | --- | --- | --- | --- |
| agentmemory | stdio MCP + local AM store | none | Codex starts on demand | Uses `.codex\memory\am` and `.codex\conversation-archive`; no REST/viewer/runtime. |
| repo-context | optional stdio MCP | none | Install per project | Read-only project context helper; not active in the base `.mcp.json`. |
| code-review-graph | optional stdio/local MCP or CLI | none by default | Install per project | HTTP mode stays disabled unless explicitly requested. |
| ai-chatroom | optional stdio MCP + local JSONL log | none | Optional on demand | Writes `.codex\ai-chatroom\messages.jsonl`; do not treat as durable AM or template content. |

## Removed From Active Template

- AM REST/runtime/viewer ports `3111`, `3112`, `3113`.
- CCOW/Ralph/CCP dashboard ports `8787`, `8788`.
- Blender addon socket `9876`.
- Any extra health endpoint or validation-only port.

## Rules

- Do not create a combined MCP service.
- Do not add active graphical MCPs to the base template.
- Do not auto-start dashboards, viewers, games, editors, or background supervisors.
- Validate AM by stdio MCP calls and local JSONL store checks.
- Validate optional repo-context and code-review-graph only after they are installed in the project `.mcp.json`.
