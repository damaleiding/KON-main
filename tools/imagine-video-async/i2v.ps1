$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $ScriptDir "i2v-async.mjs") @args
exit $LASTEXITCODE
