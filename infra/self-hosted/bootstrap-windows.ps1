# Pulse AI — Windows one-click self-hosted Supabase bootstrap
# No cloud project is targeted. This script only touches the local Windows host.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ParentRoot = Split-Path $RepoRoot -Parent
$SupabaseRef = "self-hosted/v0.8.2"
$LocalRoot = Join-Path $ParentRoot "pulse-local"
$UpstreamRoot = Join-Path $LocalRoot "upstream"
$StackRoot = Join-Path $LocalRoot "supabase"
$ReportPath = Join-Path $LocalRoot "r114-bootstrap.log"

New-Item -ItemType Directory -Force -Path $LocalRoot | Out-Null
Start-Transcript -Path $ReportPath -Append | Out-Null

function Step([string]$Message) {
  Write-Host ""
  Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  Write-Host ""
  Write-Host "ERROR: $Message" -ForegroundColor Red
  throw $Message
}

function Require-Command([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail "$Name is required. $Hint"
  }
}

function Set-EnvValue([string]$Path, [string]$Name, [string]$Value) {
  $raw = Get-Content -LiteralPath $Path -Raw
  $escapedName = [regex]::Escape($Name)
  $line = "$Name=$Value"
  if ($raw -match "(?m)^$escapedName=.*$") {
    $raw = [regex]::Replace($raw, "(?m)^$escapedName=.*$", [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line })
  } else {
    $raw = $raw.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
  }
  Set-Content -LiteralPath $Path -Value $raw -NoNewline -Encoding utf8
}

