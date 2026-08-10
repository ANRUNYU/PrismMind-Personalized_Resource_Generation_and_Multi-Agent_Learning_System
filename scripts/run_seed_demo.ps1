param(
    [string] $ApiBaseUrl = "http://127.0.0.1:8000/api/v1",
    [switch] $SkipAsync,
    [switch] $Help
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ScriptPath = Join-Path $Root "scripts/seed_demo_data.py"

if ($Help) {
    Write-Host "Usage:"
    Write-Host '  powershell -ExecutionPolicy Bypass -File scripts/run_seed_demo.ps1 [-ApiBaseUrl "http://127.0.0.1:8000/api/v1"] [-SkipAsync]'
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -ApiBaseUrl   Backend API base URL. Defaults to http://127.0.0.1:8000/api/v1"
    Write-Host "  -SkipAsync    Skip Celery-backed demo task creation."
    Write-Host "  -Help         Print this help and exit without calling the API."
    exit 0
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python was not found in PATH."
}

Write-Host "PrismMind demo data seeding"
Write-Host "This script creates or reuses demo accounts and demo records. It never deletes data."
Write-Host "API_BASE_URL=$ApiBaseUrl"

$args = @($ScriptPath, "--api-base-url", $ApiBaseUrl)
if ($SkipAsync) {
    $args += "--skip-async"
}

python @args
