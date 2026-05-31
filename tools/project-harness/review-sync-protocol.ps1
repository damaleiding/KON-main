param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $UrlParts
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir '..\..')
$ReviewDir = Join-Path $ProjectRoot 'bluespace\outputs\blue_space_bridge_0421\_review'
$InboxDir = Join-Path $ReviewDir 'inbox'
$StatusPath = Join-Path $ReviewDir 'sync-status.json'
$Url = ($UrlParts -join ' ')

function Get-QueryValue {
  param(
    [string] $Query,
    [string] $Name
  )
  $trimmed = $Query.TrimStart('?')
  foreach ($part in $trimmed -split '&') {
    if (-not $part) { continue }
    $pair = $part -split '=', 2
    $key = [Uri]::UnescapeDataString($pair[0])
    if ($key -ne $Name) { continue }
    if ($pair.Count -lt 2) { return '' }
    return [Uri]::UnescapeDataString($pair[1])
  }
  return $null
}

function Write-SyncStatus {
  param(
    [bool] $Ok,
    [string] $Message,
    [string] $Source,
    [bool] $ApplyLedger,
    [bool] $DryRun,
    [string] $InputPath,
    [string] $OutputText,
    [int] $ExitCode
  )
  New-Item -ItemType Directory -Force -Path $ReviewDir | Out-Null
  $status = [ordered]@{
    ok = $Ok
    message = $Message
    source = $Source
    applyLedger = $ApplyLedger
    dryRun = $DryRun
    input = $InputPath
    output = $OutputText
    exitCode = $ExitCode
    finishedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  $status | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatusPath -Encoding UTF8
}

function Invoke-ReviewDataRefresh {
  try {
    & (Join-Path $ScriptDir 'review-board-data.ps1') | Out-Null
    return $LASTEXITCODE
  } catch {
    return 1
  }
}

function Invoke-CaptureCommand {
  param(
    [string] $Label,
    [string] $Command,
    [string[]] $Arguments
  )
  $output = & $Command @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | Out-String).Trim()
  if ($exitCode -ne 0) {
    throw "$Label exited with code $exitCode. $text"
  }
  return $text
}

function Get-ClipboardMarksFile {
  param([string] $Token)
  try {
    $clip = Get-Clipboard -Raw -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($clip)) { return $null }
    $payload = $clip | ConvertFrom-Json -ErrorAction Stop
    if ($payload.sync_token -ne $Token) { return $null }
    if (-not $payload.marks -or $payload.marks.Count -eq 0) { return $null }

    New-Item -ItemType Directory -Force -Path $InboxDir | Out-Null
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
    $path = Join-Path $InboxDir "review-marks-clipboard-$stamp.json"
    Set-Content -LiteralPath $path -Value $clip -Encoding UTF8
    return $path
  } catch {
    return $null
  }
}

function Test-SyncToken {
  param([string] $Token)
  $tokenPath = Join-Path $ReviewDir '.sync-token.json'
  if (-not (Test-Path -LiteralPath $tokenPath)) { return $false }
  try {
    $payload = Get-Content -LiteralPath $tokenPath -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
    return $payload.token -eq $Token
  } catch {
    return $false
  }
}

$applyLedgerFlag = $false
$dryRunFlag = $false
$source = 'download-latest'
$inputPath = ''
$decisionOutputText = ''
$ingestOutputText = ''
$enrichOutputText = ''
$validateOutputText = ''
$promptIndexOutputText = ''
$refreshOutputText = ''

