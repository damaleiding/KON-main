param(
  [string[]]$CommandsToCheck = @("claude", "gemini"),
  [switch]$NoRefreshProcessPath
)

$ErrorActionPreference = "Stop"

function Write-Check {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Detail
  )

  $status = if ($Ok) { "OK" } else { "FAIL" }
  Write-Host ("[{0}] {1}: {2}" -f $status, $Name, $Detail)
}

function Invoke-Capture {
  param([scriptblock]$Script)

  try {
    $output = & $Script 2>$null
    return ($output | Select-Object -First 1)
  } catch {
    return $null
  }
}

function Split-PathList {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return @()
  }

  return $Value -split ";" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

function Test-PathListContains {
  param(
    [string[]]$PathList,
    [string]$ExpectedPath
  )

  $normalizedExpected = $ExpectedPath.TrimEnd("\")
  return [bool]($PathList | Where-Object { $_.TrimEnd("\") -ieq $normalizedExpected })
}

function Join-UniquePathList {
  param([string[][]]$PathLists)

  $result = New-Object System.Collections.Generic.List[string]
  foreach ($pathList in $PathLists) {
    foreach ($item in $pathList) {
      if ([string]::IsNullOrWhiteSpace($item)) {
        continue
      }

      if (-not (Test-PathListContains $result.ToArray() $item)) {
        $result.Add($item)
      }
    }
  }

  return ($result.ToArray() -join ";")
}

if (-not $NoRefreshProcessPath) {
  $currentPathParts = Split-PathList $env:Path
  $machinePathPartsForRefresh = Split-PathList ([Environment]::GetEnvironmentVariable("Path", "Machine"))
  $userPathPartsForRefresh = Split-PathList ([Environment]::GetEnvironmentVariable("Path", "User"))
  $env:Path = Join-UniquePathList @($currentPathParts, $machinePathPartsForRefresh, $userPathPartsForRefresh)
}

$npmPrefix = Invoke-Capture { npm prefix -g }
$npmRoot = Invoke-Capture { npm root -g }
$npmBinExpected = if ($npmPrefix) { $npmPrefix } else { Join-Path $env:APPDATA "npm" }
$npmModulesExpected = if ($npmRoot) { $npmRoot } else { Join-Path $npmBinExpected "node_modules" }

$processPathParts = Split-PathList $env:Path
$userPathParts = Split-PathList ([Environment]::GetEnvironmentVariable("Path", "User"))
$machinePathParts = Split-PathList ([Environment]::GetEnvironmentVariable("Path", "Machine"))

Write-Host "npm global path verification"
Write-Host "============================"
Write-Host ("process PATH : {0}" -f ($(if ($NoRefreshProcessPath) { "not refreshed" } else { "refreshed from current + Machine + User" })))
Write-Host ("npm prefix -g : {0}" -f ($(if ($npmPrefix) { $npmPrefix } else { "<not available>" })))
Write-Host ("npm root -g   : {0}" -f ($(if ($npmRoot) { $npmRoot } else { "<not available>" })))
Write-Host ("expected bin  : {0}" -f $npmBinExpected)
Write-Host ("expected root : {0}" -f $npmModulesExpected)
Write-Host ""

$allOk = $true

$npmAvailable = [bool](Get-Command npm -ErrorAction SilentlyContinue)
Write-Check "npm command" $npmAvailable ($(if ($npmAvailable) { (Get-Command npm).Source } else { "npm is not in PATH" }))
$allOk = $allOk -and $npmAvailable

$binExists = Test-Path -LiteralPath $npmBinExpected -PathType Container
Write-Check "global bin directory exists" $binExists $npmBinExpected
$allOk = $allOk -and $binExists

$rootExists = Test-Path -LiteralPath $npmModulesExpected -PathType Container
Write-Check "global node_modules exists" $rootExists $npmModulesExpected
$allOk = $allOk -and $rootExists

$processHasBin = Test-PathListContains $processPathParts $npmBinExpected
Write-Check "current process PATH contains global bin" $processHasBin $npmBinExpected
$allOk = $allOk -and $processHasBin

$userHasBin = Test-PathListContains $userPathParts $npmBinExpected
$machineHasBin = Test-PathListContains $machinePathParts $npmBinExpected
$persistentHasBin = $userHasBin -or $machineHasBin
$persistentScope = if ($userHasBin) { "User PATH" } elseif ($machineHasBin) { "Machine PATH" } else { "not found in persistent PATH" }
Write-Check "persistent PATH contains global bin" $persistentHasBin $persistentScope
$allOk = $allOk -and $persistentHasBin

Write-Host ""
Write-Host "command shim checks"
Write-Host "-------------------"

foreach ($commandName in $CommandsToCheck) {
  $command = Get-Command $commandName -ErrorAction SilentlyContinue
  if (-not $command) {
    Write-Check $commandName $false "not found"
    $allOk = $false
    continue
  }

  $source = $command.Source
  $isFromExpectedBin = if ($source) {
    $source.StartsWith($npmBinExpected, [System.StringComparison]::OrdinalIgnoreCase)
  } else {
    $false
  }

  $ok = $isFromExpectedBin
  $detail = if ($isFromExpectedBin) {
    $source
  } else {
    "found outside npm global bin: $source"
  }

  Write-Check $commandName $ok $detail
  if ($commandName -ieq "gemini" -and $source -like "*\.local\bin\gemini.cmd") {
    Write-Host "[INFO] gemini wrapper is outside npm global bin by design in this environment."
  } else {
    $allOk = $allOk -and $ok
  }
}

Write-Host ""
if ($allOk) {
  Write-Host "Result: npm global package installation path looks correct."
  exit 0
}

Write-Host "Result: npm global package installation path needs attention."
Write-Host ("Hint: add this directory to PATH if needed: {0}" -f $npmBinExpected)
exit 1
