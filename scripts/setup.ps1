# One-time dependency install that NEVER blocks your terminal.
# The npm registry on this machine answers 7-17s per metadata request, so a
# foreground `npm install` looks like a hang. This runs it detached with a log.
#
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -Status
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -Minimal   # API only, ~6 packages

param(
  [switch]$Status,
  [switch]$Minimal
)

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:LOCALAPPDATA 'Temp\opencode'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$tag = if ($Minimal) { 'minimal' } else { 'full' }
$log = Join-Path $logDir "npm-install-$tag.log"
$err = "$log.err"

function Show-Status {
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*npm*install*' }
  if ($procs) {
    Write-Host "install RUNNING (pid $($procs.ProcessId -join ','))" -ForegroundColor Yellow
  } else {
    Write-Host "install not running" -ForegroundColor DarkGray
  }
  if (Test-Path (Join-Path $root 'node_modules')) {
    $count = (Get-ChildItem (Join-Path $root 'node_modules') -Force | Measure-Object).Count
    Write-Host "node_modules entries: $count" -ForegroundColor DarkGray
  }
  if (Test-Path $log) { Write-Host "--- log tail ---"; Get-Content $log -Tail 12 }
  if ((Test-Path $err) -and (Get-Item $err).Length -gt 0) { Write-Host "--- stderr ---"; Get-Content $err -Tail 12 }
}

if ($Status) { Show-Status; exit 0 }

Remove-Item $log, $err -ErrorAction SilentlyContinue
$args = @('install', '--no-audit', '--no-fund', '--progress=false', '--prefer-offline')
if ($Minimal) { $args += @('--workspaces=false', 'fastify@^5.12.5', '@fastify/cors@^11.3.0', 'zod@^4.6.5', 'tsx@^4.23.15', 'typescript@^5.9.3') }

Write-Host "starting detached install ($tag) -> $log" -ForegroundColor Cyan
$p = Start-Process -FilePath 'npm.cmd' -ArgumentList $args -WorkingDirectory $root `
  -RedirectStandardOutput $log -RedirectStandardError $err -WindowStyle Hidden -PassThru
Write-Host "pid $($p.Id). Your terminal is free. Check anytime with:" -ForegroundColor Green
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -Status" -ForegroundColor Green