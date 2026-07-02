---
name: am-reflection-maintenance
description: Use when preserving, summarizing, reflecting on, diagnosing, or repairing AM local memory after a work session, major deployment, failed hook, encoding issue, or user request to remember lessons. It keeps full archives first, derives summaries/facts/lessons/project state, verifies UTF-8, and avoids HTTP ports.
---

# AM Reflection Maintenance

Use this at meaningful stopping points or after memory-related changes.

## Goals

AM should preserve:

- full conversation archives,
- session summaries,
- durable project facts,
- user preferences,
- reusable lessons,
- failure diagnostics,
- deployment decisions,
- source paths and confidence.

AM must remain local and no-port. Do not require `3111`, `3112`, `3113`, REST, runtime, viewer, or health pages.

## Workflow

1. Confirm the local AM store is reachable through `.codex/tools/am-local-store.mjs`.
2. Archive first when a conversation transcript exists.
3. Derive layered memory from the archive:
   - episodic summary,
   - semantic facts/project state,
   - procedural lessons/reflections,
   - diagnostics if anything failed.
4. Preserve source paths and related files.
5. Verify new memory can be recalled.
6. Check for encoding damage:
   - no triple-question-mark replacement text for Chinese paths or content,
   - no replacement character,
   - no mojibake in new Markdown.
   - read Markdown back as UTF-8 before claiming it is valid.
7. If a bad record was created, tombstone it with `forget`; do not rewrite history destructively.
8. If a record was created only as temporary working context for the current turn, tombstone it by id after the information is consumed. "用完就删" means non-destructive AM removal through tombstones unless the user explicitly confirms exact records for destructive deletion.

For non-small CCOW/LW work, also create a compact workflow reference pack for future agents:

```text
Goal:
LW split:
Started concurrently:
Tool/thread limits:
Agent lifecycle:
Files changed:
Commands run:
Evidence:
Review findings:
Risks:
Next dispatchable tasks:
```

If a reusable lesson or repeated correction appears, add it to a candidate skill backlog or use `experience-to-skill-distillation` to create/update a skill. Keep archive-first memory discipline; do not ingest huge session JSONL directly.

## Useful Commands

Syntax check:

```powershell
node --check .codex\tools\am-local-store.mjs
```

Recall:

```powershell
node .codex\tools\am-local-store.mjs recall --project-root . --query "<topic>" --limit 5
```

View local memory:

```powershell
.\View-AM-Memory.ps1
```

This regenerates `.codex\memory\am-viewer\index.html` and opens it as a static local file. It does not start a service or occupy a port.

Write memory safely from Node when Chinese paths matter:

```powershell
node -e "const store=await import('./.codex/tools/am-local-store.mjs'); const root='D:'+'\\\\'+'\u81ea\u5236'; const result=await store.remember(root,{title:'...',content:'...',type:'project_state'}); console.log(JSON.stringify(result,null,2));"
```

Avoid PowerShell JSON pipelines for Chinese-heavy payloads unless UTF-8 behavior has been verified.

For Chinese Markdown, Obsidian records, Skill files, or rule files:

- Prefer `apply_patch` for manual edits.
- PowerShell reads must use `Get-Content -Encoding UTF8`.
- If default PowerShell reading shows mojibake, re-read with explicit UTF-8 or a byte-level check before declaring the file corrupt.
- Do not write Chinese text with default-encoding `Set-Content`, `Out-File`, `Add-Content`, `>` or `>>`.
- If scripting is unavoidable, use an explicit UTF-8 writer such as Node `fs.writeFile(..., 'utf8')` or .NET UTF8 encoding.
- Do not pass Chinese JSON or Markdown through PowerShell here-strings, pipelines, or redirection to Node/AM; use `--payload-file`, `apply_patch`, or an explicit UTF-8 file API.
- Before checkoff, scan new/changed docs for three consecutive question marks, replacement character `U+FFFD`, and common mojibake fragments. A policy mention of the word `mojibake` alone is not a failure.

## Reflection Prompts

When extracting lessons, ask:

- What did the user correct repeatedly?
- What rule would have prevented the mistake?
- Which deployment decision must future sessions remember?
- Which file/path/source proves the fact?
- What should be checked next time before claiming PASS?

## Constraints

- Do not delete AM data directly.
- Do not keep temporary AM work records, worker prompts, raw subagent outputs, one-turn retrieval payloads, or cache summaries after they have served the current task. Avoid writing them in the first place; if already written, use `.codex/tools/am-local-store.mjs forget --id <memory-id> --reason "<reason>"` and verify recall no longer returns the record.
- Do not tombstone durable user preferences, project facts, deployment decisions, reusable lessons, handoffs, or user-approved sensitive operational data just because they were read during a task. Those are long-term memory, not disposable context.
- Do not turn on official automatic context injection unless the user explicitly asks.
- Sensitive operational data may be stored in local AM when the user explicitly wants durable storage or the task cannot proceed without it. Keep it local, concise, and out of Obsidian, reusable skills, templates, and broad reflections unless the user explicitly asks otherwise.
- Do not save generated caches, logs, or runtime output into templates.
- Do not restore the old HTTP viewer/health page; use the static local viewer instead.
