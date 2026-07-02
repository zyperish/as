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

    if (-not [string]::IsNullOrWhiteSpace($env:REPO_CONTEXT_PROJECT_ROOT)) {
        return (Resolve-Path -LiteralPath $env:REPO_CONTEXT_PROJECT_ROOT).Path
    }

    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

$projectRoot = Resolve-TemplateProjectRoot -Requested $ProjectRoot
$entry = Join-Path $PSScriptRoot "tools\repo-context-mcp.mjs"

if (-not (Test-Path -LiteralPath $entry)) {
    throw "repo-context MCP entrypoint is missing: $entry"
}

$env:REPO_CONTEXT_PROJECT_ROOT = $projectRoot
& node $entry @McpArgs