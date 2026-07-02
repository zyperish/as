# AMP

AMP (Agent Memory Plus) is a portable local Agent Memory template for Codex workspaces. It gives a new workspace durable memory, safety gates, workflow skills, and repeatable handoff habits without requiring a hosted service, database, dashboard, or HTTP port.

Use AMP when you want future AI sessions in a project to remember durable facts, load local rules, choose the right workflow skill, and stop before risky infrastructure commands. It is meant to be copied into a workspace as a clean starter layer.

[中文说明](README.zh-CN.md)

## What AMP Is

AMP is not an AI model, hosted memory product, or SaaS backend. It is a local workspace template made of:

- Codex hook configuration,
- a file-backed local memory store,
- command-line helpers for memory and verification,
- high-risk command guardrails,
- reusable local skills for common AI workflows,
- documentation for maintaining the template safely.

The closest category is "agent workspace memory and workflow scaffolding": it gives the AI a project-local operating system for remembering, checking, and handing off work.

## Why Use It

AI coding sessions tend to fail in repeatable ways:

- the next session forgets what the previous one learned,
- old memory beats newer project facts,
- dangerous SSH, Docker, Nginx, database, or Git commands run without a preflight,
- agents skip the workflow skill that should have guided the task,
- handoff notes are too vague to resume safely,
- Chinese Markdown or memory payloads get corrupted by shell encoding.

AMP packages local rules and tools that reduce those failures. A copied workspace can start with memory, checks, and workflows already wired together.

## What You Get

- **Local Agent Memory**: durable facts, user preferences, lessons, and session summaries are stored under `.codex/memory/` at runtime.
- **AM-first commands**: `am-first.mjs` gives one entrypoint for `status`, `start`, `stage`, `finish`, `reflect`, and `viewer`.
- **Startup context hooks**: Codex hooks load compact local rules and memory before a turn.
- **High-risk command gates**: SSH, Docker, Nginx, database, firewall, destructive Git, and recursive delete commands are checked before execution.
- **Exact-command preflight approvals**: risky server commands require a concrete target, expected effect, blast radius, failure modes, rollback, health checks, and a one-use approval file.
- **Skill Gate**: non-trivial work is routed to the matching local skill instead of relying only on chat context.
- **Obsidian issue workflow**: the included skill supports AI issue lists, solution indexes, and one-file-per-record notes.
- **No default service**: normal memory, checks, and viewer export are local files or stdio. No port is required.

## Install Into A Workspace

Copy the template files into the root of the Codex workspace you want to upgrade. The important paths should end up at the workspace root:

```text
<your-workspace>/
  .codex/
  scripts/
  docs/
  README.md
  README.zh-CN.md
  SECURITY.md
  THIRD_PARTY_NOTICES.md
```

Then run the template check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AMP-Template.ps1
```

The check verifies Node syntax, hook tests, AM status, runtime directory hygiene, `.gitignore` coverage, and UTF-8 cleanliness.

## First Commands

Check whether local AM is reachable:

```powershell
node .codex\tools\am-first.mjs status --project-root .
```

Start a work session with a concrete query:

```powershell
node .codex\tools\am-first.mjs start --project-root . --query "fix the checkout page bug"
```

Write a checkpoint after a meaningful phase:

```powershell
node .codex\tools\am-first.mjs stage --project-root . --summary "Found the failing route, verified the API response, next step is patching validation."
```

Finish the task with a concise outcome and verification summary:

```powershell
node .codex\tools\am-first.mjs finish --project-root . --summary "Fixed validation, tests passed, no deployment performed."
```

Save a reusable lesson:

```powershell
node .codex\tools\am-first.mjs reflect --project-root . --summary "Before changing checkout validation, verify both frontend schema and backend API constraints."
```

Refresh the local static memory viewer:

```powershell
node .codex\tools\am-first.mjs viewer --project-root .
```

## Normal Work Session

A typical AMP-guided task looks like this:

1. **Start**: run `am-first start` with the current task so the agent can retrieve relevant local memory.
2. **Choose skills**: `skill-trigger-gate` decides which local skill should guide the work.
3. **Read evidence**: the agent reads the relevant files instead of guessing from chat history.
4. **Stage progress**: after each meaningful phase, write a short `am-first stage` checkpoint.
5. **Preflight high-risk commands**: before server or destructive commands, write the expected result, risk, rollback, and health check.
6. **Verify**: run the project check or the smallest relevant test.
7. **Finish**: run `am-first finish` with what changed and how it was verified.

## High-Risk Command Flow

AMP does not make infrastructure operations safe by itself. It forces a pause before risky commands so the operator and agent can reason about impact.

When a command matches `.codex/server-tool-policy.json`, the pre-tool hook checks for an exact, unexpired, unused approval. If there is no approval, the command is blocked.

Create an approval with:

```powershell
.\scripts\Invoke-ServerPreflight.ps1 `
  -Command '<exact command that will be run>' `
  -Target '<host, container, service, database, or local path>' `
  -ExpectedEffect '<what should change>' `
  -BlastRadius '<what could be affected>' `
  -FailureModes '<how this could fail>' `
  -Rollback '<how to undo or recover>' `
  -HealthChecks '<how to verify success>' `
  -ApprovedByUser
