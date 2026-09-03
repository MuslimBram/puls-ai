\set ON_ERROR_STOP on
begin;

-- MR5 deliberately does not create a Stripe/PayPal LEAH product or price. The billing
-- lifecycle primitive is callable only by service_role after provider metadata has
-- resolved an authoritative workspace + entitlement_key=leahAiOs. This verifier pins
-- the fail-closed boundary so normal Pulse subscriptions/payments cannot accidentally
-- activate LEAH.

do $$
begin
  if has_function_privilege('anon','public.leah_apply_billing_entitlement_event(uuid,text,text,text,timestamptz,text,text,jsonb)','EXECUTE') then
    raise exception 'anon can invoke provider-neutral LEAH billing lifecycle';
  end if;
  if has_function_privilege('authenticated','public.leah_apply_billing_entitlement_event(uuid,text,text,text,timestamptz,text,text,jsonb)','EXECUTE') then
    raise exception 'authenticated can invoke provider-neutral LEAH billing lifecycle';
  end if;
end $$;

-- No pricing/catalog mutation is introduced by MR5.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='leah_workspace_entitlements'
      and column_name in ('price','price_id','stripe_price_id','paypal_plan_id','amount','currency')
  ) then
    raise exception 'MR5 invented commercial price/catalog fields inside LEAH entitlement';
  end if;
end $$;

rollback;
\echo 'LEAH PROVIDER BINDING BOUNDARY: PASS'
