[CmdletBinding()]
param(
    [string]$Channel = "desktop",
    [string]$Mode = "archive",

    [Parameter(ValueFromPipeline = $true)]
    [AllowNull()]
    [object]$InputObject
)

begin {
    $script:PipelineItems = New-Object System.Collections.Generic.List[string]
}

process {
    if ($null -ne $InputObject) {
        [void]$script:PipelineItems.Add([string]$InputObject)
    }
}

end {

$ErrorActionPreference = "SilentlyContinue"

$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom

$codexRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $codexRoot
$stdin = [Console]::OpenStandardInput()
$buffer = New-Object byte[] 8192
$memory = New-Object System.IO.MemoryStream
try {
    while (($read = $stdin.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $memory.Write($buffer, 0, $read)
    }
    $payloadBytes = $memory.ToArray()
} finally {
    $memory.Dispose()
}
$payloadText = $utf8NoBom.GetString($payloadBytes)
if ($payloadBytes.Length -eq 0 -or [string]::IsNullOrWhiteSpace($payloadText)) {
    if ($script:PipelineItems.Count -gt 0) {
        $payloadText = ($script:PipelineItems | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        $payloadBytes = $utf8NoBom.GetBytes($payloadText)
    }
}

try {
    if (-not [string]::IsNullOrWhiteSpace($payloadText)) {
        $payload = $payloadText | ConvertFrom-Json
        if ($payload.cwd -and (Test-Path -LiteralPath ([string]$payload.cwd))) {
            $projectRoot = (Resolve-Path -LiteralPath ([string]$payload.cwd)).Path
        }
    }
} catch {
}

$scriptPath = Join-Path $PSScriptRoot "archive-conversation.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) { exit 0 }

$runnerPath = Join-Path $PSScriptRoot "run-node-with-utf8-stdin.mjs"
if (-not (Test-Path -LiteralPath $runnerPath)) { exit 0 }

$node = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $node) { exit 0 }

$env:AGENTMEMORY_PROJECT_ROOT = $projectRoot
Remove-Item Env:\AGENTMEMORY_URL -ErrorAction SilentlyContinue

$payloadFile = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-archive-hook-" + [System.Guid]::NewGuid().ToString("N") + ".json")
try {
    [System.IO.File]::WriteAllBytes($payloadFile, $payloadBytes)
    & $node.Source $runnerPath --payload-file $payloadFile -- $scriptPath --channel $Channel --project-root $projectRoot --mode $Mode
} catch {
} finally {
    Remove-Item -LiteralPath $payloadFile -Force -ErrorAction SilentlyContinue
}

exit 0
}