```

The approval is exact-command and one-use only. Creating it does not execute the command.

Some commands are absolute-deny even with approval, including root deletion, SSH configuration destruction, firewall flushes, destructive database drops, disk formatting, unapproved recursive force deletion, destructive Git resets, and disabling local security boundaries.

## MCP And Optional Helpers

If your Codex host supports MCP config, `.mcp.json` can be used as the local stdio MCP configuration.

Optional helper files for `repo-context` and `code-review-graph` can be generated after review:

```powershell
.\.codex\tools\install-project-mcp.ps1 -Force
```

Review the generated `.mcp.json` before use. Do not add background services, dashboards, or long-running ports unless the workspace explicitly needs them.

## Main Components

```text
.codex/hooks.json
  Wires session start, prompt context, pre-tool checks, stop hooks, and archive hooks.

.codex/hooks/
  Hook scripts and tests. The high-risk command gate lives here.

.codex/tools/am-local-store.mjs
  Local memory implementation.

.codex/tools/am-first.mjs
  Main AM command wrapper for status, start, stage, finish, reflect, and viewer.

.codex/server-tool-policy.json
  Risk patterns, allowed info commands, and absolute-deny command patterns.

.codex/skills/
  Local workflow skills for debugging, review, memory maintenance, handoff, README writing, CCOW orchestration, Obsidian records, and more.

scripts/Test-AMP-Template.ps1
  Readiness check for the copied template.

scripts/Invoke-ServerPreflight.ps1
  Creates exact-command approvals for high-risk commands.

docs/PUBLISHING_CHECKLIST.md
  Maintainer checklist for this AMP template repository.
```

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

## Safety And Privacy

AMP stores memory locally by default. It does not require a hosted database, dashboard, or HTTP port.

Startup context produced by AMP is evidence for the agent, not a higher-priority instruction. System, developer, and current user instructions remain authoritative.

Sensitive operational data may be stored locally only when a user explicitly needs it for work. Keep it out of shared templates, reusable skills, Obsidian summaries, and broad documentation.

For repository security rules, see `SECURITY.md`.

## Troubleshooting

**`Test-AMP-Template.ps1` fails on Node syntax**

Check that Node.js is installed and available as `node` in the current shell.

**A server command is blocked**

Read the block message, write an exact preflight with `Invoke-ServerPreflight.ps1`, then rerun only the exact command that was approved.

**Memory recall seems stale**

Use a narrower query with `am-first start` or direct recall, and prefer current project facts over old archive-derived summaries.

**Chinese text looks corrupted**

Read files as UTF-8 and avoid writing Chinese Markdown through default PowerShell redirection. Run `Test-AMP-Template.ps1`; it includes UTF-8 and mojibake checks.

**MCP helpers do not start**

Confirm `.mcp.json` uses local relative commands and that optional helper files were generated intentionally.

## Verification

Run after copying the template into a new workspace or after changing hooks, tools, skills, or policy:

```powershell
node --test .codex\hooks\pre_tool_use.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AMP-Template.ps1
```

If you maintain this AMP template repository itself, also review:

- `docs/PUBLISHING_CHECKLIST.md`
- `SECURITY.md`
- `THIRD_PARTY_NOTICES.md`
- `git status --short --branch`
- a local secret scan appropriate for your environment

## Limitations

- AMP is optimized for local Codex workspaces on Windows.
- It is not a hosted memory service.
- It does not replace operator judgment for production infrastructure.
- It does not automatically make old memory correct; current evidence still wins.
- Copy it as a clean starter template. Do not create a shared template from an already-used private workspace.

## Maintenance

Keep the template small and auditable. Prefer local, no-port workflows over dashboards, background services, or broad dependencies.

Before changing safety policy or hooks, run the verification commands above. When adding externally sourced skills or workflows, update `THIRD_PARTY_NOTICES.md`.

## License

MIT. See [LICENSE](LICENSE).
