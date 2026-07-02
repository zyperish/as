param(
    [Parameter(Mandatory = $true)]
    [string]$Command,

    [Parameter(Mandatory = $true)]
    [string]$Target,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedEffect,

    [Parameter(Mandatory = $true)]
    [string]$BlastRadius,

    [Parameter(Mandatory = $true)]
    [string]$FailureModes,

    [Parameter(Mandatory = $true)]
    [string]$Rollback,

    [Parameter(Mandatory = $true)]
    [string]$HealthChecks,

    [Parameter(Mandatory = $true)]
    [switch]$ApprovedByUser,

    [int]$TtlMinutes = 30,

    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::OutputEncoding = $utf8NoBom

function Get-CommandHash {
    param([string]$Value)
    $normalized = $Value.Replace("`r`n", "`n").Trim()
    $bytes = $utf8NoBom.GetBytes($normalized)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $sha.Dispose()
    }
}

function Assert-Meaningful {
    param([string]$Name, [string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Trim().Length -lt 8) {
        throw "$Name is too short; write a concrete preflight field."
    }
}

Assert-Meaningful 'Target' $Target
Assert-Meaningful 'ExpectedEffect' $ExpectedEffect
Assert-Meaningful 'BlastRadius' $BlastRadius
Assert-Meaningful 'FailureModes' $FailureModes
Assert-Meaningful 'Rollback' $Rollback
Assert-Meaningful 'HealthChecks' $HealthChecks

if ($TtlMinutes -lt 1 -or $TtlMinutes -gt 120) {
    throw 'TtlMinutes must be between 1 and 120.'
}

$commandHash = Get-CommandHash $Command
$approvalDir = Join-Path $ProjectRoot '.codex\server-preflight\approvals'
New-Item -ItemType Directory -Force -Path $approvalDir | Out-Null

$now = [DateTimeOffset]::UtcNow
$approval = [ordered]@{
    version = 1
    command = $Command.Replace("`r`n", "`n").Trim()
    commandHash = $commandHash
    target = $Target
    expectedEffect = $ExpectedEffect
    blastRadius = $BlastRadius
    failureModes = $FailureModes
    rollback = $Rollback
    healthChecks = $HealthChecks
    approved = $true
    approvedByUser = $true
    used = $false
    createdAt = $now.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    expiresAt = $now.AddMinutes($TtlMinutes).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
}

$path = Join-Path $approvalDir "$commandHash.json"
$json = $approval | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($path, $json + [Environment]::NewLine, $utf8NoBom)

Write-Output "Server preflight approval created."
Write-Output "Command hash: $commandHash"
Write-Output "Approval file: $path"
Write-Output "Expires at UTC: $($approval.expiresAt)"
Write-Output "This approval is exact-command and one-use only. It does not execute the command."
