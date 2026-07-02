---
name: experience-to-skill-distillation
description: Use when repeated user corrections, stable workflows, failure modes, or reusable lessons should become a local Codex skill or skill update instead of staying only in chat or memory.
---

# Experience To Skill Distillation

Use this skill to turn repeated experience into a concise, reusable skill.

## Triggers

Distill when any of these are true:

- the user explicitly asks to turn experience into a skill,
- the same correction or workflow appears repeatedly,
- a failure mode would be prevented by a small procedural rule,
- a project repeatedly needs the same verification or handoff shape,
- a durable user preference should affect future non-trivial work.

## Extract

Capture only what future agents need:

```text
Problem pattern:
When to use:
Steps:
Validation:
Forbidden shortcuts:
Fallback:
```

Keep long examples in a reference file only when needed.

## Create Or Update

- Prefer updating an existing matching skill over creating duplicates.
- New skill names should be short, lowercase, and hyphen-case.
- `SKILL.md` must include only required frontmatter and essential instructions.
- Do not add README, changelog, logs, generated output, caches, or broad project notes.
- Root skills are for AM, planning, coding, audit, handoff, review, context management, and durable workflow policy.
- Project-specific skills belong under the relevant project, not the reusable base.

## Verify

Before finishing:

- check the skill trigger description is specific enough,
- check it does not conflict with local no-port/no-global-install rules,
- use an independent LW/reviewer for important workflow skills when available,
- record where the skill was created or updated.
