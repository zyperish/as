# AI Read This First

This reusable template is now scoped to local memory, coding, planning, review, and handoff. Keep it small, local-first, and no-port by default.

## Read-Only / No-Write Override

If the current user message or a higher-priority instruction says read-only, no-write, audit only, do not edit files, or do not save records, that instruction overrides AM writeback, Obsidian writing, planning-file creation, and stop-hook closeout intent for this turn. Allowed AM actions are only `status`, `start`, and bounded `recall`. Do not run `stage`, `finish`, `reflect`, `remember`, `memory_consolidate`, `memory_reflect`, viewer/static export, archive promotion, or Obsidian writes unless the user later explicitly authorizes writing.

## AM Highest Priority

AM has the highest operational priority, but the default path must stay lean. Use the compact hook context for small/direct turns, and run explicit AM-first commands only when the task is non-trivial, project-changing, or asks for memory/history:

## CCOW Gate

- Non-small work must run the `ccow-lw-orchestration` workflow before implementation: project edits, debugging, deployment, audits, planning, AM/rule changes, multi-file analysis, and user requests that mention CCOW/LW/W/TW.
- At kickoff, declare the WT/LW/W-lane split and TW/subagent usage, or explicitly state why the task is small enough to skip CCOW.
- CCOW is not satisfied by declaration alone: independent same-phase lanes must be spawned before waiting, and the main thread must do non-overlapping coordinator work while they run.
- If no true parallelism or independent worker output happened, label the run `CCOW degraded` or `nominal CCOW`, not full/effective CCOW.
- If subagent spawning is unavailable or not allowed, record that limit and compensate with local parallel evidence lanes; do not call sequential work full CCOW.
- End non-small work with a compact final workflow pack: goal, LW split, W lanes/TW ids, spawn id/order/time, first wait after all spawned, wait order, coordinator work while workers ran, parallelism, files changed, commands, evidence, review findings, risks, effective/degraded verdict, and agent lifecycle.
- Without a final workflow pack and closed-or-retained lifecycle evidence for temporary LW/subagents, the verdict cannot be effective CCOW.
- Spawn subagents only when the current task explicitly needs CCOW/subagents/delegation/parallel agent work. Register every spawned id and close it after integration. If the user is complaining about too many subagents, do not create more; run local degraded diagnosis and report tool limitations.

## AM Workflow

For non-trivial work, after the CCOW gate:

1. Start with `node .codex\tools\am-first.mjs start --project-root . --query "<current task>"`.
2. After each meaningful phase, run `node .codex\tools\am-first.mjs stage --project-root . --summary "<what changed, evidence, next step>"`.
3. Before stopping, run `node .codex\tools\am-first.mjs finish --project-root . --summary "<final outcome and verification>"` or `node .codex\tools\am-first.mjs reflect --project-root . --summary "<reusable lesson>"`.
4. If AM recall is unavailable, say so clearly and continue with local evidence; do not pretend memory was read.

When goal mode is active or the user asks to use/continue a goal, open AM goal context before acting:

1. Run `node .codex\tools\am-first.mjs start --project-root . --goal --query "<current goal/task>"`.
2. Before and after each substantive action, check whether the action still advances the active goal.
3. Record each substantive action with `node .codex\tools\am-first.mjs stage --project-root . --summary "<action, evidence, next step, goal alignment check>"`.
4. Stop or re-plan instead of continuing if the next action does not clearly advance the goal.

If the user explicitly asks for read-only audit, no file changes, or no writes, follow the Read-Only / No-Write Override above. Use AM-first `start` for context; use `stage` only when writes are allowed.

The Stop hook archives the conversation and runs local AM closeout automatically unless the current turn is explicitly read-only/no-write. Small direct answers should not run extra AM commands unless the compact context is missing or the user asks for memory/history. Anything involving code, planning, project audit, deployment, debugging, modeling, subagents, or durable user preference changes should still use AM-first start/stage explicitly when writes are allowed.

AM-first `status` and `start` are read-only context commands. `finish` and `reflect` save the explicit summary/reflection by default; they do not promote latest-archive derived memories unless `--promote-archives` or `--force` is explicitly used after secret scanning. Automatic hooks such as stop and pre-compact also must not create `conversation_summary` or `consolidated_memory` by default.

