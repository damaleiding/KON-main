$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = $null

if ($nodeCommand) {
  $nodePath = $nodeCommand.Source
} else {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    'C:\Program Files\nodejs\node.exe',
    'C:\workspace\Trae\nodejs\node.exe'
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      $nodePath = $candidate
      break
    }
  }
}

if (-not $nodePath) {
  Write-Host '[FAIL] Node runtime available'
  Write-Host '  node is not on PATH and no known local Node runtime was found.'
  Write-Host '  Windows install: winget install --id OpenJS.NodeJS.LTS -e --source winget'
  exit 1
}

& $nodePath (Join-Path $ScriptDir "reference-picker.mjs") @args
exit $LASTEXITCODE
