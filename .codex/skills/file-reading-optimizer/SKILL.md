---
name: file-reading-optimizer
description: Use before reading many files, analyzing an unfamiliar codebase, changing code after context gathering, or responding to requests like "read the folder", "inspect the project", "find where this is implemented", or "what files matter". Prefer repo-context MCP when available, otherwise use rg --files and targeted reads.
---

# File Reading Optimizer

Use this skill before broad codebase exploration or implementation work.

## Workflow

1. Start with `repo-context` MCP if available:
   - `status` to see whether an index exists.
   - `index` if no index exists or the project has changed.
   - `entrypoints` and `structure` to understand the project shape.
   - `context_for_files` when the user names files.
   - `analyze_change` when the task relates to current modifications.
2. If `repo-context` is unavailable, use `rg --files` with exclusion globs before reading content.
3. Read only the smallest set of files needed for the current decision.
4. Avoid dependency, build, cache, log, binary, large generated, and whole-drive scans.
5. When a change is needed, read nearby tests and callers before editing.

## Rules

- Do not claim to have read all files unless you actually did and the set is small.
- For large projects, summarize the map first, then read targeted files.
- Prefer structured parsers and existing project tools over ad hoc text scraping when available.
- If the file set is ambiguous, report the candidate entrypoints and continue with the highest-signal path.
- Preserve user edits and avoid unrelated cleanup.
- Use a context budget: read indexes, headings, manifests, and summaries first; deep-read only the files that decide the next action.
- For parallel workers, give each worker a narrow evidence path and ask for missing-context requests instead of broad whole-tree exploration.
- After a large discovery pass, compact findings into a durable note or handoff before continuing implementation.

## Fallback Commands

Use PowerShell-safe commands such as:

```powershell
rg --files --glob '!node_modules/**' --glob '!dist/**' --glob '!build/**' --glob '!coverage/**'
```

Then read specific files with `Get-Content -LiteralPath <path> -TotalCount <n>`.
