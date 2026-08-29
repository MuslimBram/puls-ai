#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
H="${PGHOST:-127.0.0.1}"
P="${PGPORT:-5432}"
U="${PGUSER:-postgres}"
A="${PGDATABASE:-postgres}"
M="supabase/migrations/20260829155000_agent_workload_metrics_read_boundary.sql"
D="agent_workload_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

cleanup() {
  psql -h "$H" -p "$P" -U "$U" -d "$A" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$D' and pid<>pg_backend_pid();" >/dev/null 2>&1 || true
  dropdb -h "$H" -p "$P" -U "$U" --if-exists "$D" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for r in anon authenticated service_role sandbox_exec; do
  psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;" >/dev/null
done

createdb -h "$H" -p "$P" -U "$U" "$D"
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
create table public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  assigned_to uuid,
  user_id uuid not null,
  status text not null,
  sla_breached boolean not null default false,
  first_response_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.conversation_threads enable row level security;

create view public.agent_workload_metrics
with (security_invoker = true)
as
select
  assigned_to as agent_id,
  user_id,
  count(*) filter (where status in ('new','open','pending')) as open_conversations,
  count(*) filter (where status='resolved') as resolved_today,
  count(*) filter (where sla_breached and status not in ('resolved','closed')) as sla_breached_count,
  avg(case when first_response_at is not null then extract(epoch from first_response_at-created_at)/60.0 else null end)::int as avg_first_response_min,
  count(*) filter (where status='new' and assigned_to is null) as unassigned_queue
from public.conversation_threads
where assigned_to is not null
group by assigned_to,user_id;

grant all privileges on public.agent_workload_metrics to anon, authenticated, service_role;
grant select,insert on public.agent_workload_metrics to sandbox_exec;
SQL

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -f "$M" >/dev/null

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  role_name text;
  priv text;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='agent_workload_metrics'
      and c.relkind='v'
      and coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'security_invoker drifted';
  end if;

  foreach role_name in array array['anon','authenticated','sandbox_exec'] loop
    foreach priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(role_name,'public.agent_workload_metrics',priv) then
        raise exception '% retains % on agent_workload_metrics',role_name,priv;
      end if;
    end loop;
  end loop;

  if not has_table_privilege('service_role','public.agent_workload_metrics','SELECT') then
    raise exception 'service_role missing SELECT on agent_workload_metrics';
  end if;
  foreach priv in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege('service_role','public.agent_workload_metrics',priv) then
      raise exception 'service_role retains excessive % on agent_workload_metrics',priv;
    end if;
  end loop;
end $$;
SQL

echo "agent_workload_metrics read boundary: PASS"
