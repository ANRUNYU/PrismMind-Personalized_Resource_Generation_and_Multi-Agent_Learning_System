$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ComposeFile = Join-Path $Root "docker-compose.prod.yml"
$NginxMain = Join-Path $Root "nginx/nginx.conf"
$NginxSite = Join-Path $Root "nginx/conf.d/edugenie.conf"

Write-Host "== PrismMind production Compose config check =="

if (-not (Test-Path $ComposeFile)) {
    throw "docker-compose.prod.yml was not found."
}
if (-not (Test-Path $NginxMain)) {
    throw "nginx/nginx.conf was not found."
}
if (-not (Test-Path $NginxSite)) {
    throw "nginx/conf.d/edugenie.conf was not found."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found in PATH."
}

Push-Location $Root
try {
    $tempEnv = New-TemporaryFile
    @"
APP_NAME=棱镜智教-PrismMind
APP_ENV=production
APP_DEBUG=false
LOG_LEVEL=INFO
SECRET_KEY=prod-compose-config-only-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=120
REFRESH_TOKEN_EXPIRE_DAYS=7
POSTGRES_DB=edugenie_prod
POSTGRES_USER=edugenie_user
POSTGRES_PASSWORD=change-me-strong-password
BACKEND_CORS_ORIGINS=["https://your-domain.com","http://your-domain.com"]
MAX_UPLOAD_SIZE_MB=20
ALLOWED_UPLOAD_EXTENSIONS=.pdf,.docx,.txt,.md
CHROMA_COLLECTION_NAME=edugenie_knowledge
LLM_PROVIDER=mock
DASHSCOPE_API_KEY=
OPENAI_API_KEY=
FRONTEND_API_BASE_URL=/api/v1
"@ | Set-Content -Path $tempEnv -Encoding UTF8

    $sensitiveNames = @(
        "SECRET_KEY",
        "POSTGRES_PASSWORD",
        "DATABASE_URL",
        "REDIS_URL",
        "CELERY_BROKER_URL",
        "CELERY_RESULT_BACKEND",
        "DASHSCOPE_API_KEY",
        "OPENAI_API_KEY",
        "BACKEND_CORS_ORIGINS",
        "DEBUG"
    )
    $previousValues = @{}
    foreach ($name in $sensitiveNames) {
        $previousValues[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    }
    $env:SECRET_KEY = "prod-compose-config-only-secret"
    $env:POSTGRES_PASSWORD = "change-me-strong-password"
    $env:DATABASE_URL = ""
    $env:REDIS_URL = ""
    $env:CELERY_BROKER_URL = ""
    $env:CELERY_RESULT_BACKEND = ""
    $env:DASHSCOPE_API_KEY = ""
    $env:OPENAI_API_KEY = ""
    $env:BACKEND_CORS_ORIGINS = '["https://your-domain.com","http://your-domain.com"]'
    $env:DEBUG = ""

    docker compose -f docker-compose.prod.yml --env-file $tempEnv config
    Write-Host "Production Compose config check passed."
    Write-Host "Next: copy backend/.env.production.example on the server, fill real values, then run the deployment commands in DEPLOYMENT.md."
}
catch {
    Write-Host "Production Compose config check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "This script only validates Compose/Nginx configuration. It does not start containers, build images, or delete volumes." -ForegroundColor Yellow
    exit 1
}
finally {
    if ($previousValues) {
        foreach ($entry in $previousValues.GetEnumerator()) {
            if ($null -eq $entry.Value) {
                [Environment]::SetEnvironmentVariable($entry.Key, $null, "Process")
            }
            else {
                [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
            }
        }
    }
    if ($tempEnv -and (Test-Path $tempEnv)) {
        Remove-Item $tempEnv -Force
    }
    Pop-Location
}
