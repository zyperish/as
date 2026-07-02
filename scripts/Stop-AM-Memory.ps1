$ErrorActionPreference = "SilentlyContinue"

Write-Host "AM local memory has no background service to stop."
Write-Host "Checking for old AM REST/viewer listeners on 3111/3112/3113 and stopping only matching legacy processes."

foreach ($port in @(3111, 3112, 3113)) {
    $connections = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    foreach ($connection in $connections) {
        $proc = Get-CimInstance Win32_Process -Filter ("ProcessId=" + [string]$connection.OwningProcess) -ErrorAction SilentlyContinue
        $cmd = [string]$proc.CommandLine
        if ($cmd -match "\\.codex\\agentmemory-runtime" -or $cmd -match "\\.codex\\tools\\agentmemory-viewer-service\\.mjs") {
            Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped legacy AM process pid=$($connection.OwningProcess) on port $port"
        }
    }
}
