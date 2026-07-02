param(
    [Parameter(Mandatory = $true)]
    [string]$Hook
)

$ErrorActionPreference = "Stop"
$script:FailClosed = ([System.IO.Path]::GetFileName($Hook) -ieq "pre_tool_use.py")

function Emit-Block {
    param([string]$Reason)
    if (-not $script:FailClosed) {
        return
    }
    $payload = @{
        decision = "block"
        reason = "Hook runner failed closed: $Reason"
    } | ConvertTo-Json -Compress
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding -ArgumentList $false
    Write-Output $payload
}

$hookPath = Join-Path $PSScriptRoot $Hook
if (-not (Test-Path -LiteralPath $hookPath)) {
    Emit-Block "missing hook file $Hook"
    exit 0
}

$payloadText = [Console]::In.ReadToEnd()
$python = Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1
$usesPyLauncher = $false
if (-not $python) {
    $python = Get-Command py -ErrorAction SilentlyContinue | Select-Object -First 1
    $usesPyLauncher = $true
}
if (-not $python) {
    Emit-Block "python executable not found"
    exit 0
}

$payloadFile = $null
try {
    if (-not [string]::IsNullOrWhiteSpace($payloadText)) {
        $payloadFile = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-hook-payload-" + [System.Guid]::NewGuid().ToString("N") + ".json")
        $utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
        [System.IO.File]::WriteAllText($payloadFile, $payloadText, $utf8NoBom)
        $env:CODEX_HOOK_PAYLOAD_FILE = $payloadFile
    }

    if ($usesPyLauncher) {
        $hookOutput = @(& $python.Source -3 $hookPath)
    } else {
        $hookOutput = @(& $python.Source $hookPath)
    }
    if ($LASTEXITCODE -ne 0) {
        Emit-Block "python hook exited with code $LASTEXITCODE"
    } elseif ($hookOutput.Count -gt 0) {
        $hookOutput | Write-Output
    }
} catch {
    Emit-Block $_.Exception.Message
} finally {
    if ($payloadFile) {
        Remove-Item -LiteralPath $payloadFile -Force -ErrorAction SilentlyContinue
        Remove-Item Env:\CODEX_HOOK_PAYLOAD_FILE -ErrorAction SilentlyContinue
    }
}

exit 0
