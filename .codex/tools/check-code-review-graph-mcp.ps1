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
$ignorePath = Join-Path $root ".code-review-graphignore"
$cmd = Get-Command "code-review-graph" -ErrorAction SilentlyContinue | Select-Object -First 1

$hasEntry = $false
$httpEnabled = $false
$jsonOk = $false
if (Test-Path -LiteralPath $mcpPath) {
    $json = Get-Content -LiteralPath $mcpPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $jsonOk = $true
    $entry = $json.mcpServers.'code-review-graph'
    $hasEntry = [bool]$entry
    if ($entry -and $entry.args) {
        $httpEnabled = @($entry.args) -contains "--http"
    }
}

$port5555 = Get-NetTCPConnection -LocalPort 5555 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1

[pscustomobject]@{
    status = if ($cmd -and $jsonOk -and $hasEntry -and -not $httpEnabled) { "PASS" } elseif ($cmd -and $jsonOk -and -not $httpEnabled) { "WARN" } else { "FAIL" }
    name = "code-review-graph"
    kind = "optional stdio/local MCP"
    ports = "none; optional 5555 only with --http"
    projectRoot = $root
    executable = if ($cmd) { $cmd.Source } else { "missing" }
    ignoreFileExists = (Test-Path -LiteralPath $ignorePath)
    mcpJsonOk = $jsonOk
    mcpEntryExists = $hasEntry
    httpModeEnabled = $httpEnabled
    port5555 = if ($port5555) { "LISTEN pid=$($port5555.OwningProcess)" } else { "DOWN" }
    note = if ($hasEntry) { "HTTP mode is disabled by default to avoid occupying port 5555." } else { "Optional helper is not active in .mcp.json." }
} | ConvertTo-Json -Depth 4
