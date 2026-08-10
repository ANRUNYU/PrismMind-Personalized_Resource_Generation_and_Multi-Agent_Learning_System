param([switch]$History)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  $gitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
  if ($gitleaks) {
    & $gitleaks.Source detect --source . --redact --no-banner
    exit $LASTEXITCODE
  }
  Write-Warning 'gitleaks is not installed. Install it for verified working-tree and Git-history scanning.'
  $patterns = '((?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}|(?<![A-Za-z0-9_-])sk_[A-Za-z0-9_-]{20,}|(?:DASHSCOPE|OPENAI)_API_KEY\s*=\s*(?:sk-|sk_)[A-Za-z0-9_-]{20,})'
  $files = git ls-files
  foreach ($file in $files) {
    $lineNumber = 0
    Get-Content -LiteralPath $file -ErrorAction SilentlyContinue | ForEach-Object {
      $lineNumber++
      if ($_ -match $patterns) {
        $match = $Matches[0]
        if ($_ -match 'example|placeholder|fake-key|test-key' -or $match -match '=\s*$' -or $match -match '=\s*\$\{') { return }
        $prefix = if ($match.Length -gt 6) { $match.Substring(0, [Math]::Min(3, $match.Length)) + '****' + $match.Substring($match.Length - 4) } else { '****' }
        Write-Output "$file`:$lineNumber $prefix"
      }
    }
  }
  if ($History) {
    Write-Warning 'Fallback scanning cannot provide gitleaks-equivalent verified Git-history coverage. Install gitleaks and rerun.'
  }
  exit 2
} finally { Pop-Location }
