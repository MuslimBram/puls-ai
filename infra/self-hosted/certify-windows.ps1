# Pulse AI — R114 local certification
# Produces evidence only from the local Windows machine. No cloud project is contacted.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ParentRoot = Split-Path $RepoRoot -Parent
$LocalRoot = Join-Path $ParentRoot "pulse-local"
$StackRoot = Join-Path $LocalRoot "supabase"
$EnvPath = Join-Path $StackRoot ".env"
$ReportPath = Join-Path $LocalRoot "r114-local-certification.txt"

$results = [System.Collections.Generic.List[object]]::new()

function Add-Result([string]$Check, [string]$Status, [string]$Evidence) {
  $results.Add([pscustomobject]@{
    Check = $Check
    Status = $Status
    Evidence = $Evidence
  })
  $color = if ($Status -eq "PASS") { "Green" } elseif ($Status -eq "INCOMPLETE") { "Yellow" } else { "Red" }
  Write-Host ("[{0}] {1} — {2}" -f $Status,$Check,$Evidence) -ForegroundColor $color
}

function Get-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $null }
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -replace "^$([regex]::Escape($Name))=","").Trim().Trim('"').Trim("'"))
}

function Test-Http([string]$Check, [string]$Uri, [hashtable]$Headers = @{}, [int[]]$Accepted = @(200)) {
  try {
    $response = Invoke-WebRequest -Uri $Uri -Headers $Headers -Method GET -TimeoutSec 15 -UseBasicParsing
    if ($Accepted -contains [int]$response.StatusCode) {
      Add-Result $Check "PASS" "HTTP $($response.StatusCode)"
      return $true
    }
    Add-Result $Check "FAIL" "Unexpected HTTP $($response.StatusCode)"
    return $false
  } catch {
    $status = $null
    try { $status = [int]$_.Exception.Response.StatusCode.value__ } catch {}
    if ($null -ne $status -and ($Accepted -contains $status)) {
      Add-Result $Check "PASS" "HTTP $status"
      return $true
    }
    if ($null -ne $status) {
      Add-Result $Check "FAIL" "HTTP $status"
    } else {
      Add-Result $Check "FAIL" $_.Exception.Message
    }
    return $false
  }
}

function Exec-Db([string]$Sql) {
  Push-Location $StackRoot
  try {
    $out = & docker compose exec -T db psql -U postgres -d postgres -tAc $Sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw (($out -join [Environment]::NewLine)) }
    return ($out -join [Environment]::NewLine).Trim()
  } finally {
    Pop-Location
  }
}

