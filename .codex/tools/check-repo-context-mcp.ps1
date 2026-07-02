param(
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

$codexRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$root = if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    Split-Path -Parent $codexRoot
} else {
    (Resolve-Path -LiteralPath $ProjectRoot).Path
}
$mcpPath = Join-Path $root ".mcp.json"
$launcher = Join-Path $root ".codex\start-repo-context-mcp.ps1"
$entry = Join-Path $root ".codex\tools\repo-context-mcp.mjs"

$hasEntry = $false
$jsonOk = $false
if (Test-Path -LiteralPath $mcpPath) {
    $json = Get-Content -LiteralPath $mcpPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $jsonOk = $true
    $hasEntry = [bool]$json.mcpServers.'repo-context'
}

$helperExists = (Test-Path -LiteralPath $launcher) -and (Test-Path -LiteralPath $entry)
$active = $jsonOk -and $hasEntry

[pscustomobject]@{
    status = if ($helperExists -and $active) { "PASS" } elseif ($helperExists) { "WARN" } else { "FAIL" }
    name = "repo-context"
    kind = "optional stdio MCP"
    ports = "none"
    projectRoot = $root
    launcherExists = (Test-Path -LiteralPath $launcher)
    entryExists = (Test-Path -LiteralPath $entry)
    mcpJsonOk = $jsonOk
    mcpEntryExists = $hasEntry
    note = if ($active) { "No listening port is expected; Codex starts this MCP over stdio on demand." } else { "Optional helper is present but not active in .mcp.json." }
} | ConvertTo-Json -Depth 4
