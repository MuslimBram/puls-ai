-- ============================================================
-- PULSE AI — pg_net cron migration: Authorization → apikey header
-- Migration: 20260817000000_cron_pgnet_apikey_header.sql
-- ============================================================
-- Supabase New Secret API Keys are NOT JWTs.
-- They CANNOT be sent on "Authorization: Bearer" — they are rejected there.
-- Official docs: send on the "apikey" header instead.
-- Reference: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys#database-webhooks-and-pgnet
--
-- VAULT NOTE: After creating the new secret key (sb_secret_...) in the Supabase
-- Dashboard, update the Vault entry named "SUPABASE_SERVICE_ROLE_KEY" to hold
-- the new secret key value using the Supabase Dashboard Vault UI:
--   Dashboard → Database → Vault → Click "SUPABASE_SERVICE_ROLE_KEY" → Edit
-- OR via SQL (requires the secret UUID, not the name):
--   SELECT id FROM vault.secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
--   SELECT vault.update_secret('<uuid>', 'sb_secret_...');
--   -- Note: vault.update_secret(id, secret [, name [, description]])
--   -- NEVER put the secret value in a migration file.
-- ============================================================

-- Remove existing cron job that used Authorization Bearer
SELECT cron.unschedule('sla-breach-checker')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sla-breach-checker'
);

-- Reschedule with apikey header (required for new Secret API Keys)
SELECT cron.schedule(
  'sla-breach-checker',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL')
            || '/functions/v1/sla-breach-checker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
  $$
);
-- Verify
SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'sla-breach-checker';
