---
name: prompt-optimizer-lite
description: Use when improving a prompt locally without deploying a prompt optimizer app, service, API-key workflow, or external dependency.
source: local-original-workflow
license: MIT
---

# Prompt Optimizer Lite

Use this skill to improve a prompt while keeping everything local and simple.

## Process

1. Preserve the original prompt.
2. Identify the prompt's job, audience, constraints, inputs, output format, and failure modes.
3. Remove ambiguity and conflicting instructions.
4. Add only necessary structure: role, task, context, constraints, output format, and verification criteria.
5. Produce an optimized version.
6. Compare original vs optimized against a small test case.
7. Keep the better version and record why.

## Output

- Original intent
- Problems found
- Optimized prompt
- Test case
- Expected improvement

## Safety

- Do not call external models or prompt services unless explicitly approved.
- Do not add API keys, cloud dependencies, Docker, MCP services, browser extensions, desktop apps, or package installs.
- Do not copy external prompt-optimizer source, package files, assets, or application text into this template.
