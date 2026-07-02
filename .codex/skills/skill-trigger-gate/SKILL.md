---
name: skill-trigger-gate
description: Use before non-trivial work to decide which local skills must be used even when the user did not name them. Applies to coding, debugging, review, planning, AM/rule changes, Obsidian records, third-party absorption, memory repair, handoff, UI/video work, and repeated user corrections.
---

# Skill Trigger Gate

Use this as the first skill-selection pass for any task that is not a tiny direct answer.

## Rule

Do not wait for the user to name a skill. If the task matches a trigger below, read and use the matching skill before acting.

## Required Triggers

- AI problem, "solve issue", Obsidian records, issue list, absorption summary, AM improvement summary: use `obsidian-am-issue-writer`.
- Non-small task, debugging, planning, audit, deployment, rules or AM changes, multi-file analysis, user mentions CCOW/LW/W/TW: use `ccow-lw-orchestration`.
- AM memory repair, preserving lessons, reflection, encoding issue, session closeout, or "remember this": use `am-reflection-maintenance`.
- Document mojibake, UTF-8 save/read problems, Chinese Markdown corruption, or PowerShell encoding problems: use `obsidian-am-issue-writer`, `am-reflection-maintenance`, and `matt-diagnose`.
- Repeated user correction or durable workflow lesson that should become a skill/rule: use `experience-to-skill-distillation`.
- Reading many files, unfamiliar codebase, "inspect/read/find where", or changing code after discovery: use `file-reading-optimizer`.
- Failing command, test, build, hook, template, runtime, or agent behavior: use `matt-diagnose`.
- Subagent count, stale LW/TW, agent lifecycle cleanup, memory pollution, or agent wrapper behavior: use `matt-diagnose` and `agent-architecture-audit`; if the complaint is about too many subagents, do not spawn new subagents for the diagnosis.
- Implementing testable behavior, bug fix, parser, validation, business rule, shared utility: use `matt-tdd`.
- Code review, dependency impact, architecture relationship, risk analysis: use `code-review-graph` after fast file targeting.
- Architecture context before editing unfamiliar systems: use `matt-zoom-out`.
- Stopping, interruption, handoff, or continuation note: use `matt-handoff`.
- Third-party repo, framework, tool, skill pack, MCP, or deployment candidate audit: use `third-party-project-audit`; for local skill catalogs use `skill-catalog-audit`.
- Publishing to GitHub, creating or rewriting a repository README, improving a GitHub project page, or user says the GitHub repo/readme is poor: use `github-repo-readme`.
- Prompt improvement: use `prompt-optimizer-lite`.
- Product/feature requirements or vertical implementation slicing: use `prd`, `context-and-adr-planning`, or `vertical-slice-planning` as appropriate.
- Video, voiceover-to-video, Remotion, web presentation: use `web-video-presentation`; add `remotion-best-practices` for Remotion.

## Output Discipline

At kickoff for non-small work, state:

```text
Skill Gate:
- Required:
- Supporting:
- Skipped:
```

If an expected skill is skipped, give the reason. If you notice later that a skill should have been used, stop and recover by reading it, applying it, and recording the omission when the task requires Obsidian/AM.

## Validation

Before final response, check:

- Were all matching required skills read?
- Did the execution follow those skill constraints?
- For CCOW tasks, were independent same-phase lanes spawned before the first wait?
- Did the Coordinator perform non-overlapping local work while workers ran?
- If true subagent parallelism was unavailable, was the run labeled degraded instead of full CCOW?
- Did the final CCOW account include spawn order, wait order, worker scopes, coordinator-side work, and an effective/degraded verdict?
- Did Obsidian/AM get updated when the task changed durable workflow rules?
- Did CCOW lifecycle close or account for all subagents?
- If any `spawn_agent` was used, is every spawned id either closed with recorded result or explicitly retained with a current-task reason?
- If no subagents were spawned because the run was degraded, did the final answer say `CCOW degraded` and list the local evidence lanes instead of implying full CCOW?
- If AM was used for temporary context, were one-turn records avoided or tombstoned after use, while durable facts and user-approved sensitive operational data were preserved?
