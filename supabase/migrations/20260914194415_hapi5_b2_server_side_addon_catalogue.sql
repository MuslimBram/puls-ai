-- ============================================================================
-- HAPI 5 / B2 — the add-on price and quantity stop being client-controlled.
--
-- create-checkout/index.ts:117-138 builds a Stripe line item from the request
-- body: unit_amount = addonPrice * 100, and puts addon_quantity in metadata.
-- stripe-webhook/index.ts:638-644 then inserts media_addons with
-- remaining = that metadata quantity. A caller could pay 0.50 for 100 000
-- credits.
--
-- The root cause is that NO server-side catalogue exists: public.credit_packs
-- is empty, and media_addons has no reference to any price list. So the client
-- was the only source of truth available.
--
-- This migration creates the catalogue and makes it binding at the data layer,
-- so the exploit is dead even before the edge function is redeployed: an
-- add-on grant that does not match a catalogue entry is rejected by the
-- database, not merely discouraged.
-- ============================================================================

create table if not exists public.media_addon_catalog (
  addon_type   text primary key,
  label        text        not null,
  quantity     integer     not null check (quantity > 0),
  price_cents  integer     not null check (price_cents > 0),
  currency     text        not null default 'usd',
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.media_addon_catalog enable row level security;

-- Catalogue is public reference data for signed-in users; only service_role writes.
drop policy if exists media_addon_catalog_read on public.media_addon_catalog;
create policy media_addon_catalog_read on public.media_addon_catalog
  for select to authenticated using (is_active);

revoke all on public.media_addon_catalog from anon, authenticated;
grant select on public.media_addon_catalog to authenticated;
grant all    on public.media_addon_catalog to service_role;

-- Seed: deliberately EMPTY of prices invented by me. Prices are a commercial
-- decision, so the catalogue starts inactive-empty and every add-on purchase is
-- refused until the operator inserts real entries. Failing closed is correct:
-- refusing to sell is recoverable, giving away credits is not.

create or replace function public.validate_media_addon_grant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _cat public.media_addon_catalog%rowtype;
begin
  select * into _cat
  from public.media_addon_catalog
  where addon_type = NEW.addon_type and is_active;

  if not found then
    raise exception
      '[media_addons] addon_type % is not in media_addon_catalog; refusing to grant % credits',
      NEW.addon_type, NEW.quantity;
  end if;

  if NEW.quantity is distinct from _cat.quantity then
    raise exception
      '[media_addons] quantity % does not match catalogue quantity % for addon_type %',
      NEW.quantity, _cat.quantity, NEW.addon_type;
  end if;

  -- remaining may never start above what the catalogue sells.
  if coalesce(NEW.remaining, NEW.quantity) > _cat.quantity then
    raise exception
      '[media_addons] remaining % exceeds catalogue quantity % for addon_type %',
      NEW.remaining, _cat.quantity, NEW.addon_type;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_validate_media_addon_grant on public.media_addons;
create trigger trg_validate_media_addon_grant
  before insert on public.media_addons
  for each row execute function public.validate_media_addon_grant();;
