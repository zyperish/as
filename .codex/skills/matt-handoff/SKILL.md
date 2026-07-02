---
name: matt-handoff
description: Use before stopping, compacting, pausing, or handing work to another AI so the next agent can resume without guessing.
license: MIT
source: mattpocock/skills
---

# Handoff

Create a concise handoff when work may be interrupted.

## Include

- Current goal.
- Current status: done, in progress, blocked, or failed.
- Files changed or intended to change.
- Commands run and their results.
- Decisions made and why.
- For CCOW/LW work: LW split, whether starts were concurrent, agent lifecycle, and any retained agents with reasons.
- Known risks and open questions.
- Exact next action.

## Windows-Safe Storage

If a handoff file is needed, write it inside the project or approved run directory, for example:

```powershell
$handoff = Join-Path (Get-Location) 'handoff.md'
```

Do not use Unix-only temporary-file commands. Do not put handoff files in a reusable template unless the user asked for template documentation.

## Safety

- Do not hide failures.
- Do not claim tests passed if they were not run.
- Do not delete old context to make the handoff look clean.
