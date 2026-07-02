param(
    [string]$ProjectRoot = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
    param([string]$Path, [string]$Value)
    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    $encoding = New-Object System.Text.UTF8Encoding -ArgumentList $false
    [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

$codexRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$root = if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    Split-Path -Parent $codexRoot
} else {
    (Resolve-Path -LiteralPath $ProjectRoot).Path
}

$powerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path -LiteralPath $powerShellExe)) {
    $powerShellExe = "powershell.exe"
}

$codeReviewGraphExe = (Get-Command "code-review-graph" -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if ([string]::IsNullOrWhiteSpace($codeReviewGraphExe)) {
    $codeReviewGraphExe = "code-review-graph"
}

$projectCodex = Join-Path $root ".codex"
if (-not (Test-Path -LiteralPath $projectCodex)) {
    throw "Project root does not contain .codex: $root"
}

$graphIgnoreTemplate = Join-Path $codexRoot "templates\code-review-graph\.code-review-graphignore"
$graphIgnoreTarget = Join-Path $root ".code-review-graphignore"
if ((Test-Path -LiteralPath $graphIgnoreTemplate) -and -not (Test-Path -LiteralPath $graphIgnoreTarget)) {
    Copy-Item -LiteralPath $graphIgnoreTemplate -Destination $graphIgnoreTarget
}

$target = Join-Path $root ".mcp.json"
if ((Test-Path -LiteralPath $target) -and -not $Force) {
    throw ".mcp.json already exists. Re-run with -Force after reviewing it: $target"
}

$json = @{
    mcpServers = @{
        agentmemory = @{
            command = $powerShellExe
            args = @(
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                ".codex\start-agentmemory-mcp.ps1"
            )
            env = @{
                AGENTMEMORY_AUTO_COMPRESS = "false"
                AGENTMEMORY_INJECT_CONTEXT = "false"
            }
        }
        "repo-context" = @{
            command = $powerShellExe
            args = @(
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                ".codex\start-repo-context-mcp.ps1"
            )
            env = @{
                REPO_CONTEXT_PROJECT_ROOT = "."
            }
        }
        "code-review-graph" = @{
            command = $codeReviewGraphExe
            args = @(
                "serve",
                "--repo",
                "."
            )
            env = @{}
        }
    }
} | ConvertTo-Json -Depth 8

Write-Utf8NoBom -Path $target -Value $json

$null = Get-Content -LiteralPath $target -Raw -Encoding UTF8 | ConvertFrom-Json
[pscustomobject]@{
    status = "PASS"
    projectRoot = $root
    written = $target
    note = "Project .mcp.json uses no-port MCP entries for agentmemory, repo-context, and code-review-graph."
} | ConvertTo-Json -Depth 4
