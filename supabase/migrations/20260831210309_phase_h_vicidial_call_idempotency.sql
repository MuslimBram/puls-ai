begin;

-- Phase H: VICIdial CDRs use the canonical call_records.external_call_id field.
-- The provider/workspace pair is part of the identity so two tenants can safely
-- receive the same upstream identifier without cross-tenant collisions.
create unique index if not exists call_records_workspace_provider_external_call_uidx
  on public.call_records (workspace_id, channel_provider, external_call_id)
  where external_call_id is not null;

commit;
