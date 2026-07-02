$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Write-Host "Checking AM local memory MCP."
Write-Host "- stdio MCP entry: .codex\start-agentmemory-mcp.ps1"
Write-Host "- no REST/runtime/viewer ports"
Write-Host "- local store: .codex\memory\am"

& node (Join-Path $projectRoot ".codex\tools\am-local-store.mjs") --project-root $projectRoot diagnose

$listening = @()
foreach ($port in @(3111, 3112, 3113)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { $listening += "$port pid=$($conn.OwningProcess)" }
}

if ($listening.Count -gt 0) {
    throw "FAIL: old AM ports still listening: $($listening -join '; ')"
}

Write-Host "PASS: AM local stdio/no-port configuration is active."
