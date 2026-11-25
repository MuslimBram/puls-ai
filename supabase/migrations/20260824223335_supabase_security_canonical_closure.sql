-- Supabase Security Advisor closure for the 2026-08-24 Lidhjet/runtime rollout.
-- Additive only: preserve existing view/function behavior while hardening execution context.

begin;

alter view public.agent_workload_metrics
  set (security_invoker = true);

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

alter table public.community_ratings
  drop constraint if exists community_ratings_post_rater_unique;

commit;;
