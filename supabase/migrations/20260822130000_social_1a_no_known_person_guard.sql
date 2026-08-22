-- SOCIAL-1A: Block known_person identity state at the database layer
--
-- WHY:
--   SOCIAL-1A does not implement lawful first-party linkage (that is SOCIAL-1B).
--   The TypeScript builder already rejects known_person at runtime, but the DB
--   column CHECK currently lists 'known_person' as an allowed value, meaning a
--   service-role INSERT that bypasses the builder could silently succeed.
--
--   This named constraint makes the database an independent enforcement point:
--   even a direct psql INSERT with actor_identity_state = 'known_person' will
--   be rejected with a CHECK constraint violation until SOCIAL-1B is shipped.
--
-- REMOVING THIS CONSTRAINT:
--   When SOCIAL-1B lawful-linkage support is implemented, drop this constraint
--   via a new migration:
--     ALTER TABLE public.social_engagement_events
--       DROP CONSTRAINT chk_no_known_person_until_social_1b;

ALTER TABLE public.social_engagement_events
  ADD CONSTRAINT chk_no_known_person_until_social_1b
    CHECK (actor_identity_state != 'known_person');
