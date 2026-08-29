begin;

lock table public.custom_channel_adapters in share row exclusive mode;

do $$
begin
  if exists(select 1 from public.custom_channel_adapters) then
    raise exception 'Cannot harden custom_channel_adapters: expected empty table changed';
  end if;
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='custom_channel_adapters'
      and column_name='auth_credentials' and data_type='jsonb'
  ) then
    raise exception 'Cannot harden custom_channel_adapters: credential column contract changed';
  end if;
end
$$;

alter table public.custom_channel_adapters
  alter column workspace_id set not null;
alter table public.custom_channel_adapters enable row level security;

drop policy if exists "Admins can manage custom channel adapters"
  on public.custom_channel_adapters;

revoke all privileges on table public.custom_channel_adapters
  from public,anon,authenticated,sandbox_exec,service_role;
grant select,insert,update,delete on table public.custom_channel_adapters
  to service_role;

comment on table public.custom_channel_adapters is
  'Backend-only custom channel adapter configuration. auth_credentials must never be exposed through browser Data API grants.';

commit;
