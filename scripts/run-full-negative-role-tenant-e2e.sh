#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
: "${PGPASSWORD:=postgres}"
export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD

psql -X -v ON_ERROR_STOP=1 -f scripts/verify-full-negative-role-tenant-e2e-v2.sql

psql -X -v ON_ERROR_STOP=1 <<'SQL'
drop function if exists public.e2e_service_fetch(uuid);
drop function if exists public.e2e_assert_denied(text);
drop function if exists public.e2e_assert(boolean,text);
drop function if exists public.e2e_parent_guard();
drop function if exists public.e2e_immutable();
drop function if exists public.has_active_support_scope(uuid,text);
drop function if exists public.has_workspace_role(uuid,text[]);
drop function if exists public.has_workspace_access(uuid);
drop function if exists auth.uid();
drop table if exists public.e2e_child;
drop table if exists public.e2e_resource;
drop table if exists public.e2e_private;
drop table if exists public.e2e_support;
drop table if exists public.e2e_platform;
drop table if exists public.e2e_member;
drop table if exists public.e2e_ws;
drop schema if exists auth cascade;
SQL

echo "[negative-e2e] PASS"