## Required First Step

Before responding to each user prompt:

1. Use the controlled compact hook output first.
2. Run a Skill Gate mentally before acting: use required skills by task type even if the user did not name them.
3. If the hook says `SKILL GATE`, follow it and read the listed skills before implementation.
4. If the hook says `CCOW REQUIRED`, use `ccow-lw-orchestration` before implementation.
5. Do not reread this whole file or run broad AM recall for tiny/direct replies.
6. For non-trivial work, run AM-first start and use only the compact context pack.
7. Use only relevant summaries; do not dump the full memory store or recent archives into context.
8. If AM recall is unavailable and continuity matters, say so clearly.
9. After completed responses, rely on the Stop hook archive/AM closeout; when stopping manually after major work, run `finish` or `reflect` yourself unless the task is explicitly read-only/no-write.
10. For debugging/investigation tasks, only use memories whose project/domain matches the current task. Do not follow old active goals, goal lessons, archives, or project docs such as example-game/example-world unless the user asks to continue that project or the current query explicitly names that domain.

## User Intent

- The user wants long-term AI memory stored locally.
- The user wants full conversations archived first, with summaries, facts, lessons, and project state derived from those archives.
- The user wants coding, debugging, review, planning, handoff, and reflection skills preserved.
- The user does not want default MCP services that occupy HTTP ports.
- The user wants non-core projects and graphical backends out of the active reusable template.
- The user wants AI problem tracking, absorption summaries, and AM improvement summaries written into Obsidian with a consistent five-part structure.

## Obsidian AI Record Rule

- Use `obsidian-am-issue-writer` whenever the user reports an AI problem, asks to solve or record an issue, asks for Obsidian AI records, asks to absorb/summarize a third-party project, or asks to summarize AM memories into improvement points.
- The required Obsidian structure has five parts: `AI问题清单.md`, `AI问题解决记录列表.md`, `AI问题解决记录/`, `吸纳项目总结/`, and `AM进步点总结/`.
- Do not mark an issue checked until the solution record, index update, and verification are complete.
- If this was forgotten earlier in the turn, recover by writing the missing Obsidian record and note the omission and fix in the record.

## Safety Rules

- Do not permanently delete files. Archive first and list what moved.
- Do not scan whole drives. Stay inside the project root and named evidence paths.
- Before any important modification, deployment, restart, infrastructure change, auth change, remote server change, database mutation, nginx/docker/systemd change, or other potentially user-impacting action, do a preflight simulation first: state the exact target, expected effect, blast radius, failure modes, rollback path, health checks, and what would prove success. If you cannot explain those clearly, stop and reduce the risk before acting.
- Do not run `git add`, `git commit`, `git push`, `git reset`, or destructive checkout unless explicitly authorized.
- Do not install packages, start background services, start dashboards, or open interactive apps unless explicitly authorized.
- Do not pollute the template with logs, reports, memory data, caches, `__pycache__`, `node_modules`, generated assets, or runtime output.
- Use Windows PowerShell 5.1 compatible syntax.
- Chinese Markdown, Obsidian records, Skill files, and rule files must be saved as UTF-8. Prefer `apply_patch`; do not use default-encoding `Set-Content`, `Out-File`, `Add-Content`, `>` or `>>` for Chinese text.
- Read and verify Chinese docs with explicit UTF-8 too: PowerShell must use `Get-Content -Encoding UTF8`; default PowerShell mojibake is not proof the file is corrupt until UTF-8 or byte-level checks confirm it.
- Do not pipe Chinese here-strings, JSON, or Markdown through PowerShell into Node/AM. Use `apply_patch`, `--payload-file`, Node `fs.writeFile(..., 'utf8')`, or .NET UTF8 APIs.
- Before checkoff, read changed docs with UTF-8 and scan for three consecutive question marks, replacement character `U+FFFD`, and common mojibake fragments. Policy mentions of the word `mojibake` alone are not failures.
- Keep edits scoped to the request and preserve user changes.
- If unclear, ask or write the ambiguity; do not guess silently.

## Active MCP Policy