try {
  $uri = [Uri] $Url
  $token = Get-QueryValue -Query $uri.Query -Name 'token'
  $applyLedger = Get-QueryValue -Query $uri.Query -Name 'applyLedger'
  $dryRun = Get-QueryValue -Query $uri.Query -Name 'dryRun'
  $marks = Get-QueryValue -Query $uri.Query -Name 'marks'
  $applyLedgerFlag = $applyLedger -eq '1' -or $applyLedger -eq 'true'
  $dryRunFlag = $dryRun -eq '1' -or $dryRun -eq 'true'
  $hasMarksFlag = $marks -eq '1' -or $marks -eq 'true'

  if (-not $token) {
    throw 'Missing sync token.'
  }
  if (-not (Test-SyncToken -Token $token)) {
    throw 'Invalid sync token.'
  }

  if ($hasMarksFlag) {
    $clipboardFile = Get-ClipboardMarksFile -Token $token
    if ($clipboardFile) {
      $source = 'clipboard'
      $inputPath = $clipboardFile
      $argsList = @('import', '--file', $clipboardFile, '--sync-token', $token)
    } else {
      $argsList = @('import-latest', '--sync-token', $token)
    }

    if ($applyLedgerFlag) {
      $argsList += '--apply-ledger'
    }
    if ($dryRunFlag) {
      $argsList += '--dry-run'
    }

    $decisionOutputText = Invoke-CaptureCommand -Label 'review-decision' -Command (Join-Path $ScriptDir 'review-decision.ps1') -Arguments $argsList
  } else {
    $source = 'page-sync'
    $decisionOutputText = 'No pending review marks; decision import skipped.'
  }

  if ($dryRunFlag) {
    $ingestOutputText = Invoke-CaptureCommand -Label 'ledger ingest dry-run' -Command (Join-Path $ProjectRoot 'bluespace\tools\production-ledger\ledger.ps1') -Arguments @('ingest', '--dry-run')
    $enrichOutputText = Invoke-CaptureCommand -Label 'ledger enrich-recipes dry-run' -Command (Join-Path $ProjectRoot 'bluespace\tools\production-ledger\ledger.ps1') -Arguments @('enrich-recipes', '--dry-run')
    $validateOutputText = 'Dry run; validate skipped.'
    $promptIndexOutputText = 'Dry run; prompt index skipped.'
    $refreshOutputText = 'Dry run; data refresh skipped.'
  } else {
    $ingestOutputText = Invoke-CaptureCommand -Label 'ledger ingest' -Command (Join-Path $ProjectRoot 'bluespace\tools\production-ledger\ledger.ps1') -Arguments @('ingest')
    $enrichOutputText = Invoke-CaptureCommand -Label 'ledger enrich-recipes' -Command (Join-Path $ProjectRoot 'bluespace\tools\production-ledger\ledger.ps1') -Arguments @('enrich-recipes')
    $validateOutputText = Invoke-CaptureCommand -Label 'ledger validate' -Command (Join-Path $ProjectRoot 'bluespace\tools\production-ledger\ledger.ps1') -Arguments @('validate', '--strict')
    $promptIndexOutputText = Invoke-CaptureCommand -Label 'ledger prompt-index' -Command (Join-Path $ProjectRoot 'bluespace\tools\production-ledger\ledger.ps1') -Arguments @('prompt-index')
    $refreshOutputText = Invoke-CaptureCommand -Label 'review-board-data refresh' -Command (Join-Path $ScriptDir 'review-board-data.ps1') -Arguments @()
  }

  $combinedOutput = @(
    '[review-decision]'
    $decisionOutputText
    '[ledger ingest]'
    $ingestOutputText
    '[ledger enrich-recipes]'
    $enrichOutputText
    '[ledger validate]'
    $validateOutputText
    '[ledger prompt-index]'
    $promptIndexOutputText
    '[review-board-data]'
    $refreshOutputText
  ) -join "`n"

  Write-SyncStatus -Ok $true -Message 'Review sync completed.' -Source $source -ApplyLedger $applyLedgerFlag -DryRun $dryRunFlag -InputPath $inputPath -OutputText $combinedOutput -ExitCode 0
} catch {
  $message = $_.Exception.Message
  $combinedOutput = @(
    '[review-decision]'
    $decisionOutputText
    '[ledger ingest]'
    $ingestOutputText
    '[ledger enrich-recipes]'
    $enrichOutputText
    '[ledger validate]'
    $validateOutputText
    '[ledger prompt-index]'
    $promptIndexOutputText
    '[review-board-data]'
    $refreshOutputText
  ) -join "`n"
  Write-SyncStatus -Ok $false -Message $message -Source $source -ApplyLedger $applyLedgerFlag -DryRun $dryRunFlag -InputPath $inputPath -OutputText $combinedOutput -ExitCode 1
  Invoke-ReviewDataRefresh | Out-Null
  Write-Host '[FAIL] Review sync protocol'
  Write-Host "  $message"
  exit 1
}
