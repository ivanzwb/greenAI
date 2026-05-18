# Deploy greenAI API stack (Docker Compose). Run from repository root.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ComposeFile = "deploy/docker-compose.prod.yml"
if (-not (Test-Path ".env")) {
    Write-Error "Missing .env in repo root. Copy .env.example to .env and fill secrets."
}

Write-Host "==> Building and starting stack ($ComposeFile)"
docker compose -f $ComposeFile --env-file .env up -d --build

$port = $env:API_PUBLISH_PORT
if (-not $port) { $port = "3000" }
Write-Host "==> Waiting for API health (localhost:$port)"
for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:$port/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
        Write-Host "OK: /health"
        exit 0
    } catch { Start-Sleep -Seconds 1 }
}
Write-Warning "/health did not become ready; check: docker compose -f $ComposeFile logs -f api"
exit 1
