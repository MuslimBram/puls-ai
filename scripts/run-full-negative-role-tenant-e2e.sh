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
PGDATABASE="$DB" PGPASSWORD="$PGPASSWORD" psql -X -v ON_ERROR_STOP=1 <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
update public.e2e_resource set payload='member-update' where id='aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa';
do $$ begin if not exists (select 1 from public.e2e_resource where id='aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa' and payload='member-update') then raise exception 'owner UPDATE positive failed'; end if; end $$;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select count(*) from public.e2e_resource where ws='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.e2e_resource values('aaaaaaaa-aaaa-2000-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','owner');
delete from public.e2e_resource where id='aaaaaaaa-aaaa-2000-0000-aaaaaaaaaaaa';
reset role;
SQL

echo "[negative-e2e] PASS"
