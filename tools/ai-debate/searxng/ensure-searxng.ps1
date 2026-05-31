param(
    [string]$HealthUrl = "http://localhost:8080/",
    [int]$DockerWaitSeconds = 60,
    [int]$ServiceWaitSeconds = 60
)

function Test-SearXNGHealth {
    param([string]$Url)

    try {
        $null = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
        return $true
    } catch {
        return $false
    }
}

function Test-DockerReady {
    try {
        $null = & docker info 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

if (Test-SearXNGHealth -Url $HealthUrl) {
    Write-Output "SearXNG is already healthy."
    exit 0
}

if (-not (Test-DockerReady)) {
    $dockerDesktopPaths = @(
        "C:\Program Files\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
    )

    $dockerDesktop = $dockerDesktopPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($dockerDesktop) {
        Start-Process $dockerDesktop | Out-Null
    }

    $dockerDeadline = (Get-Date).AddSeconds($DockerWaitSeconds)
    while ((Get-Date) -lt $dockerDeadline) {
        if (Test-DockerReady) {
            break
        }
        Start-Sleep -Seconds 2
    }

    if (-not (Test-DockerReady)) {
        throw "Docker daemon is not ready."
    }
}

Push-Location $PSScriptRoot
try {
    & docker compose up -d | Out-Host
} finally {
    Pop-Location
}

$serviceDeadline = (Get-Date).AddSeconds($ServiceWaitSeconds)
while ((Get-Date) -lt $serviceDeadline) {
    if (Test-SearXNGHealth -Url $HealthUrl) {
        Write-Output "SearXNG is healthy."
        exit 0
    }
    Start-Sleep -Seconds 2
}

throw "SearXNG did not become healthy in time."
