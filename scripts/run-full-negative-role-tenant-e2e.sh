#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:=postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD

DB="pulse_negative_role_tenant_e2e"
createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$DB"
trap 'dropdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" --if-exists "$DB" >/dev/null 2>&1 || true' EXIT
PGDATABASE="$DB" PGPASSWORD="$PGPASSWORD" psql -X -v ON_ERROR_STOP=1 -f scripts/verify-full-negative-role-tenant-e2e-v4.sql

echo "[negative-e2e] PASS"
