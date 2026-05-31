$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $ScriptDir "healthcheck.mjs") @args
exit $LASTEXITCODE
