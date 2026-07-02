# Publishing Checklist

## Required

- `README.md` explains install, usage, safety, and verification.
- `LICENSE` exists.
- `SECURITY.md` exists.
- `.gitignore` excludes private runtime data.
- `.mcp.json` uses relative/local commands, not user-specific absolute paths.
- No `.jsonl` memory data is committed.
- No conversation archive is committed.
- No approvals or audit logs are committed.
- No SSH keys, passwords, tokens, server IP/account records, cookies, or private Obsidian notes are committed.

## Commands

```powershell
node --test .codex\hooks\pre_tool_use.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AS-Template.ps1
```

## Manual Review

- Review `THIRD_PARTY_NOTICES.md`.
- Check every `.codex/skills/*/SKILL.md` for source/license/local-boundary metadata.
- Search for absolute local paths and private project names.
- Run a secret scanner if available.
