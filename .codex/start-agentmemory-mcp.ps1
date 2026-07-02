param(
    [string]$ProjectRoot = "",
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$McpArgs = @()
)

$ErrorActionPreference = "Stop"

$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom

function Resolve-TemplateProjectRoot {
    param([string]$Requested)

    if (-not [string]::IsNullOrWhiteSpace($Requested)) {
        return (Resolve-Path -LiteralPath $Requested).Path
    }

    if (-not [string]::IsNullOrWhiteSpace($env:AGENTMEMORY_PROJECT_ROOT)) {
        return (Resolve-Path -LiteralPath $env:AGENTMEMORY_PROJECT_ROOT).Path
    }

    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

$projectRoot = Resolve-TemplateProjectRoot -Requested $ProjectRoot
$entry = Join-Path $PSScriptRoot "tools\am-local-mcp.mjs"

if (-not (Test-Path -LiteralPath $entry)) {
    throw "AM local MCP entrypoint is missing: $entry"
}

$env:AGENTMEMORY_PROJECT_ROOT = $projectRoot
$env:AGENTMEMORY_INJECT_CONTEXT = "false"
$env:AGENTMEMORY_AUTO_COMPRESS = "false"
Remove-Item Env:\AGENTMEMORY_URL -ErrorAction SilentlyContinue

& node $entry @McpArgs
