$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "== PrismMind Docker Compose config check =="
Push-Location $Root
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker CLI was not found in PATH."
    }

    $tempEnv = New-TemporaryFile
    @"
POSTGRES_DB=edugenie_dev
POSTGRES_USER=edugenie_user
POSTGRES_PASSWORD=edugenie_password
APP_NAME=棱镜智教-PrismMind
APP_ENV=development
APP_DEBUG=true
LOG_LEVEL=INFO
SECRET_KEY=compose-config-only-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=120
REFRESH_TOKEN_EXPIRE_DAYS=7
MAX_UPLOAD_SIZE_MB=20
CHROMA_COLLECTION_NAME=edugenie_knowledge
LLM_PROVIDER=mock
DASHSCOPE_API_KEY=
OPENAI_API_KEY=
"@ | Set-Content -Path $tempEnv -Encoding UTF8

    docker compose -p intelligent-teaching --env-file $tempEnv config
    Write-Host "Docker Compose config check passed."
}
catch {
    Write-Host "Docker Compose config check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "This script only validates compose syntax; it does not start containers or delete volumes." -ForegroundColor Yellow
    exit 1
}
finally {
    if ($tempEnv -and (Test-Path $tempEnv)) {
        Remove-Item $tempEnv -Force
    }
    Pop-Location
}
