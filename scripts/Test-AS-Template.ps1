param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Test-AMP-Template.ps1') -ProjectRoot $ProjectRoot
