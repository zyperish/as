# Security Policy

Do not commit:

- AM memory JSONL files
- conversation archives
- preflight approvals or audit logs
- SSH keys, API keys, tokens, passwords, cookies, or server credentials
- Obsidian vault content containing private work history

The template may support local storage of sensitive operational data when a user
explicitly needs that behavior, but those records must stay local and out of
public Git history.

Before changing `.codex/server-tool-policy.json`, run:

```powershell
node --test .codex\hooks\pre_tool_use.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AS-Template.ps1
```