- Active MCP entries must use stdio or local file access only.
- The base `.mcp.json` enables only `agentmemory` by default.
- `agentmemory` is AM local memory. It must not require `3111`, `3112`, `3113`, REST, runtime, viewer, or health pages.
- `repo-context` is an optional stdio MCP for local project context; install it per project before claiming it is active.
- `code-review-graph` is an optional stdio/local query tool. Do not enable HTTP mode unless the user explicitly asks.
- No active `ccow`, `ralph`, `ccp`, `blender`, dashboard, viewer, or graphical backend MCP entries belong in the base template.

## AM Memory Rules

- Save complete readable conversations under `.codex\conversation-archive\<channel>\conversation-1.md` through `conversation-5.md`.
- Store durable AM records under `.codex\memory\am`.
- Use `.codex\tools\am-first.mjs` as the normal command entry for AM status, start, stage, finish, reflection, and static viewer export.
- In goal mode, `am-first start --goal` must be run before action, and `am-first stage` must be used as the checkpoint after each substantive action so the active goal timeline records actions, evidence, next steps, and goal alignment checks.
- Memory layers are episodic, semantic, procedural, and diagnostic.
- Save user preferences, durable decisions, fixes, project state, reusable lessons, and handoffs.
- Local AM may store sensitive operational data when the user explicitly wants durable storage or the task cannot proceed without it, including server credentials, SSH material, ports, and account details. Keep it local, minimal, structured, and easy to retrieve; do not spread those values into Obsidian, reusable skills, templates, or broad archive-derived promoted memories unless the user explicitly asks.
- AM is not a temporary clipboard. Do not write one-turn retrieval context, raw worker output, temporary prompts, or cache payloads into long-term AM. If a temporary memory is created for the current turn, tombstone it with `am-local-store.mjs forget --id <memory-id>` after use and verify recall no longer returns it. Do not auto-delete durable preferences, project facts, deployment decisions, reusable lessons, handoffs, or user-approved sensitive operational data.
- Keep raw archives; summaries and reflections are derived, not replacements.
- Stop/pre-compact and other automatic hooks must not promote conversation archives into new `conversation_summary` or `consolidated_memory` records by default. Archive-derived promotion requires explicit maintenance intent plus dedupe and safety checks.
- New prompt context is controlled by `.codex\hooks\read-rules-and-memory.ps1`, defaulting to `-Fast -Limit 0`; run explicit AM recall only when memory/history matters.
- Keep `AGENTMEMORY_INJECT_CONTEXT=false` to avoid duplicate uncontrolled injection.
- Treat active goals, goal lessons, recent archives, and project-specific memories as opt-in context. They must not steer unrelated troubleshooting into old project documents; current user task domain wins.
- Do not add separate health ports. Validate by stdio MCP calls, local store checks, and hook output.

## Coding And Planning Rules

- Use `skill-trigger-gate` before non-trivial work to decide which skills apply even when the user did not explicitly mention them.
- Use `file-reading-optimizer` before broad reads or unfamiliar codebase work.
- Use `code-review-graph` for dependency, impact, architecture, and review-risk analysis.
- Use `matt-diagnose` for failing commands, hooks, tests, or runtime behavior.
- Use `matt-tdd` for testable behavior changes.
- Use `matt-zoom-out` for architecture context.
- Use `matt-handoff` for interruptions and continuation notes.
- Use `karpathy-guidelines` and `superpowers-lite` for disciplined implementation.
- For important operational changes, write a short preflight checklist before execution: target, current state, intended change, dependency checks, rollback command/path, and post-change verification. Do not treat “I think it will be fine” as sufficient evidence.
- Keep planning skills such as `planning-with-files`, `prd`, `prompt-optimizer-lite`, and local planning workflows.
- For video, promo video, product demo video, voiceover-to-video, recording-to-final-video, or Remotion tasks, recall AM concept `video-skill-workflow` first. Use `web-video-presentation` as the primary workflow; use `remotion-best-practices` when Remotion, React video composition, timeline animation, captions, audio, transitions, or rendering are involved. For visual direction, pair with `web-design-engineer` or existing frontend design guidance. Do not hand-roll a one-off Canvas video generator as the default path; start with `script.md` + `outline.md`, then ask the user to confirm theme, assets, and development mode.

## Answer Style

- Be direct and simple.
- Prefer short summaries.
- Explain risks plainly.
- Do not bury the conclusion.
