-- Supabase Security Advisor closure for the 2026-08-24 Lidhjet/runtime rollout.
-- Additive only: preserve existing view/function behavior while hardening execution context.

begin;

-- Views use creator privileges unless security_invoker is enabled. Preserve the
-- existing view query while enforcing the caller's RLS and permissions.
alter view public.agent_workload_metrics
  set (security_invoker = true);

-- Pin function name resolution. The functions keep their existing bodies,
-- volatility and invoker-security behavior.
alter function public.community_is_disposable_email(text)
  set search_path = pg_catalog, public;

alter function public.community_is_suspicious_phone(text)
  set search_path = pg_catalog, public;

alter function public.community_validate_name(text, text)
  set search_path = pg_catalog, public;

alter function public.community_detect_contact_info(text)
  set search_path = pg_catalog, public;

alter function public.community_calculate_service_tax(text, numeric)
  set search_path = pg_catalog, public;

alter function public.community_suggest_category(text, text)
  set search_path = pg_catalog, public;

-- This is an exact duplicate of the constraint-backed unique index
-- community_ratings_post_id_rater_user_id_key. Keep the constraint-owned index.
drop index if exists public.community_ratings_post_rater_unique;

commit;
