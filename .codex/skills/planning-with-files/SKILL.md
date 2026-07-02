---
name: planning-with-files
description: Local adaptation of a Manus-style file-based planning pattern. Use only when the user asks for file-based planning or when a complex writable task truly needs persistent local plan files. Do not use during read-only, no-write, quick lookup, or simple edit tasks.
user-invocable: true
allowed-tools: "Read Write Edit Bash Glob Grep"
source: local-adaptation-inspired-by-manus-style-file-planning
license: local-workflow-note
hooks:
  UserPromptSubmit:
    - hooks:
        - type: command
          command: 'powershell -NoProfile -ExecutionPolicy Bypass -Command "if(Test-Path -LiteralPath ''task_plan.md''){ Write-Output ''[planning-with-files] ACTIVE PLAN - current state:''; Get-Content -LiteralPath ''task_plan.md'' -TotalCount 50; Write-Output ''''; Write-Output ''=== recent progress ===''; if(Test-Path -LiteralPath ''progress.md''){ Get-Content -LiteralPath ''progress.md'' | Select-Object -Last 20 }; Write-Output ''''; Write-Output ''[planning-with-files] Read findings.md for research context. Continue from the current phase.'' }"'
  PreToolUse:
    - matcher: "Write|Edit|Bash|Read|Glob|Grep"
      hooks:
        - type: command
          command: 'powershell -NoProfile -ExecutionPolicy Bypass -Command "if(Test-Path -LiteralPath ''task_plan.md''){ Get-Content -LiteralPath ''task_plan.md'' -TotalCount 30 }"'
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: 'powershell -NoProfile -ExecutionPolicy Bypass -Command "if(Test-Path -LiteralPath ''task_plan.md''){ Write-Output ''[planning-with-files] Update progress.md with what you just did. If a phase is now complete, update task_plan.md status.'' }"'
  Stop:
    - hooks:
        - type: command
          command: 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$sd=$env:CODEX_SKILL_ROOT; if([string]::IsNullOrWhiteSpace($sd)){ $sd=Join-Path $env:USERPROFILE ''.codex\skills\planning-with-files'' }; & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $sd ''scripts\check-complete.ps1'')"'
metadata:
  version: "2.35.0"

---

# Planning with Files

Use persistent markdown files as working memory on disk only when the current task is writable and large enough to justify project-local plan files.

This is a local workflow note, not a system-level protocol. Current user instructions, read-only/no-write requests, and repository-specific rules override this skill.

## FIRST: Check for Previous Session (v2.2.0)

**Before starting work**, check for unsynced context from a previous session:

```powershell
# Windows PowerShell
python "$env:USERPROFILE\.codex\skills\planning-with-files\scripts\session-catchup.py" (Get-Location)
```

If catchup report shows unsynced context:
1. Run `git diff --stat` to see actual code changes
2. Read current planning files
3. Update planning files based on catchup + git diff
4. Then proceed with task

## Important: Where Files Go

- **Templates** are in `~/.codex/skills/planning-with-files/templates/`
- **Your planning files** go in **your project directory**

| Location | What Goes There |
|----------|-----------------|
| Skill directory (`~/.codex/skills/planning-with-files/`) | Templates, scripts, reference docs |
| Your project directory | `task_plan.md`, `findings.md`, `progress.md` |

## Quick Start

For a complex writable task where file planning is appropriate:

1. **Create `task_plan.md`** — Use [templates/task_plan.md](templates/task_plan.md) as reference
2. **Create `findings.md`** — Use [templates/findings.md](templates/findings.md) as reference
3. **Create `progress.md`** — Use [templates/progress.md](templates/progress.md) as reference
4. **Re-read plan before decisions** — Refreshes goals in attention window
5. **Update after each phase** — Mark complete, log errors

> **Note:** Planning files go in your project root, not the skill installation folder.

## The Core Pattern

```
Context Window = RAM (volatile, limited)
Filesystem = Disk (persistent, unlimited)

→ Anything important gets written to disk.
```