try {
  Step "Preflight"

  Require-Command "git" "Install Git for Windows."
  Require-Command "docker" "Start Docker Desktop and keep Docker running."
  Require-Command "npm" "Node.js/npm is required for the Supabase CLI migration step."

  $dockerInfo = & docker info 2>&1
  if ($LASTEXITCODE -ne 0) {
    Fail "Docker Engine is not reachable. Start Docker Desktop and wait until it reports Running."
  }

  $bashCandidates = @(
    "$env:ProgramFiles\Git\bin\bash.exe",
    "$env:ProgramFiles\Git\usr\bin\bash.exe"
  )
  $BashExe = $bashCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $BashExe) {
    $cmd = Get-Command bash -ErrorAction SilentlyContinue
    if ($cmd) { $BashExe = $cmd.Source }
  }
  if (-not $BashExe) {
    Fail "Git Bash was not found. Install or repair Git for Windows."
  }

  Write-Host "Repo:        $RepoRoot"
  Write-Host "Local stack: $StackRoot"
  Write-Host "Upstream:    $SupabaseRef"

  Step "Acquire official Supabase self-hosted release"

  if (Test-Path $StackRoot) {
    $versionFile = Join-Path $StackRoot ".supabase-version"
    if (Test-Path $versionFile) {
      $installedRef = (Get-Content $versionFile -Raw).Trim()
      if ($installedRef -eq "ref=$SupabaseRef") {
        Write-Host "Existing local Supabase stack already pinned to $SupabaseRef."
      } else {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss"
        $StackRoot = Join-Path $LocalRoot "supabase-$suffix"
        Write-Host "Existing stack uses a different release. Creating a new isolated stack at $StackRoot."
      }
    }
  }

  if (-not (Test-Path $StackRoot)) {
    if (-not (Test-Path $UpstreamRoot)) {
      & git clone --depth 1 --branch $SupabaseRef https://github.com/supabase/supabase $UpstreamRoot
      if ($LASTEXITCODE -ne 0) { Fail "Could not clone the official Supabase repository." }
    }

    $DockerSource = Join-Path $UpstreamRoot "docker"
    if (-not (Test-Path (Join-Path $DockerSource "docker-compose.yml"))) {
      Fail "Official Supabase release does not contain the expected Docker distribution."
    }

    New-Item -ItemType Directory -Force -Path $StackRoot | Out-Null
    & robocopy $DockerSource $StackRoot /E /R:2 /W:1 /NFL /NDL /NP | Out-Null
    if ($LASTEXITCODE -gt 7) {
      Fail "Copying the official Supabase Docker distribution failed."
    }

    Set-Content -LiteralPath (Join-Path $StackRoot ".supabase-version") -Value "ref=$SupabaseRef" -Encoding ascii
  }

  $EnvPath = Join-Path $StackRoot ".env"
  if (-not (Test-Path $EnvPath)) {
    $ExamplePath = Join-Path $StackRoot ".env.example"
    if (-not (Test-Path $ExamplePath)) {
      Fail "Official .env.example is missing."
    }
    Copy-Item -LiteralPath $ExamplePath -Destination $EnvPath
  }

  Step "Generate local secrets using the official Supabase scripts"

  $EnvRaw = Get-Content -LiteralPath $EnvPath -Raw
  $NeedsSecrets = ($EnvRaw -notmatch "(?m)^POSTGRES_PASSWORD=.+") -or
                  ($EnvRaw -notmatch "(?m)^JWT_SECRET=.+") -or
                  ($EnvRaw -match "your-super-secret|change-this|example-secret")

  if ($NeedsSecrets) {
    if (-not (Get-Command jq -ErrorAction SilentlyContinue)) {
      $winget = Get-Command winget -ErrorAction SilentlyContinue
      if (-not $winget) {
        Fail "jq is required by the official secret-generation scripts and winget is unavailable. Install jq once, then run the launcher again."
      }
      Write-Host "jq not found; installing it through Windows Package Manager..."
      & winget install --id jqlang.jq -e --silent --accept-source-agreements --accept-package-agreements
      if ($LASTEXITCODE -ne 0) { Fail "Automatic jq installation failed." }
      $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
    }

    Push-Location $StackRoot
    try {
      & $BashExe -lc "sh utils/generate-keys.sh"
      if ($LASTEXITCODE -ne 0) { Fail "Official generate-keys.sh failed." }

      & $BashExe -lc "sh utils/add-new-auth-keys.sh --update-env"
      if ($LASTEXITCODE -ne 0) { Fail "Official add-new-auth-keys.sh failed." }
    } finally {
      Pop-Location
    }
  } else {
    Write-Host "Existing .env contains configured secrets; not rotating them."
  }

  Step "Set local-only Supabase URLs"

  # Local certification is intentionally HTTP-only. HTTPS/domain routing is a later phase.
  Set-EnvValue $EnvPath "SUPABASE_PUBLIC_URL" "http://localhost:8000"
  Set-EnvValue $EnvPath "API_EXTERNAL_URL" "http://localhost:8000/auth/v1"
  Set-EnvValue $EnvPath "SITE_URL" "http://localhost:5173"
  Set-EnvValue $EnvPath "ADDITIONAL_REDIRECT_URLS" "http://localhost:5173/**"

  Step "Attach the real Pulse AI Edge Function tree"

  $RepoFunctions = Join-Path $RepoRoot "supabase\functions"
  $StackFunctions = Join-Path $StackRoot "volumes\functions"
  if (-not (Test-Path $RepoFunctions)) {
    Fail "Pulse AI supabase/functions directory is missing."
  }
  New-Item -ItemType Directory -Force -Path $StackFunctions | Out-Null

  # Keep Supabase's own worker/runtime entrypoint and hello sample intact.
  & robocopy $RepoFunctions $StackFunctions /E /XD (Join-Path $RepoFunctions "main") (Join-Path $RepoFunctions "hello") /R:2 /W:1 /NFL /NDL /NP | Out-Null
  if ($LASTEXITCODE -gt 7) {
    Fail "Copying Pulse AI Edge Functions into volumes/functions failed."
  }

  $FunctionCount = @(Get-ChildItem -LiteralPath $RepoFunctions -Directory | Where-Object { $_.Name -notin @("main","hello") }).Count
  if ($FunctionCount -lt 1) {
    Fail "No Pulse AI Edge Function directories were found."
  }
  Write-Host "Pulse AI function directories copied: $FunctionCount"

  if (-not (Test-Path (Join-Path $StackFunctions "visitor-locale"))) {
    Write-Host "Warning: visitor-locale was not found in the copied function tree." -ForegroundColor Yellow
  }

  Step "Start the complete Supabase stack"

  Push-Location $StackRoot
  try {
    & $BashExe -lc "sh run.sh start"
    if ($LASTEXITCODE -ne 0) { Fail "Supabase run.sh start failed. Check $ReportPath and Docker logs." }
  } finally {
    Pop-Location
  }

  Step "Apply Pulse AI migrations using the official Supabase CLI"

  $DbPasswordLine = Get-Content -LiteralPath $EnvPath | Where-Object { $_ -match "^POSTGRES_PASSWORD=" } | Select-Object -First 1
  if (-not $DbPasswordLine) {
    Fail "POSTGRES_PASSWORD is missing from the local .env."
  }
  $DbPassword = ($DbPasswordLine -replace "^POSTGRES_PASSWORD=","").Trim().Trim('"').Trim("'")
  if ([string]::IsNullOrWhiteSpace($DbPassword)) {
    Fail "POSTGRES_PASSWORD is empty."
  }

  $EscapedPassword = [uri]::EscapeDataString($DbPassword)
  $DbUrl = "postgresql://postgres:$EscapedPassword@127.0.0.1:5432/postgres"

  Push-Location $RepoRoot
  try {
    & npx --yes supabase@latest db push --db-url $DbUrl --include-all --include-roles
    if ($LASTEXITCODE -ne 0) {
      Fail "Pulse AI migrations failed. No migration repair/reset was attempted."
    }
  } finally {
    Pop-Location
  }

  Step "Restart Functions after code/config preparation"

  Push-Location $StackRoot
  try {
    & $BashExe -lc "sh run.sh restart functions"
    if ($LASTEXITCODE -ne 0) { Fail "Functions service restart failed." }
  } finally {
    Pop-Location
  }

  Step "Write bootstrap completion marker"

  $Marker = Join-Path $LocalRoot "R114-BOOTSTRAP-COMPLETE.txt"
  @(
    "Pulse AI R114 bootstrap completed.",
    "Supabase release: $SupabaseRef",
    "Stack directory: $StackRoot",
    "Repo: $RepoRoot",
    "Managed Supabase project was not targeted by this script.",
    "Vercel Production was not changed by this script.",
    "Next: run CERTIFY-PULSE-AI-SERVER.bat."
  ) | Set-Content -LiteralPath $Marker -Encoding utf8

  Write-Host ""
  Write-Host "R114 bootstrap finished. Run CERTIFY-PULSE-AI-SERVER.bat for the evidence report." -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "R114 bootstrap FAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  try { Stop-Transcript | Out-Null } catch {}
}
