param(
    [string] $ApiBaseUrl = "http://127.0.0.1:8000/api/v1",
    [switch] $SkipAsync,
    [switch] $Help
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ScriptPath = Join-Path $Root "scripts/e2e_smoke_api.py"

if ($Help) {
    Write-Host "Usage:"
    Write-Host '  powershell -ExecutionPolicy Bypass -File scripts/run_smoke.ps1 [-ApiBaseUrl "http://127.0.0.1:8000/api/v1"] [-SkipAsync]'
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -ApiBaseUrl   Backend API base URL. Defaults to http://127.0.0.1:8000/api/v1"
    Write-Host "  -SkipAsync    Skip Celery-backed async task checks."
    Write-Host "  -Help         Print this help and exit without calling the API."
    exit 0
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python was not found in PATH."
}

Write-Host "PrismMind API smoke test"
Write-Host "Required services: backend, PostgreSQL, Redis, and Celery worker unless -SkipAsync is used."
Write-Host "API_BASE_URL=$ApiBaseUrl"

$args = @($ScriptPath, "--api-base-url", $ApiBaseUrl)
if ($SkipAsync) {
    $args += "--skip-async"
}

python @args
