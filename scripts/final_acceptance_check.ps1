param(
    [string]$ProjectName = "intelligent-teaching",
    [string]$ApiBaseUrl = "http://127.0.0.1:8000/api/v1",
    [string]$TeacherUsername = $env:DEMO_TEACHER_USERNAME,
    [string]$TeacherPassword = $env:DEMO_TEACHER_PASSWORD
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$results = New-Object System.Collections.Generic.List[object]

if ([string]::IsNullOrWhiteSpace($TeacherUsername)) {
    $TeacherUsername = "demo_teacher"
}
if ([string]::IsNullOrWhiteSpace($TeacherPassword)) {
    $TeacherPassword = "DemoTeacher123!"
}

function Add-Result {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Detail = ""
    )
    $script:results.Add([pscustomobject]@{
        name = $Name
        status = $Status
        detail = $Detail
    })
    $color = if ($Status -eq "PASS") { "Green" } elseif ($Status -eq "WARN") { "Yellow" } else { "Red" }
    Write-Host "[$Status] $Name $Detail" -ForegroundColor $color
}

function Invoke-Step {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string[]]$Command
    )
    Push-Location $WorkingDirectory
    try {
        $arguments = @()
        if ($Command.Length -gt 1) {
            $arguments = $Command[1..($Command.Length - 1)]
        }
        & $Command[0] @arguments
        if ($LASTEXITCODE -ne 0) {
            Add-Result $Name "FAIL" "exit=$LASTEXITCODE"
            return
        }
        Add-Result $Name "PASS"
    } catch {
        Add-Result $Name "FAIL" $_.Exception.Message
    } finally {
        Pop-Location
    }
}

function Invoke-HealthCheck {
    try {
        $health = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/health" -TimeoutSec 15
        if ($health.data.status -eq "ok") {
            Add-Result "health" "PASS" "status=ok"
        } else {
            Add-Result "health" "FAIL" ($health | ConvertTo-Json -Depth 4)
        }
    } catch {
        Add-Result "health" "FAIL" $_.Exception.Message
    }
}

function Invoke-LlmStatusCheck {
    try {
        $payload = @{
            username = $TeacherUsername
            password = $TeacherPassword
        } | ConvertTo-Json
        $login = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/auth/login" -ContentType "application/json" -Body $payload -TimeoutSec 15
        $token = $login.data.access_token
        if ([string]::IsNullOrWhiteSpace($token)) {
            Add-Result "llm status" "WARN" "login succeeded but token is empty"
            return
        }
        $status = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/llm/status" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 15
        Add-Result "llm status" "PASS" "provider=$($status.data.provider) model=$($status.data.model) configured=$($status.data.configured)"
    } catch {
        Add-Result "llm status" "WARN" "demo teacher login or status check failed: $($_.Exception.Message)"
    }
}

Write-Host "=== PrismMind Final Acceptance Check ===" -ForegroundColor Cyan
Write-Host "Project root: $repoRoot"
Write-Host "API Base URL: $ApiBaseUrl"
Write-Host "Note: smoke and seed will run sequentially. Do not run them in parallel."
Write-Host "Safety: this script never runs docker compose down -v and never deletes volumes, storage, uploads, or Chroma data."

Invoke-Step "docker compose ps" $repoRoot @("docker", "compose", "-p", $ProjectName, "ps")
Invoke-HealthCheck
Invoke-LlmStatusCheck
Invoke-Step "backend compileall" (Join-Path $repoRoot "backend") @("python", "-m", "compileall", "app")
Invoke-Step "backend pytest" (Join-Path $repoRoot "backend") @("pytest")
Invoke-Step "frontend type-check" (Join-Path $repoRoot "frontend") @("npm.cmd", "run", "type-check")
Invoke-Step "frontend build" (Join-Path $repoRoot "frontend") @("npm.cmd", "run", "build")
Invoke-Step "frontend e2e" (Join-Path $repoRoot "frontend") @("npm.cmd", "run", "test:e2e")
Invoke-Step "docker compose config" $repoRoot @("docker", "compose", "config")
Invoke-Step "docker compose project config" $repoRoot @("docker", "compose", "-p", $ProjectName, "config")
Invoke-Step "smoke api" $repoRoot @("python", "scripts/e2e_smoke_api.py", "--api-base-url", $ApiBaseUrl)
Invoke-Step "seed demo data" $repoRoot @("python", "scripts/seed_demo_data.py", "--api-base-url", $ApiBaseUrl)

$passed = ($results | Where-Object { $_.status -eq "PASS" }).Count
$warned = ($results | Where-Object { $_.status -eq "WARN" }).Count
$failed = ($results | Where-Object { $_.status -eq "FAIL" }).Count

Write-Host ""
Write-Host "=== Acceptance Summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
Write-Host "PASS=$passed WARN=$warned FAIL=$failed"

if ($failed -gt 0) {
    exit 1
}
exit 0