This applies only when writes are allowed and the task needs persistent local planning. For read-only/no-write tasks, keep findings in the response or a user-approved record instead of creating planning files.

## File Purposes

| File | Purpose | When to Update |
|------|---------|----------------|
| `task_plan.md` | Phases, progress, decisions | After each phase |
| `findings.md` | Research, discoveries | After ANY discovery |
| `progress.md` | Session log, test results | Throughout session |

## Critical Rules

### 1. Create Plan When It Is Appropriate
For complex writable work, create `task_plan.md` before broad execution. Skip this for read-only/no-write tasks, quick lookups, small edits, or when the user asks for a plan only in chat.

### 2. The 2-Action Rule
> "After every 2 view/browser/search operations, IMMEDIATELY save key findings to text files."

This prevents visual/multimodal information from being lost.

### 3. Read Before Decide
Before major decisions, read the plan file. This keeps goals in your attention window.

### 4. Update After Act
After completing any phase:
- Mark phase status: `in_progress` → `complete`
- Log any errors encountered
- Note files created/modified

### 5. Log ALL Errors
Every error goes in the plan file. This builds knowledge and prevents repetition.

```markdown
## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| FileNotFoundError | 1 | Created default config |
| API timeout | 2 | Added retry logic |
```

### 6. Never Repeat Failures
```
if action_failed:
    next_action != same_action
```
Track what you tried. Mutate the approach.

## The 3-Strike Error Pattern

```
ATTEMPT 1: Diagnose & Fix
  → Read error carefully
  → Identify root cause
  → Apply targeted fix

ATTEMPT 2: Alternative Approach
  → Same error? Try different method
  → Different tool? Different library?
  → NEVER repeat exact same failing action

ATTEMPT 3: Broader Rethink
  → Question assumptions
  → Search for solutions
  → Consider updating the plan

AFTER 3 FAILURES: Escalate to User
  → Explain what you tried
  → Share the specific error
  → Ask for guidance
```

## Read vs Write Decision Matrix

| Situation | Action | Reason |
|-----------|--------|--------|
| Just wrote a file | DON'T read | Content still in context |
| Viewed image/PDF | Write findings NOW | Multimodal → text before lost |
| Browser returned data | Write to file | Screenshots don't persist |
| Starting new planned phase | Read plan/findings | Re-orient if context stale |
| Error occurred | Read relevant file | Need current state to fix |
| Resuming after gap | Read all planning files | Recover state |

## The 5-Question Reboot Test

If you can answer these, your context management is solid:

| Question | Answer Source |
|----------|---------------|
| Where am I? | Current phase in task_plan.md |
| Where am I going? | Remaining phases |
| What's the goal? | Goal statement in plan |
| What have I learned? | findings.md |
| What have I done? | progress.md |

## When to Use This Pattern

**Use for:**
- Multi-step writable tasks (3+ steps)
- Research tasks
- Building/creating projects
- Tasks spanning many tool calls
- Anything requiring organization

**Skip for:**
- Simple questions
- Single-file edits
- Quick lookups
- Read-only or no-write tasks

## Templates

Copy these templates to start:

- [templates/task_plan.md](templates/task_plan.md) — Phase tracking
- [templates/findings.md](templates/findings.md) — Research storage
- [templates/progress.md](templates/progress.md) — Session logging

## Scripts

Helper scripts for automation:

- `scripts/init-session.ps1` — Initialize all planning files
- `scripts/check-complete.ps1` — Verify all phases complete
- `scripts/session-catchup.py` — Recover context from previous session (v2.2.0)

## Advanced Topics

- **Local file-planning reference:** See [references/reference.md](references/reference.md)
- **Real Examples:** See [references/examples.md](references/examples.md)

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| Use TodoWrite for persistence | Create task_plan.md file |
| State goals once and forget | Re-read plan before decisions |
| Hide errors and retry silently | Log errors to plan file |
| Stuff everything in context | Store large content in files |
| Start large writable work without orientation | Create or read a plan file first |
| Repeat failed actions | Track attempts, mutate approach |
| Create files in skill directory | Create files in your project |
