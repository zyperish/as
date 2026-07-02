---
name: kb-retriever-lite
description: Use when answering from local knowledge assets, AM memory, project docs, copied third-party notes, or any local knowledge base. It performs source-aware retrieval before answering, prefers indexes and summaries before raw files, keeps context small, and avoids network search unless the user explicitly asks for it.
---

# KB Retriever Lite

Use this when the answer should come from local knowledge rather than memory alone.

## Scope

Look in these sources, in order:

1. AM and conversation context if the request asks what we decided, remembered, or did before.
2. Project-local knowledge: `.codex/knowledge-assets`, `.codex/skills`, `knowledge`, `docs`, `README*`, `data_structure.md`.
3. Root knowledge: `.codex/knowledge-assets`.
4. Tool notes under `tools/<tool>` only when the user named that tool or a knowledge asset points there.

Do not scan the whole drive. Do not browse the web unless the user asks for current external facts or the local source is missing.

## Workflow

1. Identify the question, expected output, and likely source area.
2. Find indexes first: `data_structure.md`, `README*`, `INDEX*`, `manifest*`, `report.json`, `SKILL.md`.
3. Search narrowly with `rg`, using 3-8 precise terms. Prefer file names and headings before broad content search.
4. Read only the matching local sections needed to answer.
5. Answer with source paths and note uncertainty when evidence is incomplete.

## File Type Rules

- Markdown/text: search with `rg`, then read the relevant nearby section.
- JSON: use a parser or targeted `rg`; avoid manual whole-file reasoning for large JSON.
- PDF/DOCX/XLSX/PPTX: use the bundled Documents, Spreadsheets, or Presentations skills when available.
- Images/diagrams: inspect the file only when visual content matters; do not infer unseen details from file names alone.

## Output Standard

Give:

- Direct answer first.
- Sources used, with absolute paths when useful.
- What is missing or unverified.
- Next action only if it follows from the evidence.
