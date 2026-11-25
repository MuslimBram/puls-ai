-- FAZA 1A / M-1 — users and channels limits to the agreed commercial targets
--
-- STATUS: PREPARED, NOT APPLIED. Requires explicit owner authorisation to run.
--
-- Owner decision, 2026-09-15:
--   Users    Standard 3  · Professional 10 · Advanced 25
--   Channels Standard 3  · Professional 10 · Advanced 25
--
-- Current production values, read 2026-09-15:
--   team_members_limit   standard 2  · professional 5 · advanced 15
--   channels_limit       standard 3  · professional 7 · advanced 15
--
-- BLAST RADIUS: every change is an INCREASE or unchanged. No account can become
-- retroactively over its limit as a result of this migration.
--
--   standard      users 2  -> 3    channels 3  -> 3   (unchanged)
--   professional  users 5  -> 10   channels 7  -> 10
--   advanced      users 15 -> 25   channels 15 -> 25
--
-- SCOPE: touches ONLY the two limit columns. No price column of any currency,
-- no stripe identifier, no feature entitlement, no other limit. A test asserts
-- that no pricing column name appears anywhere in this file.
--
-- enterprise (-1) and donation (0) are deliberately untouched.

UPDATE public.pricing_settings SET team_members_limit = 3,  channels_limit = 3  WHERE plan_key = 'standard';
UPDATE public.pricing_settings SET team_members_limit = 10, channels_limit = 10 WHERE plan_key = 'professional';
UPDATE public.pricing_settings SET team_members_limit = 25, channels_limit = 25 WHERE plan_key = 'advanced';
;
