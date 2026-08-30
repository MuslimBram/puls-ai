begin;

-- The view is already intentionally SECURITY INVOKER. Fail closed if that
-- invariant ever drifts rather than silently changing its execution model.
do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'agent_workload_metrics'
      and c.relkind = 'v'
      and coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'Cannot harden agent_workload_metrics ACL: security_invoker=true is not present';
  end if;
end
$$;

-- No current browser/runtime caller uses this view. Keep it as a backend-only
-- read projection and remove table-like privileges inherited through drift.
revoke all privileges on table public.agent_workload_metrics
  from public, anon, authenticated, sandbox_exec, service_role;

grant select on table public.agent_workload_metrics to service_role;

comment on view public.agent_workload_metrics is
  'Backend-only SECURITY INVOKER workload projection; service_role SELECT only.';

commit;
