$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Backend = Join-Path $Root "backend"

Write-Host "== PrismMind backend checks =="
Push-Location $Backend
try {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        throw "Python was not found in PATH."
    }

    Write-Host "Compiling backend..."
    python -m compileall app scripts

    Write-Host "Importing FastAPI app..."
    python -c "from app.main import app; print(app.title)"

    Write-Host "Running pytest..."
    pytest

    Write-Host "Running ruff..."
    ruff check app tests

    Write-Host "Checking test formatting..."
    black --check tests

    Write-Host "Backend checks passed."
}
catch {
    Write-Host "Backend checks failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "If pytest, ruff, or black are missing, run:" -ForegroundColor Yellow
    Write-Host "  cd backend"
    Write-Host "  pip install -r requirements-dev.txt"
    exit 1
}
finally {
    Pop-Location
}
