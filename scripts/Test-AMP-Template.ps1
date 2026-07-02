param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::OutputEncoding = $utf8NoBom

$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param([string]$Name, [bool]$Pass, [string]$Detail)
    [void]$results.Add([pscustomobject]@{ name = $Name; pass = $Pass; detail = $Detail })
}

function Invoke-Check {
    param([string]$Name, [scriptblock]$Body)
    try {
        & $Body
    } catch {
        Add-Result $Name $false $_.Exception.Message
    }
}

function Read-Utf8Strict {
    param([string]$Path)
    $strict = New-Object System.Text.UTF8Encoding -ArgumentList $false, $true
    return $strict.GetString([System.IO.File]::ReadAllBytes($Path))
}

function Test-CleanText {
    param([string]$Text)
    $mojibakeFragments = @(
        ([string]([char]0x00ef) + [string]([char]0x00bf) + [string]([char]0x00bd)),
        ([string]([char]0x00e9) + [string]([char]0x2014) + [string]([char]0x00ae)),
        ([string]([char]0x00e9) + [string]([char]0x2014) + [string]([char]0x00a8)),
        ([string]([char]0x00e7) + [string]([char]0x161) + [string]([char]0x201d)),
        ([string]([char]0x95c2)),
        ([string]([char]0x7459)),
        ([string]([char]0x951b) + '?'),
        ([string]([char]0x951b) + [string]([char]0xfffd))
    )
    foreach ($fragment in $mojibakeFragments) {
        if ($Text.Contains($fragment)) { return $false }
    }
    $question = [string]([char]0x3f)
    $tripleQuestion = $question + $question + $question
    return (-not $Text.Contains([char]0xfffd)) -and (-not $Text.Contains($tripleQuestion))
}

Push-Location $ProjectRoot
try {
    Invoke-Check 'node syntax am-local-store' {
        node --check .codex\tools\am-local-store.mjs | Out-Null
        Add-Result 'node syntax am-local-store' ($LASTEXITCODE -eq 0) 'node --check'
    }
    Invoke-Check 'node syntax am-first' {
        node --check .codex\tools\am-first.mjs | Out-Null
        Add-Result 'node syntax am-first' ($LASTEXITCODE -eq 0) 'node --check'
    }
    Invoke-Check 'pre-tool tests' {
        node --test .codex\hooks\pre_tool_use.test.mjs | Out-Null
        Add-Result 'pre-tool tests' ($LASTEXITCODE -eq 0) 'node --test .codex\hooks\pre_tool_use.test.mjs'
    }
    Invoke-Check 'am status' {
        $out = node .codex\tools\am-first.mjs status --project-root .
        $json = $out | Out-String | ConvertFrom-Json
        Add-Result 'am status' ($json.ok -eq $true -and $json.portsRequired -eq $false) 'am-first status'
    }
    Invoke-Check 'private runtime files absent' {
        $private = @(Get-ChildItem -Recurse -Force -File .codex\memory,.codex\conversation-archive,.codex\server-preflight -ErrorAction SilentlyContinue)
        Add-Result 'private runtime files absent' ($private.Count -eq 0) "files=$($private.Count)"
    }
    Invoke-Check 'optional mcp helper files present' {
        $required = @(
            '.codex\start-repo-context-mcp.ps1',
            '.codex\tools\repo-context-mcp.mjs',
            '.codex\templates\code-review-graph\.code-review-graphignore'
        )
        $missing = @($required | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
        Add-Result 'optional mcp helper files present' ($missing.Count -eq 0) "missing=$($missing -join ',')"
    }
    Invoke-Check 'gitignore runtime dirs' {
        $gitignore = Read-Utf8Strict (Join-Path $ProjectRoot '.gitignore')
        $patterns = @(
            '.codex/memory/**',
            '.codex/repo-context/**',
            '.codex/ai-chatroom/**',
            '.codex/ccow-cache-pool/**',
            '.code-review-graph/'
        )
        $missing = @($patterns | Where-Object { -not $gitignore.Contains($_) })
        Add-Result 'gitignore runtime dirs' ($missing.Count -eq 0) "missing=$($missing -join ',')"
    }
    Invoke-Check 'docs avoid missing test refs' {
        $bad = @()
        foreach ($file in Get-ChildItem -Recurse -Force -File -Include '*.md') {
            $text = Read-Utf8Strict $file.FullName
            if ($text.Contains('Test-AI-System-Readiness.ps1') -or $text.Contains('am-local-store.test.mjs') -or $text.Contains('am-first.test.mjs')) {
                $bad += $file.FullName
            }
        }
        Add-Result 'docs avoid missing test refs' ($bad.Count -eq 0) "bad=$($bad.Count)"
    }
    Invoke-Check 'utf8 clean docs' {
        $bad = @()
        foreach ($file in Get-ChildItem -Recurse -Force -File -Include '*.md','*.json','*.mjs','*.ps1','*.py') {
            $text = Read-Utf8Strict $file.FullName
            if (-not (Test-CleanText $text)) { $bad += $file.FullName }
        }
        Add-Result 'utf8 clean docs' ($bad.Count -eq 0) "bad=$($bad.Count)"
    }
} finally {
    Pop-Location
}

$failed = @($results | Where-Object { -not $_.pass })
[pscustomobject]@{
    ok = ($failed.Count -eq 0)
    failed = $failed
    results = $results
} | ConvertTo-Json -Depth 5
if ($failed.Count -gt 0) { exit 1 }
