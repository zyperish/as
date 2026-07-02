[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Script,

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

$entry = Join-Path $codexRoot "tools\am-local-hook.mjs"
if (-not (Test-Path -LiteralPath $entry)) { exit 0 }

$node = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $node) { exit 0 }

$env:AGENTMEMORY_PROJECT_ROOT = $projectRoot
$env:AGENTMEMORY_INJECT_CONTEXT = "false"
$env:AGENTMEMORY_AUTO_COMPRESS = "false"
Remove-Item Env:\AGENTMEMORY_URL -ErrorAction SilentlyContinue

$payloadFile = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-am-local-hook-" + [System.Guid]::NewGuid().ToString("N") + ".json")
try {
    [System.IO.File]::WriteAllBytes($payloadFile, $payloadBytes)
    & $node.Source $entry --script $Script --project-root $projectRoot --payload-file $payloadFile | Out-Null
} catch {
} finally {
    Remove-Item -LiteralPath $payloadFile -Force -ErrorAction SilentlyContinue
}

exit 0
}
