param(
    [string]$ProjectName = "intelligent-teaching",
    [string]$ApiBaseUrl = "http://127.0.0.1:8000/api/v1",
    [switch]$Build
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== Start PrismMind Demo Environment ===" -ForegroundColor Cyan
Write-Host "Project root: $repoRoot"
Write-Host "Compose project: $ProjectName"
Write-Host "Safety: do not run docker compose down -v; keep PostgreSQL and Chroma volumes."

Push-Location $repoRoot
try {
    if ($Build) {
        docker compose -p $ProjectName up -d --build backend celery_worker frontend
    } else {
        docker compose -p $ProjectName up -d
    }

    docker compose -p $ProjectName ps

    $healthOk = $false
    for ($i = 1; $i -le 12; $i++) {
        try {
            $health = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/health" -TimeoutSec 10
            if ($health.data.status -eq "ok") {
                $healthOk = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 5
        }
    }

    if (-not $healthOk) {
        Write-Host "[WARN] Backend health is not status=ok yet. Retry later: $ApiBaseUrl/health" -ForegroundColor Yellow
    } else {
        Write-Host "[PASS] Backend health status=ok" -ForegroundColor Green
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "=== Demo URLs ===" -ForegroundColor Cyan
Write-Host "Frontend: http://127.0.0.1:5173"
Write-Host "API docs: http://127.0.0.1:8000/docs"
Write-Host "Health: $ApiBaseUrl/health"
Write-Host "LLM status: $ApiBaseUrl/llm/status (login required)"
Write-Host ""
Write-Host "=== Local Demo Accounts ===" -ForegroundColor Cyan
Write-Host "Teacher: demo_teacher / DemoTeacher123!"
Write-Host "Student: demo_student / DemoStudent123!"
Write-Host "Admin: use the locally configured admin account. Do not commit real passwords."
Write-Host ""
Write-Host "Recommended before demo:"
Write-Host "python scripts/seed_demo_data.py --api-base-url $ApiBaseUrl"
