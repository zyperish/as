---
name: prototype-first
description: Use when a design, state model, data shape, or UI direction is unclear and a disposable prototype would answer the question faster than a full implementation. Adapted from mattpocock/skills prototype as a pure local Markdown workflow.
source: mattpocock/skills skills/engineering/prototype
license: MIT
---

# Prototype First

Use this when the work is still uncertain and a throwaway prototype can answer one concrete question before production code is written.

## Choose The Prototype Shape

Pick the question first:

- Logic/state question -> build a tiny interactive terminal or script prototype.
- UI/layout question -> build several visibly different variants on an existing route when possible.
- Ambiguous question -> state your assumption, then choose the branch that matches the surrounding code.

## Rules

- The prototype is throwaway from day one. Name files/routes so this is obvious.
- Answer one question. Do not grow the prototype into a product.
- Use the project's existing runtime and task runner; do not add a package manager or dependency just for the prototype.
- Keep state in memory unless persistence is the question being tested.
- Surface the state after each action or variant switch so the user can inspect what changed.
- Provide one command or URL to run it.
- When the question is answered, delete the prototype or fold only the validated decision into real code.

## Logic Prototype

Use this for business rules, reducers, state machines, data shapes, or API feel.

1. Write the question at the top of the prototype or in a nearby `NOTES.md`.
2. Isolate the useful logic behind a small pure interface: reducer, state machine, pure functions, or small module.
3. Keep the terminal/UI shell thin and disposable.
4. Render or print the full relevant state after every action.
5. Capture the answer before deleting or absorbing the prototype.

Anti-patterns:

- wiring to production databases,
- adding tests for throwaway shell code,
- generalizing for future possibilities,
- mixing terminal prompts and core logic in the same function.

## UI Prototype

Use this when the user needs to compare layout or interaction directions.

1. Prefer an existing page/route with real surrounding app context.
2. Default to 3 variants; cap at 5.
3. Variants must differ in structure and information hierarchy, not just colors or copy.
4. Switch variants with a URL param or obvious local toggle.
5. Keep mutations stubbed or read-only unless mutation behavior is the question.
6. Hide or remove prototype switchers before production.
7. Record the winning direction and delete losing variants.

## Output

When handing the prototype back, include:

- the exact question it answers,
- the command or URL,
- what is intentionally fake or stubbed,
- how to decide whether the prototype succeeded,
- cleanup path: delete, absorb, or keep briefly with a deadline.

