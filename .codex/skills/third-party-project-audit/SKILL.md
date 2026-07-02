---
name: third-party-project-audit
description: Use when evaluating a GitHub repo, downloaded tool, skill pack, agent framework, MCP, UI/design toolkit, or any third-party project for deployment. It decides whether to deploy as root template, project-level skill, tools-only source, knowledge asset, lab candidate, or reject, while checking ports, services, licenses, caches, sessions, and template pollution risk.
---

# Third-Party Project Audit

Use this before adopting any external repo or local downloaded project.

## Deployment Decision

Classify the project as one of:

- `root-template`: only for AM, coding, planning, handoff, review, or context-management skills that are local and no-port.
- `project-skill`: useful for one project, such as Godot, Blender, design, diagrams, or asset pipelines.
- `tools-source`: keep source under `tools/<name>` and call or reference it explicitly.
- `knowledge-only`: summarize useful ideas under `.codex/knowledge-assets`; do not run it.
- `lab-candidate`: potentially useful but needs separate approval for services, Docker, ports, accounts, licenses, or installs.
- `reject`: not useful, unsafe, redundant, unlicensed, or conflicts with the local rules.

## Checklist

Check and report:

- Purpose and overlap with existing AM, repo-context, code-review-graph, project skills, or bundled plugins.
- Capability surface: whether the useful part should be a rule, skill, knowledge note, wrapper script, project-only tool, MCP, CLI, service, or full app.
- Runtime shape: pure skill, CLI, MCP stdio, HTTP service, desktop app, Docker stack, browser extension, or background daemon.
- Port usage and whether it violates the no-port template rule.
- Install footprint: `node_modules`, virtualenv, caches, session logs, model weights, databases, browser profiles.
- Write behavior: where it writes files, sessions, telemetry, config, or auth.
- License and redistribution risk.
- Whether it needs API keys, login, cloud upload, or external accounts.
- Deployment target, why that target is appropriate, and how it will be used later.

## Safety Rules

- Do not add it to `.mcp.json` unless explicitly approved.
- Do not install dependencies, run Docker, start services, or write global config unless the user explicitly asks.
- Do not put design/game/video/PPT/modeling tools into the base template.
- Do not copy `node_modules`, `.git`, `.venv`, caches, sessions, logs, or generated output into templates.
- Prefer source summaries and slim wrapper skills over whole-repo imports.
- Prefer the smallest surface that preserves the value: knowledge note before skill, skill before script, script before MCP, MCP before service.
- Treat bundled hooks, installers, dashboards, daemons, and account connectors as separate adoption decisions, not part of the default project verdict.

## Output

Use this shape:

| Project | Verdict | Deploy Where | Why | Future Use | Risk |
|---|---|---|---|---|---|

Then list:

- Safe subset to do now.
- Needs confirmation.
- Do not do.
