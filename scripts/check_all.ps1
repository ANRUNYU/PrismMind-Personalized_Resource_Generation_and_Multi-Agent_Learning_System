$ErrorActionPreference = "Stop"

$Scripts = $PSScriptRoot

Write-Host "== PrismMind full local quality gate =="

try {
    & (Join-Path $Scripts "check_backend.ps1")
    & (Join-Path $Scripts "check_frontend.ps1")
    & (Join-Path $Scripts "check_compose.ps1")
    Write-Host "All local quality checks passed." -ForegroundColor Green
}
catch {
    Write-Host "Quality gate failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
