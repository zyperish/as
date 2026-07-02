$ErrorActionPreference = "Stop"

$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Write-Host "AM local memory uses stdio MCP and local files. No background service is started."
Write-Host "- Codex starts .codex\start-agentmemory-mcp.ps1 on demand"
Write-Host "- data: .codex\memory\am and .codex\conversation-archive"
Write-Host "- view memory: run .\scripts\View-AM-Memory.ps1"
Write-Host "- ports: none"

& node (Join-Path $projectRoot ".codex\tools\am-local-store.mjs") --project-root $projectRoot diagnose
