---
name: matt-diagnose
description: Use when debugging a failing command, test, build, hook, template, or runtime behavior and you need a disciplined diagnosis loop.
license: MIT
source: mattpocock/skills
---

# Diagnose

Use this skill to debug failures without guessing.

## Loop

1. Capture the exact failure: command, exit code, relevant log lines, and changed files.
2. Classify the failure: environment, dependency, input data, code path, test expectation, or tooling.
3. Form one narrow hypothesis.
4. Run the smallest safe check that can disprove or confirm it.
5. Apply the smallest fix that addresses the confirmed cause.
6. Re-run the original failing check.
7. Record the cause, fix, and follow-up risk.

## Agent Failure Add-On

When the failure is an AI agent or harness problem, also capture:

- repeated tool calls or retry loops,
- context drift away from the real objective,
- stale memory or previous-session facts leaking into the task,
- wrong cwd, branch, file path, service, or environment assumption,
- hidden wrapper, repair, retry, or summarization layer that may have changed the output.

Use this four-part report before retrying:

```markdown
## Agent Failure Capture
- Goal:
- Last successful step:
- Last failed tool / command:
- Repeated pattern:
- Environment assumption to verify:
- Smallest safe recovery action:
```

Prefer one discriminating check over repeated retries. If the issue is in an agent product, wrapper, tool router, memory layer, or hidden repair loop, use `agent-architecture-audit`.

## Safety

- Do not start games, editors, browsers, dev servers, background services, or interactive apps unless the user explicitly approves.
- Do not run destructive git commands, `git bisect`, package installs, or cleanup deletions unless explicitly approved.
- Do not inspect `node_modules`, runtime caches, whole drives, `Managed`, DLLs, or compiled binaries unless the user names them as evidence.
- Use Windows PowerShell 5.1 compatible commands.

## Output

- Symptom
- Evidence
- Hypothesis
- Check performed
- Fix
- Verification
- Remaining risk