try {
  Write-Host ""
  Write-Host "=== Pulse AI R114 LOCAL CERTIFICATION ===" -ForegroundColor Cyan
  Write-Host "Repo:  $RepoRoot"
  Write-Host "Stack: $StackRoot"
  Write-Host ""

  if (-not (Test-Path $StackRoot)) {
    Add-Result "Docker stack healthy" "FAIL" "Local Supabase stack directory does not exist."
    throw "Run START-PULSE-AI-SERVER.bat first."
  }

  $compose = Join-Path $StackRoot "docker-compose.yml"
  if (-not (Test-Path $compose)) {
    Add-Result "Docker stack healthy" "FAIL" "docker-compose.yml is missing."
    throw "Official self-hosted distribution is incomplete."
  }

  $services = @(docker compose -f $compose config --services 2>$null)
  if ($services.Count -lt 5) {
    Add-Result "Docker stack healthy" "FAIL" "Expected the complete Supabase service set; only $($services.Count) services were discovered."
  } else {
    $bad = @()
    foreach ($service in $services) {
      $cid = (& docker compose -f $compose ps -q $service 2>$null).Trim()
      if ([string]::IsNullOrWhiteSpace($cid)) {
        $bad += "$service=missing"
        continue
      }
      $stateHealth = (& docker inspect --format "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}" $cid 2>$null).Trim()
      $parts = $stateHealth -split "\|",2
      $state = $parts[0]
      $health = if ($parts.Count -gt 1) { $parts[1] } else { "" }
      if ($state -ne "running" -or ($health -and $health -ne "healthy")) {
        $bad += "$service=$state/$health"
      }
    }
    if ($bad.Count -eq 0) {
      Add-Result "Docker stack healthy" "PASS" "$($services.Count) services running; healthchecks are healthy where defined."
    } else {
      Add-Result "Docker stack healthy" "FAIL" ("Unhealthy/missing services: " + ($bad -join ", "))
    }
  }

  $pubKey = Get-EnvValue $EnvPath "SUPABASE_PUBLISHABLE_KEY"
  if (-not $pubKey) { $pubKey = Get-EnvValue $EnvPath "ANON_KEY" }
  $secretKey = Get-EnvValue $EnvPath "SUPABASE_SECRET_KEY"
  if (-not $secretKey) { $secretKey = Get-EnvValue $EnvPath "SERVICE_ROLE_KEY" }

  if (Test-Path $EnvPath) {
    Add-Result "Local secrets configured" "PASS" ".env exists; secret values are not printed."
  } else {
    Add-Result "Local secrets configured" "FAIL" ".env is missing."
  }

  Test-Http "Studio" "http://127.0.0.1:8000/" @{} @(200,302)
  if ($pubKey) {
    Test-Http "Auth" "http://127.0.0.1:8000/auth/v1/health" @{ apikey = $pubKey } @(200)
  } else {
    Add-Result "Auth" "FAIL" "No publishable/anon API key found."
  }

  if ($secretKey) {
    Test-Http "REST" "http://127.0.0.1:8000/rest/v1/" @{ apikey = $secretKey; Authorization = "Bearer $secretKey" } @(200)
    Test-Http "Storage" "http://127.0.0.1:8000/storage/v1/bucket" @{ apikey = $secretKey; Authorization = "Bearer $secretKey" } @(200)
  } else {
    Add-Result "REST" "FAIL" "No secret/service-role API key found."
    Add-Result "Storage" "FAIL" "No secret/service-role API key found."
  }

  $realtimeCid = (& docker compose -f $compose ps -q realtime 2>$null).Trim()
  if ($realtimeCid) {
    $rh = (& docker inspect --format "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}" $realtimeCid 2>$null).Trim()
    if ($rh -match "^running\|?(healthy)?$") {
      Add-Result "Realtime service" "PASS" "Realtime container is running/healthy."
      Add-Result "Realtime WebSocket" "INCOMPLETE" "Container health is proven; an actual WebSocket subscribe was not automated."
    } else {
      Add-Result "Realtime service" "FAIL" "Realtime container state: $rh"
    }
  } else {
    Add-Result "Realtime service" "FAIL" "Realtime container is missing."
  }

  $visitorUrl = "http://127.0.0.1:8000/functions/v1/visitor-locale"
  Test-Http "Edge Functions" $visitorUrl @{ Accept = "application/json" } @(200)

  $migrationCount = 0
  $migrationDir = Join-Path $RepoRoot "supabase\migrations"
  if (Test-Path $migrationDir) {
    $migrationCount = @(Get-ChildItem -LiteralPath $migrationDir -Filter "*.sql" -File).Count
  }
  try {
    $remoteMigrationCount = [int](Exec-Db "select count(*) from supabase_migrations.schema_migrations;")
    if ($migrationCount -gt 0 -and $remoteMigrationCount -eq $migrationCount) {
      Add-Result "Migrations" "PASS" "$remoteMigrationCount/$migrationCount repository migrations recorded in local migration history."
    } elseif ($migrationCount -eq 0) {
      Add-Result "Migrations" "FAIL" "No repository migrations were found."
    } else {
      Add-Result "Migrations" "FAIL" "Local SQL migrations: $migrationCount; recorded in DB: $remoteMigrationCount."
    }
  } catch {
    Add-Result "Migrations" "FAIL" $_.Exception.Message
  }

  $criticalTables = @(
    "workspaces",
    "workspace_members",
    "business_profiles",
    "channels",
    "leads",
    "conversation_threads",
    "campaigns",
    "knowledge_sources",
    "knowledge_chunks",
    "scan_insights"
  )
  $tableLiteral = ($criticalTables | ForEach-Object { "'$_'" }) -join ","
  try {
    $rlsSql = "select table_name || '|' || rowsecurity::text || '|' || coalesce((select count(*) from pg_policies p where p.schemaname='public' and p.tablename=t.table_name),0)::text from pg_tables t where t.schemaname='public' and t.table_name in ($tableLiteral) order by table_name;"
    $rows = @(Exec-Db $rlsSql) | Where-Object { $_ }
    $missing = @()
    $badRls = @()
    $noPolicies = @()
    foreach ($name in $criticalTables) {
      $row = $rows | Where-Object { $_ -like "$name|*" } | Select-Object -First 1
      if (-not $row) {
        $missing += $name
        continue
      }
      $p = $row -split "\|"
      if ($p[1] -ne "true") { $badRls += $name }
      if ([int]$p[2] -lt 1) { $noPolicies += $name }
    }
    if ($missing.Count -eq 0 -and $badRls.Count -eq 0 -and $noPolicies.Count -eq 0) {
      Add-Result "RLS / tenant isolation baseline" "PASS" "All $($criticalTables.Count) critical tenant tables have RLS enabled and at least one policy."
    } else {
      $details = @()
      if ($missing.Count) { $details += "missing=" + ($missing -join ",") }
      if ($badRls.Count) { $details += "RLS-off=" + ($badRls -join ",") }
      if ($noPolicies.Count) { $details += "no-policy=" + ($noPolicies -join ",") }
      Add-Result "RLS / tenant isolation baseline" "FAIL" ($details -join "; ")
    }
  } catch {
    Add-Result "RLS / tenant isolation baseline" "FAIL" $_.Exception.Message
  }

  if ($pubKey) {
    try {
      $anonUri = "http://127.0.0.1:8000/rest/v1/business_profiles?select=id"
      $anon = Invoke-WebRequest -Uri $anonUri -Headers @{ apikey = $pubKey; Authorization = "Bearer $pubKey" } -Method GET -TimeoutSec 15 -UseBasicParsing
      $body = ($anon.Content | ConvertFrom-Json)
      $count = if ($body -is [array]) { $body.Count } elseif ($null -eq $body) { 0 } else { 1 }
      if ($count -eq 0) {
        Add-Result "Anonymous tenant-data disclosure" "PASS" "Anonymous request returned no business rows."
      } else {
        Add-Result "Anonymous tenant-data disclosure" "FAIL" "Anonymous request returned $count business row(s)."
      }
    } catch {
      $status = $null
      try { $status = [int]$_.Exception.Response.StatusCode.value__ } catch {}
      if ($status -in @(401,403)) {
        Add-Result "Anonymous tenant-data disclosure" "PASS" "Anonymous request was rejected with HTTP $status."
      } else {
        Add-Result "Anonymous tenant-data disclosure" "FAIL" $_.Exception.Message
      }
    }
  }

  Step "Frontend local configuration/build"
  $viteUrl = "http://127.0.0.1:8000"
  if ($pubKey) {
    $env:VITE_SUPABASE_URL = $viteUrl
    $env:VITE_SUPABASE_PUBLISHABLE_KEY = $pubKey
    Push-Location $RepoRoot
    try {
      & npm run build
      if ($LASTEXITCODE -eq 0) {
        Add-Result "Frontend build with local Supabase config" "PASS" "Vite build completed using local Supabase URL/key environment."
      } else {
        Add-Result "Frontend build with local Supabase config" "FAIL" "npm run build exited with $LASTEXITCODE."
      }
    } finally {
      Remove-Item Env:VITE_SUPABASE_URL -ErrorAction SilentlyContinue
      Remove-Item Env:VITE_SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
      Pop-Location
    }
  } else {
    Add-Result "Frontend build with local Supabase config" "FAIL" "Publishable/anon key unavailable."
  }

  Add-Result "Browser Supabase runtime" "INCOMPLETE" "The script can prove backend and build connectivity, but an authenticated browser session still requires manual UI verification."

  $lines = @()
  $lines += "Pulse AI — R114 LOCAL CERTIFICATION"
  $lines += "Generated: $(Get-Date -Format o)"
  $lines += "Stack: $StackRoot"
  $lines += ""
  foreach ($r in $results) {
    $lines += "[{0}] {1} — {2}" -f $r.Status,$r.Check,$r.Evidence
  }
  $lines += ""
  $lines += "Secrets were intentionally omitted from this report."
  $lines += "Managed Supabase and Vercel Production were not targeted by this certification."
  $lines | Set-Content -LiteralPath $ReportPath -Encoding utf8

  $hasFail = @($results | Where-Object Status -eq "FAIL").Count -gt 0
  $hasIncomplete = @($results | Where-Object Status -eq "INCOMPLETE").Count -gt 0

  Write-Host ""
  Write-Host "Report: $ReportPath" -ForegroundColor Cyan

  if ($hasFail) {
    exit 1
  }
  if ($hasIncomplete) {
    exit 2
  }
  exit 0
}
catch {
  Write-Host "Certification script error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
