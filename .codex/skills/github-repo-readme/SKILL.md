---
name: github-repo-readme
description: Use when publishing a project to GitHub, rewriting a repository README, creating a GitHub-ready project landing page, improving open-source documentation, or when the user says the GitHub repo description/readme is poor, generic, unclear, or not project-grade.
---

# GitHub Repo README

Use this before pushing or after publishing a GitHub repository when the README is part of the deliverable.

## Sources

Local adaptation from:

- GitHub Docs, About READMEs: README should explain what the project does, why it is useful, how to get started, where to get help, and who maintains it.
- `github/awesome-copilot` `create-readme`: inspect the project first, keep the README concise, and use GitHub Flavored Markdown.
- `geekjourneyx/readme-generator` and `caopulan/readme_writer`: write for a GitHub visitor, not for the agent's internal work log.

Do not copy upstream text verbatim. Use these as workflow constraints.

## Workflow

1. Inspect the repository before writing: file tree, README/docs, scripts, entrypoints, license, security notes, and verification commands.
2. Identify the audience: end user, developer, template adopter, or maintainer.
3. Rewrite the README as a project landing page, not an internal checklist.
4. Keep internal implementation detail behind concise sections.
5. Add a separate localized README only when useful; the root README must stand alone.
6. Run project verification and Markdown/UTF-8 checks before committing.
7. If already published, push the README fix and verify GitHub shows the new commit.

## Required README Shape

Use this order unless the project type clearly needs a different one:

```markdown
# Project Name

One-sentence value proposition.

Short paragraph explaining who it is for and what problem it solves.

## Why Use It

## Features

## Quick Start

## How It Works

## Safety / Privacy / Limitations

## Repository Layout

## Verification

## Contributing / Maintenance

## License
```

For templates, include what is included, what is intentionally excluded, how to adopt the template, how to verify a clean install, and what must never be committed.

## Quality Bar

- The first screen must explain the project, not just list files.
- Name the concrete value in the first three lines.
- Write for someone arriving from GitHub with no chat context.
- Include copy-paste commands that were verified locally.
- State privacy/security boundaries plainly.
- Link to deeper docs instead of dumping every rule.
- Avoid agent diary language such as "I did", "this task", or "the user asked".
- Avoid vague claims unless backed by features.
- Do not expose private paths, credentials, tokens, Obsidian notes, local AM JSONL, or chat history.

## Validation

Before finalizing:

- `git status --short --branch`
- repository self-test, if available
- scan README for private local paths and credentials
- UTF-8 readback for Chinese Markdown
- `git diff -- README*`
- after push: `git ls-remote --heads origin <branch>`

If verification is partial, state the exact missing check.
