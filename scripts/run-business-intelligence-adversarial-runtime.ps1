[CmdletBinding()]
param(
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432,
  [string]$PgUser = "postgres",
  [string]$MaintenanceDatabase = "postgres"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$createdRoles = New-Object System.Collections.Generic.List[string]
$dbName = "pulse_pr218_{0}_{1}" -f (Get-Date -Format "yyyyMMddHHmmss"), $PID
$ownsPgPassword = $false

function Resolve-PostgresExecutable([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $root = Join-Path $env:ProgramFiles "PostgreSQL"
  if (Test-Path $root) {
    $candidate = Get-ChildItem -Path $root -Filter "$Name.exe" -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match "\\bin\\$Name\.exe$" } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
  }

  throw "Could not find $Name. Install PostgreSQL locally or add its bin directory to PATH."
}

$psql = Resolve-PostgresExecutable "psql"
$pgBin = Split-Path -Parent $psql
$createdb = Join-Path $pgBin "createdb.exe"
$dropdb = Join-Path $pgBin "dropdb.exe"
if (-not (Test-Path $createdb) -or -not (Test-Path $dropdb)) {
  throw "createdb.exe/dropdb.exe were not found beside $psql"
}

if (-not $env:PGPASSWORD) {
  $secure = Read-Host "PostgreSQL password for '$PgUser' (kept only in this PowerShell process)" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if ($plain.Length -gt 0) {
      $env:PGPASSWORD = $plain
      $ownsPgPassword = $true
    }
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Invoke-PsqlFile([string]$Database, [string]$FilePath) {
  Write-Host "--> $([IO.Path]::GetFileName($FilePath))"
  & $psql -X -v ON_ERROR_STOP=1 -h $PgHost -p $PgPort -U $PgUser -d $Database -f $FilePath
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $FilePath" }
}

function Invoke-PsqlScalar([string]$Database, [string]$Sql) {
  $output = & $psql -X -v ON_ERROR_STOP=1 -h $PgHost -p $PgPort -U $PgUser -d $Database -Atqc $Sql
  if ($LASTEXITCODE -ne 0) { throw "psql query failed" }
  $last = $output | Select-Object -Last 1
  if ($null -eq $last) { return "" }
  return ([string]$last).Trim()
}

function Invoke-PsqlCommand([string]$Database, [string]$Sql) {
  & $psql -X -v ON_ERROR_STOP=1 -h $PgHost -p $PgPort -U $PgUser -d $Database -qc $Sql
  if ($LASTEXITCODE -ne 0) { throw "psql command failed" }
}

$migrations = @(
  "supabase/migrations/20260901160000_business_intelligence_foundation.sql",
  "supabase/migrations/20260901161000_business_knowledge_scan_bridge.sql",
  "supabase/migrations/20260901161500_business_scan_authority.sql",
  "supabase/migrations/20260901162000_business_knowledge_freshness_diff.sql",
  "supabase/migrations/20260901162500_business_knowledge_deep_scan_bridge.sql",
  "supabase/migrations/20260901162600_business_deep_scan_pgcrypto_schema_fix.sql",
  "supabase/migrations/20260902100500_business_intelligence_adversarial_closure.sql"
)

$baseline = Join-Path $repoRoot "scripts/verify-business-intelligence-adversarial-runtime-baseline.sql"
$localParity = Join-Path $repoRoot "scripts/verify-business-intelligence-adversarial-runtime-local-grants.sql"
$verifier = Join-Path $repoRoot "scripts/verify-business-intelligence-adversarial-runtime.sql"
foreach ($path in @($baseline, $localParity, $verifier)) {
  if (-not (Test-Path $path)) { throw "Missing verifier file: $path" }
}
foreach ($relative in $migrations) {
  $path = Join-Path $repoRoot $relative
  if (-not (Test-Path $path)) { throw "Missing exact PR migration: $path" }
}

try {
  $isSuper = Invoke-PsqlScalar $MaintenanceDatabase "select rolsuper::text from pg_roles where rolname=current_user"
  if ($isSuper -ne "true" -and $isSuper -ne "t") {
    throw "Use a local PostgreSQL superuser for this disposable certification. Do not share its password in ChatGPT."
  }

  foreach ($role in @("anon", "authenticated", "service_role")) {
    $exists = Invoke-PsqlScalar $MaintenanceDatabase "select count(*)::text from pg_roles where rolname='$role'"
    if ($exists -eq "0") {
      Invoke-PsqlCommand $MaintenanceDatabase "create role $role nologin"
      $createdRoles.Add($role)
    }
  }

  Write-Host "Creating disposable database $dbName"
  & $createdb -h $PgHost -p $PgPort -U $PgUser $dbName
  if ($LASTEXITCODE -ne 0) { throw "createdb failed" }

  Invoke-PsqlFile $dbName $baseline
  Invoke-PsqlFile $dbName $localParity
  foreach ($relative in $migrations) {
    Invoke-PsqlFile $dbName (Join-Path $repoRoot $relative)
  }
  Invoke-PsqlFile $dbName $verifier

  Write-Host ""
  Write-Host "PR #218 local PostgreSQL runtime certification: PASS"
}
finally {
  Write-Host "Cleaning disposable database/roles..."
  & $dropdb -h $PgHost -p $PgPort -U $PgUser --if-exists --force $dbName 2>$null

  for ($i = $createdRoles.Count - 1; $i -ge 0; $i--) {
    $role = $createdRoles[$i]
    try {
      Invoke-PsqlCommand $MaintenanceDatabase "drop role if exists $role"
    }
    catch {
      Write-Warning $_
    }
  }

  if ($ownsPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}
