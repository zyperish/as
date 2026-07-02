---
name: context-and-adr-planning
description: Use when planning a significant feature, refactor, architecture change, workflow change, or long-running project where terminology and decisions must stay consistent. It sharpens project language, records durable context in CONTEXT.md, and writes tiny ADRs only for hard-to-reverse trade-off decisions.
source: local-original-workflow
license: MIT
---

# Context And ADR Planning

Use this before large plans where confusion in words or hidden decisions would cause rework.

## Local Boundary

This is local workflow guidance only. It does not require any upstream setup,
external tracker, plugin runtime, service, or copied third-party text. It remains
subordinate to system/developer/user instructions, read-only/no-write requests,
and repository rules.

## Workflow

1. Read existing context docs if present:
   - `CONTEXT-MAP.md`
   - root or area-specific `CONTEXT.md`
   - `docs/adr/*.md`
2. Identify ambiguous terms, overloaded words, and project-specific concepts.
3. If code can answer a question, inspect the code instead of asking the user.
4. Ask only unresolved high-value questions, one at a time, and include a recommended answer.
5. Update `CONTEXT.md` only when writes are allowed and a term is resolved and project-specific.
6. Offer an ADR only when all are true:
   - hard to reverse,
   - surprising without context,
   - chosen from real alternatives.

## CONTEXT.md Shape

Keep it a glossary, not a spec:

```md
# Context Name

One or two sentences about this context.

## Language

**Canonical Term**:
One or two sentences defining what it is.
_Avoid_: ambiguous synonym, old name
```

Do not put implementation details, TODOs, or random notes in `CONTEXT.md`.

## ADR Shape

Use `docs/adr/0001-short-slug.md`, incrementing the number:

```md
# Short title

One to three sentences: context, decision, and why.
```

Most ADRs should be small. Add options/consequences only when they add real value.

## Constraints

- Do not create docs just to look busy; create them lazily when there is something durable to record.
- Do not overwrite existing context or ADRs.
- Do not use this for tiny edits.
- Do not publish issues or use external trackers unless the user asks.
