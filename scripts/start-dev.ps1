$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backendScript = Join-Path $PSScriptRoot 'start-backend.ps1'

Set-Location $root

$backendListening = $false
try {
  $probe = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/api/health -TimeoutSec 2
  $backendListening = $probe.StatusCode -eq 200
} catch {
  $backendListening = $false
}

if (-not $backendListening) {
  Start-Process -FilePath powershell.exe `
    -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $backendScript `
    -WorkingDirectory $root `
    -WindowStyle Hidden

  Start-Sleep -Seconds 3
}

& npm.cmd run start
