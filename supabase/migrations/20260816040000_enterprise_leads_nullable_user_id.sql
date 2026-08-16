-- supabase/migrations/20260816040000_enterprise_leads_nullable_user_id.sql
-- ============================================================
-- Allow public unauthenticated website leads to be inserted into enterprise_leads
-- by making user_id optional (nullable).
-- ============================================================

ALTER TABLE public.enterprise_leads ALTER COLUMN user_id DROP NOT NULL;
