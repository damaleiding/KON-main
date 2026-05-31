param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Path,
  [string] $Text,
  [switch] $Stdin,
  [ValidateSet('nonspace', 'cjk', 'visible')]
  [string] $Mode = 'nonspace',
  [switch] $Json,
  [switch] $Details,
  [string] $Ext = 'md,markdown,txt,text,html,htm,xml,json,jsonl,csv',
  [switch] $AllFiles,
  [switch] $IncludeHidden,
  [string] $Encoding = 'utf8',
  [switch] $Help
)

$ErrorActionPreference = 'Stop'

$DefaultExts = @{}
foreach ($item in $Ext.Split(',')) {
  $clean = $item.Trim().ToLowerInvariant()
  if (-not $clean) { continue }
  if (-not $clean.StartsWith('.')) { $clean = ".$clean" }
  $DefaultExts[$clean] = $true
}

$SkipDirs = @{
  '.git' = $true
  '.hg' = $true
  '.svn' = $true
  'node_modules' = $true
  '.venv' = $true
  'venv' = $true
  '__pycache__' = $true
  'dist' = $true
  'build' = $true
  'out' = $true
  '.cache' = $true
}

if ($Help) {
  Write-Host @'
Usage: word-count [options] <file-or-directory...>

Count text with deterministic rules. Use this tool instead of model-estimated counts.

Primary modes:
  nonspace    Unicode characters excluding whitespace. Default, recommended for Chinese drafts.
  cjk         Han/CJK ideographs only.
  visible     Excludes line breaks and tabs, keeps spaces.

Options:
  -Text <text>          Count an inline text string.
  -Stdin                Read text from stdin.
  -Mode <mode>          Count mode: nonspace, cjk, visible. Default: nonspace.
  -Json                 Print machine-readable JSON.
  -Details              Print per-file counts when multiple files are read.
  -Ext <list>           Directory extension allowlist. Default: md,markdown,txt,text,html,htm,xml,json,jsonl,csv.
  -AllFiles             Include all files when reading directories.
  -IncludeHidden        Include hidden files and directories.
  -Encoding <encoding>  File encoding. Default: utf8.
  -Help                 Show this help.

Examples:
  .\tools\word-count\word-count.ps1 ".\projects\pixiv novel\outputs\chapter01.md"
  .\tools\word-count\word-count.ps1 -Mode cjk -Json ".\projects\pixiv novel\outputs"
  "第一章开始。" | .\tools\word-count\word-count.ps1 -Stdin
'@
  exit 0
}

function Get-TextElements {
  param([string] $Value)

  if ($null -eq $Value -or $Value.Length -eq 0) {
    return @()
  }

  $indexes = [System.Globalization.StringInfo]::ParseCombiningCharacters($Value)
  $elements = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $indexes.Length; $i++) {
    $start = $indexes[$i]
    if ($i + 1 -lt $indexes.Length) {
      $length = $indexes[$i + 1] - $start
    } else {
      $length = $Value.Length - $start
    }
    $elements.Add($Value.Substring($start, $length))
  }
  return $elements
}

function Get-PrimaryCount {
  param(
    [string] $CountMode,
    [int] $Nonspace,
    [int] $Cjk,
    [int] $Visible
  )

  if ($CountMode -eq 'cjk') { return $Cjk }
  if ($CountMode -eq 'visible') { return $Visible }
  return $Nonspace
}

function Measure-Text {
  param(
    [string] $Value,
    [string] $CountMode
  )

  if ($null -eq $Value) { $Value = '' }
  $elements = @(Get-TextElements -Value $Value)
  $nonspace = 0
  $visible = 0
  $cjk = 0
  $punctuation = 0

  foreach ($element in $elements) {
    if ($element -notmatch '^\s$') { $nonspace++ }
    if ($element -notmatch "^[`r`n`t]$") { $visible++ }
    if ($element -match '^[\u3400-\u9FFF\uF900-\uFAFF]$') { $cjk++ }
    if ($element -match '^\p{P}$') { $punctuation++ }
  }

  $latinWords = [regex]::Matches($Value, "[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*").Count
  $numbers = [regex]::Matches($Value, '\p{Nd}+').Count
  if ($Value.Length -eq 0) {
    $lineCount = 0
  } else {
    $lineCount = ([regex]::Split($Value, "\r\n|\r|\n")).Count
  }

  $normalized = $Value -replace "`r`n", "`n"
  $normalized = $normalized -replace "`r", "`n"
  $trimmed = $normalized.Trim()
  if ($trimmed.Length -eq 0) {
    $paragraphCount = 0
  } else {
    $paragraphCount = @([regex]::Split($trimmed, "\n\s*\n") | Where-Object { $_.Trim().Length -gt 0 }).Count
  }

  $primary = Get-PrimaryCount -CountMode $CountMode -Nonspace $nonspace -Cjk $cjk -Visible $visible
  [ordered]@{
    primary_count = $primary
    nonspace_count = $nonspace
    cjk_count = $cjk
    visible_count = $visible
    latin_word_count = $latinWords
    number_count = $numbers
    punctuation_count = $punctuation
    line_count = $lineCount
    paragraph_count = $paragraphCount
  }
}

