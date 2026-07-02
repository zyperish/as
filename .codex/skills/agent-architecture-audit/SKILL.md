---
name: agent-architecture-audit
description: Use when reviewing an AI agent, LLM wrapper, tool router, memory layer, hidden retry/repair loop, or multi-agent system for correctness risks. Adapted from ECC as a pure local Markdown workflow; no runtime, MCP, hook, port, or dependency is required.
source: affaan-m/ECC skills/agent-architecture-audit
license: MIT
---

# Agent Architecture Audit

Use this for agent systems where the model may be fine but the surrounding wrapper makes behavior worse.

## When to Use

- The same model works in a direct playground but fails inside the app or harness.
- Tools are described in prompts but not enforced by code.
- Old memory, summaries, or previous sessions leak into new tasks.
- A hidden retry, repair, summarization, or fallback layer may be changing answers.
- Tool calls, streaming, Markdown, JSON, or UI rendering produce different output than logs.
- The user reports that an AI agent is looping, drifting, getting worse, or confidently wrong.

## Twelve Layers To Check

| Layer | What Can Break |
| --- | --- |
| System prompt | conflicting instructions, bloated policy, stale role text |
| Session history | irrelevant old turns treated as current facts |
| Long-term memory | polluted memory, old corrections overriding new ones |
| Distillation | compressed notes re-entering as pseudo-facts |
| Active recall | duplicate summaries wasting context or changing priority |
| Tool selection | model can skip required tools or choose the wrong tool |
| Tool execution | tool call is hallucinated, ignored, retried, or not validated |
| Tool interpretation | output is misread, truncated, or treated as stronger evidence than it is |
| Answer shaping | final response changes a correct internal result |
| Platform rendering | API, CLI, streaming, or UI mutates valid output |
| Hidden repair loops | second model pass changes answer without an explicit contract |
| Persistence | cached state, sessions, or generated artifacts reused as live evidence |

## Audit Workflow

1. Define the target agent, user-visible symptom, entrypoint, model stack, tools, memory layers, and recent changes.
2. Gather evidence from code, prompts, tool schemas, logs, memory admission, retry logic, renderers, and persistence.
3. Map each finding to one of the twelve layers.
4. Prefer code-gated fixes over prompt-only fixes.
5. Verify with a focused reproduction or regression check.

## Useful Searches

```powershell
rg -n "must.*tool|required.*tool|必须.*工具|必须.*调用" .
rg -n "tool_call|toolCall|tool_use|function_call" .
rg -n "memory|remember|recall|summary|summarize|distill" .
rg -n "fallback|retry|repair|re-?prompt|second pass" .
rg -n "transform|rewrite|render|stream|markdown|json" .
```

Avoid whole-drive scans. Stay inside the named repo or named evidence paths.

## Severity

| Severity | Meaning |
| --- | --- |
| critical | agent can take wrong operational action or expose sensitive data |
| high | frequent correctness degradation, tool misuse, or memory contamination |
| medium | correctness usually survives but is fragile, slow, or hard to verify |
| low | maintainability or clarity issue with low behavior risk |

## Output

Lead with findings, not praise:

```text
Findings:
- [severity] Layer: evidence path and line. Why it matters.

Architecture diagnosis:
- What layer corrupted behavior and how.

Fix order:
1. Smallest code/config change that enforces the contract.
2. Regression check that proves the behavior.
3. Memory or documentation cleanup if needed.

Residual risk:
- What remains unverified.
```

## Rules

- Do not blame the base model until wrapper, memory, tool, retry, and rendering layers have been checked.
- Do not accept "the prompt says it must" when code does not enforce it.
- Do not let the agent's own monologue become persistent memory without user-correction priority.
- Do not deploy new MCPs, hooks, daemons, dashboards, or services as part of this audit unless the user separately approves.
