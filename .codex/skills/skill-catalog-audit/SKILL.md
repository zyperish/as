---
name: skill-catalog-audit
description: Use when searching local skill catalogs such as Hermes Skill Atlas, Garden Skills, mattpocock/skills, or other copied skill repositories to find candidates for AM, coding, planning, UI, Godot, Blender, or agent orchestration. It classifies skills without installing services or polluting the base template.
---

# Skill Catalog Audit

Use this before saying a skill ecosystem has nothing useful left.

## Local Catalogs

Check only named local sources:

- `tools/hermes-skill-atlas/data/skills.json`
- `tools/garden-skills/skills`
- `tools/external-skill-catalog/skills`
- `tools/ecc/skills`
- `tools/drawio-skill`
- `tools/layer-designer`
- `tools/agent-orchestration`

Do not scan the whole drive.

## Classification

For each candidate, classify as:

- `already-deployed`: local skill already covers it.
- `root-skill`: memory, coding, planning, handoff, context management, no service.
- `project-skill`: Godot, Blender, design, diagrams, project-only workflows.
- `knowledge-only`: useful ideas, but no runtime adoption.
- `tool-source`: keep source in `tools`; call only when asked.
- `needs-confirmation`: requires install, account, port, Docker, API key, or global hooks.
- `reject`: conflicts with AM, no-port MCP, template hygiene, or safety rules.

## Checks

- Is it pure `SKILL.md`, CLI, MCP, HTTP service, Docker, browser extension, or app?
- Does it overlap existing skills?
- Does it require persistent sessions, caches, databases, API keys, or telemetry?
- Would it belong in root template or only a project?
- Does it introduce a second memory system?
- Does it add a default port or graphical backend?
- Should it be `DAILY` (loaded/used often for this workspace) or `LIBRARY` (searchable reference only)?
- Is the candidate framework/domain-specific enough that it should wait for a real project need?

## Output

Use a compact table:

| Candidate | Decision | Where | Why | Future Use |
|---|---|---|---|---|

End with:

- deploy now,
- keep as knowledge,
- ask before doing,
- reject.

For large catalogs, include a small `DAILY / LIBRARY` summary so useful reference material is not mistaken for active default skill surface.
