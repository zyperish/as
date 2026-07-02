$ErrorActionPreference = "Stop"

$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$exporter = Join-Path $projectRoot ".codex\tools\am-local-viewer-export.mjs"
$viewer = Join-Path $projectRoot ".codex\memory\am-viewer\index.html"

if (-not (Test-Path -LiteralPath $exporter)) {
    throw "AM viewer exporter not found: $exporter"
}

& node $exporter --project-root $projectRoot | Out-Host

if (-not (Test-Path -LiteralPath $viewer)) {
    throw "AM viewer was not generated: $viewer"
}

Write-Host ""
Write-Host "AM local viewer generated:"
Write-Host $viewer
Write-Host "Opening local static HTML. No service or port is started."
Start-Process -FilePath $viewer
