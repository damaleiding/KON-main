$ErrorActionPreference = "Stop"

$Port = 4177
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $AppDir "..\..\..")
$ServerPath = Join-Path $AppDir "server.mjs"

function Get-ListeningPid {
  $line = netstat -ano | Select-String -Pattern "127\.0\.0\.1:$Port\s+0\.0\.0\.0:0\s+LISTENING\s+(\d+)" | Select-Object -First 1
  if (-not $line) { return $null }
  return [int]$line.Matches[0].Groups[1].Value
}

$ExistingPid = Get-ListeningPid
if ($ExistingPid) {
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$ExistingPid" -ErrorAction SilentlyContinue
  $commandLine = $processInfo.CommandLine
  if ($commandLine -and $commandLine -like "*story-canvas*server.mjs*") {
    Write-Host "Story Canvas is already running at http://127.0.0.1:$Port/ (PID $ExistingPid)."
    exit 0
  }
  throw "Port $Port is already occupied by PID $ExistingPid. Stop that process before starting Story Canvas."
}

$process = Start-Process -FilePath "node" -ArgumentList @($ServerPath) -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru

$StartedPid = $null
for ($i = 0; $i -lt 20 -and -not $StartedPid; $i++) {
  Start-Sleep -Milliseconds 250
  $StartedPid = Get-ListeningPid
}
if (-not $StartedPid) {
  throw "Story Canvas did not start on fixed port $Port. Check node and server.mjs."
}

Write-Host "Story Canvas running at http://127.0.0.1:$Port/ (PID $StartedPid)."
if ($process.Id -ne $StartedPid) {
  Write-Host "Launcher PID: $($process.Id)"
}
