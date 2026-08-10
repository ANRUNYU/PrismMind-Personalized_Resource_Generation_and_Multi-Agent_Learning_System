$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Frontend = Join-Path $Root "frontend"

function Invoke-Npm {
    param(
        [Parameter(Mandatory = $true)]
        [string[]] $NpmArgs
    )

    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($npm) {
        & $npm.Source @NpmArgs
        return
    }

    $npmCmd = "C:\Program Files\nodejs\npm.cmd"
    if (Test-Path $npmCmd) {
        $env:PATH = "C:\Program Files\nodejs;$env:PATH"
        & $npmCmd @NpmArgs
        return
    }

    throw "npm was not found. Install Node.js or run commands with the full npm.cmd path."
}

Write-Host "== PrismMind frontend checks =="
Push-Location $Frontend
try {
    Write-Host "Running type-check..."
    Invoke-Npm -NpmArgs @("run", "type-check")

    Write-Host "Running build..."
    Invoke-Npm -NpmArgs @("run", "build")

    Write-Host "Frontend checks passed."
}
catch {
    Write-Host "Frontend checks failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "If PowerShell blocks npm.ps1, use:" -ForegroundColor Yellow
    Write-Host '  "C:\Program Files\nodejs\npm.cmd" run type-check'
    Write-Host '  "C:\Program Files\nodejs\npm.cmd" run build'
    exit 1
}
finally {
    Pop-Location
}
