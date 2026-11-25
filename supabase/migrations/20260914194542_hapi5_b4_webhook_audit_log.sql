-- ============================================================================
-- HAPI 5 / B4 — give the PayPal webhook the audit trail it already tries to write.
--
-- paypal-webhook/index.ts ends every request with:
--     await sb.from("webhook_audit_log").insert({...}).catch(() => {});
--     // table may not exist yet -- non-critical
-- to_regclass('public.webhook_audit_log') was NULL, so every payment event
-- Pulse AI has ever received was silently discarded at that line. A refund or
-- dispute that arrives tomorrow would leave no trace at all.
--
-- The table is created to match exactly what the deployed function inserts:
-- provider, event_type, event_id, payload, processed_at. Nothing more is
-- invented. Service-role only; RLS on with no policy, i.e. deny-all to clients,
-- the same posture as integration_event_logs and processed_webhook_events.
-- ============================================================================

create table if not exists public.webhook_audit_log (
  id           uuid        primary key default gen_random_uuid(),
  provider     text        not null,
  event_type   text,
  event_id     text,
  payload      jsonb,
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.webhook_audit_log enable row level security;

revoke all on public.webhook_audit_log from anon, authenticated;
grant all on public.webhook_audit_log to service_role;

-- Same event may legitimately be logged by retries; the dedupe authority stays
-- processed_webhook_events. This index is for lookup, not uniqueness.
create index if not exists webhook_audit_log_provider_event_idx
  on public.webhook_audit_log (provider, event_id);
create index if not exists webhook_audit_log_created_idx
  on public.webhook_audit_log (created_at desc);;
