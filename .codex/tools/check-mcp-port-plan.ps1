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

function Get-PortStatus {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) { return "DOWN" }
    $proc = Get-CimInstance Win32_Process -Filter ("ProcessId=" + [string]$conn.OwningProcess) -ErrorAction SilentlyContinue
    return "LISTEN pid=$($conn.OwningProcess) $($proc.Name)"
}

$mcpPath = Join-Path $root ".mcp.json"
$mcpNames = @()
if (Test-Path -LiteralPath $mcpPath) {
    $mcpJson = Get-Content -LiteralPath $mcpPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $mcpNames = @($mcpJson.mcpServers.PSObject.Properties.Name)
}

$rows = @(
    [pscustomobject]@{ Name = "agentmemory"; Kind = "stdio MCP + local AM store"; Ports = "none"; Status = "3111=$(Get-PortStatus -Port 3111); 3112=$(Get-PortStatus -Port 3112); 3113=$(Get-PortStatus -Port 3113)"; InMcpJson = ($mcpNames -contains "agentmemory") },
    [pscustomobject]@{ Name = "repo-context"; Kind = "stdio MCP"; Ports = "none"; Status = "no listener expected"; InMcpJson = ($mcpNames -contains "repo-context") },
    [pscustomobject]@{ Name = "code-review-graph"; Kind = "stdio/local MCP"; Ports = "none"; Status = "5555=$(Get-PortStatus -Port 5555)"; InMcpJson = ($mcpNames -contains "code-review-graph") },
    [pscustomobject]@{ Name = "removed graphical/service ports"; Kind = "must be absent"; Ports = "8787,8788,9876"; Status = "8787=$(Get-PortStatus -Port 8787); 8788=$(Get-PortStatus -Port 8788); 9876=$(Get-PortStatus -Port 9876)"; InMcpJson = (($mcpNames -contains "ccow") -or ($mcpNames -contains "ralph") -or ($mcpNames -contains "blender")) }
)

Write-Host "No-port MCP plan for: $root"
Write-Host "Config: $mcpPath"
$rows | Format-Table -AutoSize

$badNames = @("ccow", "ralph", "ccp", "blender") | Where-Object { $mcpNames -contains $_ }
if ($badNames.Count -gt 0) {
    throw "FAIL: active .mcp.json still contains removed entries: $($badNames -join ', ')"
}

$badPorts = @()
foreach ($port in @(3111, 3112, 3113, 5555, 8787, 8788, 9876)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { $badPorts += "$port pid=$($conn.OwningProcess)" }
}
if ($badPorts.Count -gt 0) {
    throw "FAIL: no-port template check found listeners: $($badPorts -join '; ')"
}

Write-Host "PASS: active MCP entries are no-port and removed service ports are not listening."
