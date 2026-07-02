param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$script = Join-Path $PSScriptRoot 'start-agentmemory-mcp.ps1'
& $script -ProjectRoot $ProjectRoot
