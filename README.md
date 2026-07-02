# AS

AS is a portable local Agent Memory template for Codex workspaces that need durable memory, safety gates, and repeatable AI workflows without running a web service.

Use it when you want a new Codex workspace to remember important project facts, enforce high-risk command checks, and carry a curated set of local workflow skills from day one. AS is designed to be copied into a project as a clean starter template; it deliberately excludes private memory, credentials, chat archives, and runtime state.

[中文说明](README.zh-CN.md)

## Why Use It

Codex-style work often fails for predictable reasons: stale memory, forgotten workflow rules, unsafe server commands, and inconsistent handoff notes. AS packages the local pieces that reduce those failures:

- a no-port local AM store,
- startup and tool hooks that load rules as evidence,
- pre-tool checks for destructive or infrastructure commands,
- reusable skills for memory, debugging, reviews, handoff, README writing, and workflow discipline,
- a clean template boundary that keeps private runtime data out of copied workspaces.

## Features

- **Local Agent Memory**: store durable project facts, user preferences, lessons, and session summaries under `.codex/memory/` at runtime.
- **AM-first workflow**: use `am-first.mjs` to start, checkpoint, and finish meaningful work.
- **Safety gates**: block high-risk SSH, server, Docker, Nginx, database, and destructive Git/local commands unless the required preflight exists.
- **Skill Gate**: route non-trivial tasks to the matching local skill instead of relying on memory or chat context.
- **Obsidian-compatible issue records**: include the workflow skill used to maintain AI issue lists and one-file-per-record solution notes.
- **No default HTTP service**: AM and helper tools are local file or stdio based by default.
- **Template hygiene**: `.gitignore`, `SECURITY.md`, and local checks keep private runtime data out of the reusable template.

## Quick Start

Clone or copy this repository into a new workspace, then run the template check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AS-Template.ps1
```

Check AM status:

```powershell
node .codex\tools\am-first.mjs status --project-root .
```

Start a work session:

```powershell
node .codex\tools\am-first.mjs start --project-root . --query "initial setup"
```

If your Codex host supports MCP config, use `.mcp.json` as the local stdio MCP configuration. Optional helpers such as `repo-context` and `code-review-graph` can be generated after review:

```powershell
.\.codex\tools\install-project-mcp.ps1 -Force
```

Review the generated `.mcp.json` before use.

## How It Works

AS is a template layer around a Codex workspace:

1. `.codex/hooks.json` wires startup, prompt-context, pre-tool, post-tool, archive, and stop hooks.
2. `.codex/tools/am-local-store.mjs` keeps local memory in runtime files that are ignored by Git.
3. `.codex/tools/am-first.mjs` provides a single entrypoint for status, start, stage, finish, recall, and reflection workflows.
4. `.codex/server-tool-policy.json` defines commands that require preflight or must be blocked.
5. `.codex/skills/` gives future agents local procedures for common tasks such as debugging, memory repair, CCOW orchestration, issue records, repository README writing, and handoff.

## Repository Layout

```text
.codex/
  hooks/                  Codex hook scripts and tests
  skills/                 Local workflow skills
  tools/                  AM, MCP, safety, and helper tools
  server-tool-policy.json High-risk command policy
scripts/                  Readiness, AM, viewer, and preflight helpers
docs/                     Maintainer checklist for this template repository
README.md                 English project page
README.zh-CN.md           Chinese guide
SECURITY.md               Private data boundary
THIRD_PARTY_NOTICES.md    Source and license notes
```

## Safety and Privacy

AS stores memory locally by default. It does not require a hosted database, dashboard, or HTTP port.

Startup context produced by AS is evidence for the agent, not a higher-priority instruction. System, developer, and current user instructions remain authoritative.

Sensitive operational data may be stored locally only when a user explicitly needs it for work. Keep it out of shared templates, reusable skills, Obsidian summaries, and broad documentation.

## Verification

Run after copying the template into a new workspace or after changing hooks, tools, skills, or policy:

```powershell
node --test .codex\hooks\pre_tool_use.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AS-Template.ps1
```

If you maintain this AS template repository itself, also review:

- `docs/PUBLISHING_CHECKLIST.md`
- `SECURITY.md`
- `THIRD_PARTY_NOTICES.md`
- `git status --short --branch`
- a local secret scan appropriate for your environment

## Limitations

- AS is optimized for local Codex workspaces on Windows.
- It is not a hosted memory service.
- It does not make unsafe infrastructure operations safe by itself; it provides guardrails and checks that still require operator judgment.
- Copy it as a clean starter template. Do not create a shared template from an already-used private workspace.

## Contributing and Maintenance

Keep the template small. Prefer local, no-port, auditable workflows over dashboards, background services, or broad dependencies. Do not add generated state, local credentials, large caches, conversation logs, or private project files to shared template copies.

Before changing safety policy or hooks, run the verification commands above and update `THIRD_PARTY_NOTICES.md` when adding externally sourced skills or workflows.

## License

MIT. See [LICENSE](LICENSE).