function Get-Definition {
  param([string] $CountMode)

  if ($CountMode -eq 'cjk') { return 'Primary count is Han/CJK ideographs only.' }
  if ($CountMode -eq 'visible') { return 'Primary count excludes line breaks and tabs, but keeps spaces.' }
  return 'Primary count is Unicode characters excluding whitespace.'
}

function Add-FileInput {
  param(
    [string] $InputPath,
    [System.Collections.Generic.List[object]] $Inputs
  )

  $resolved = Resolve-Path -LiteralPath $InputPath
  foreach ($item in $resolved) {
    $fileItem = Get-Item -LiteralPath $item.Path
    if ($fileItem.PSIsContainer) {
      $children = Get-ChildItem -LiteralPath $fileItem.FullName -Recurse -File -Force:$IncludeHidden |
        Where-Object {
          if (-not $AllFiles -and -not $DefaultExts.ContainsKey($_.Extension.ToLowerInvariant())) { return $false }
          foreach ($part in $_.FullName.Substring($fileItem.FullName.Length).Split([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)) {
            if (-not $IncludeHidden -and $part.StartsWith('.')) { return $false }
            if ($SkipDirs.ContainsKey($part)) { return $false }
          }
          return $true
        } |
        Sort-Object FullName

      foreach ($child in $children) {
        $Inputs.Add([ordered]@{
          source = $child.FullName
          text = [System.IO.File]::ReadAllText($child.FullName, [System.Text.Encoding]::GetEncoding($Encoding))
        })
      }
    } elseif ($fileItem.PSIsContainer -eq $false) {
      $Inputs.Add([ordered]@{
        source = $fileItem.FullName
        text = [System.IO.File]::ReadAllText($fileItem.FullName, [System.Text.Encoding]::GetEncoding($Encoding))
      })
    }
  }
}

$inputs = New-Object System.Collections.Generic.List[object]

if ($PSBoundParameters.ContainsKey('Text')) {
  $inputs.Add([ordered]@{
    source = '<text>'
    text = $Text
  })
}

if ($Stdin) {
  $stdinText = [Console]::In.ReadToEnd()
  $inputs.Add([ordered]@{
    source = '<stdin>'
    text = $stdinText
  })
}

foreach ($pathItem in @($Path)) {
  if (-not $pathItem) { continue }
  Add-FileInput -InputPath $pathItem -Inputs $inputs
}

if ($inputs.Count -eq 0) {
  Write-Error 'No input. Provide file paths, -Text, or -Stdin.'
  exit 1
}

$files = New-Object System.Collections.Generic.List[object]
foreach ($inputItem in $inputs) {
  $counts = Measure-Text -Value $inputItem.text -CountMode $Mode
  $fileResult = [ordered]@{ source = $inputItem.source }
  foreach ($key in $counts.Keys) {
    $fileResult[$key] = $counts[$key]
  }
  $files.Add($fileResult)
}

$total = [ordered]@{
  source = '<total>'
  primary_count = 0
  nonspace_count = 0
  cjk_count = 0
  visible_count = 0
  latin_word_count = 0
  number_count = 0
  punctuation_count = 0
  line_count = 0
  paragraph_count = 0
}

foreach ($file in $files) {
  foreach ($key in @('nonspace_count', 'cjk_count', 'visible_count', 'latin_word_count', 'number_count', 'punctuation_count', 'line_count', 'paragraph_count')) {
    $total[$key] += [int]$file[$key]
  }
}
$total['primary_count'] = Get-PrimaryCount -CountMode $Mode -Nonspace $total['nonspace_count'] -Cjk $total['cjk_count'] -Visible $total['visible_count']

$definition = Get-Definition -CountMode $Mode
$result = [ordered]@{}
$result['ok'] = $true
$result['mode'] = $Mode
$result['definition'] = $definition
$result['files'] = @($files.ToArray())
$result['total'] = $total

if ($Json) {
  $result | ConvertTo-Json -Depth 8
  exit 0
}

Write-Host "Word Count: $($total.primary_count) ($Mode)"
Write-Host "Definition: $($result.definition)"
Write-Host "Breakdown: nonspace $($total.nonspace_count) | CJK $($total.cjk_count) | Latin words $($total.latin_word_count) | numbers $($total.number_count) | punctuation $($total.punctuation_count)"
Write-Host "Structure: files $($files.Count) | lines $($total.line_count) | paragraphs $($total.paragraph_count)"

if ($Details -and $files.Count -gt 1) {
  Write-Host ''
  foreach ($file in $files) {
    Write-Host "$($file.primary_count)`t$($file.source)"
  }
}
