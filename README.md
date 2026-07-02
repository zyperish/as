# AS - Local AM Template for Codex

AS is a portable local Agent Memory (AM) template for Codex-style workspaces.
It provides local memory storage, startup context hooks, high-risk command
guards, workflow skills, and readiness checks without requiring an HTTP server.

[中文说明](README.zh-CN.md)

This repository is a template. It intentionally does not include private memory,
conversation archives, server credentials, approvals, local caches, or project
work products.

## Included

- `.codex/tools/`: local AM store, AM-first command wrapper, and MCP entrypoints.
- `.codex/hooks/`: startup, prompt-context, pre-tool, archive, stop hooks, and hook tests.
- `.codex/skills/`: reusable AM, audit, planning, TDD, review, recall, and handoff skills.
- `.codex/server-tool-policy.json`: high-risk command rules.
- `scripts/`: readiness checks, AM checks, viewer export, and server preflight helper.
- `.mcp.json`: stdio/local MCP example.

## Excluded

- `.codex/memory/am/*.jsonl`
- `.codex/conversation-archive/**`
- `.codex/server-preflight/approvals/**`
- `.codex/server-preflight/audit/**`
- SSH keys, passwords, tokens, server IPs, or account data
- Obsidian records
- project-specific code, builds, caches, videos, logs, or runtime output

## Requirements

- Windows PowerShell 5.1 or newer
- Node.js available as `node`
- Python available as `python` or `py`
- Codex or another compatible runner that can use `.codex/hooks.json` and stdio MCPs

No HTTP port is required for AM.

## Quick Start

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AS-Template.ps1
node .codex\tools\am-first.mjs status --project-root .
node .codex\tools\am-first.mjs start --project-root . --query "initial setup"
```

If your Codex host supports MCP config, use `.mcp.json` as the local stdio MCP config.
Only `agentmemory` is enabled by default. Optional no-port helpers such as
`repo-context` and `code-review-graph` can be generated with
`.codex\tools\install-project-mcp.ps1 -Force` after reviewing the resulting
`.mcp.json`.

## Safety Model

- AM is local file storage by default.
- Startup context is evidence, not a higher-priority instruction.
- `PreToolUse` blocks high-risk infrastructure commands unless precise preflight approval exists.
- Destructive local commands such as recursive forced deletion and destructive Git reset/clean are blocked by policy.
- Sensitive operational data may be stored locally only when explicitly needed, but it must not be committed to GitHub.

## Verification

```powershell
node --test .codex\hooks\pre_tool_use.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AS-Template.ps1
```
