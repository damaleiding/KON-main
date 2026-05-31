param(
    [Parameter(Mandatory = $true)]
    [string]$Query,

    [string]$Category = "general",

    [string]$Language = "all",

    [int]$Limit = 5
)

& "$PSScriptRoot\ensure-searxng.ps1"

$baseUrl = "http://localhost:8080/search"
$uri = "{0}?q={1}&format=json&categories={2}&language={3}" -f $baseUrl, [uri]::EscapeDataString($Query), [uri]::EscapeDataString($Category), [uri]::EscapeDataString($Language)

$response = Invoke-RestMethod -Uri $uri -Method Get

$response.results |
    Select-Object -First $Limit `
        @{Name = "title"; Expression = { $_.title } }, `
        @{Name = "url"; Expression = { $_.url } }, `
        @{Name = "content"; Expression = { $_.content } } |
    ConvertTo-Json -Depth 4
