param(
  [string]$Root = "bluespace/outputs/blue_space_bridge_0421",
  [string]$Ledger = "bluespace/outputs/blue_space_bridge_0421/_ledger/production-ledger.jsonl",
  [string]$Json = "bluespace/_harness/video-submit-audit.json",
  [string]$Markdown = "bluespace/_harness/video-submit-audit.md",
  [switch]$FailOnBlocker
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "../..")
$nodeScript = Join-Path $scriptDir "video-submit-audit.mjs"

$argsList = @(
  $nodeScript,
  "--root", $Root,
  "--ledger", $Ledger,
  "--json", $Json,
  "--md", $Markdown
)
if ($FailOnBlocker) {
  $argsList += "--fail-on-blocker"
}

Push-Location $repoRoot
try {
  & node @argsList
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
