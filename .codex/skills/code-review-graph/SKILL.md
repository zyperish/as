---
name: code-review-graph
description: Use when reviewing code structure, dependency impact, change risk, graph queries, or when the user asks for code graph, impact analysis, architecture relationships, or code review graph. Prefer repo-context for fast file targeting and code-review-graph for deeper relationship analysis.
---

# Code Review Graph

Use this skill when a task benefits from a persistent code graph.

## Local Setup

- Project graph data lives in `.code-review-graph/` when the optional tool is used.
- Project ignore rules live in `.code-review-graphignore` when configured.
- The base template does not enable `code-review-graph` in `.mcp.json` by default.
- Install the optional no-port entry per project before claiming it is active.
- This workflow uses stdio/local mode, not a long-running port.

## Workflow

1. Use `file-reading-optimizer` or `repo-context` first for fast entrypoints and target files.
2. Use `code-review-graph` when the task needs relationship, impact, dependency, or review-risk analysis.
3. Rebuild or update the graph only when relevant source files changed:
   - `code-review-graph update --repo <project>`
   - Use `build --skip-flows` for controlled full rebuilds.
4. Keep `.code-review-graphignore` strict. Do not index dependency folders, downloads, engines, logs, databases, memory runtime, or generated artifacts.

## Safety

- Do not start `watch`, `serve --http`, or daemon mode unless the user explicitly asks.
- Do not run a broad build if status or update is sufficient.
- Do not edit global Codex config just to make `codex mcp list` work.
- Graph databases are project runtime data, not template files.
