-- HAPI 4 STAGE 2 — restore the Telegram channel to its pre-probe shape.
-- The key never existed on this channel before the T8 probe, so removing it
-- returns settings to exactly what it was.
update public.channels
   set settings = (coalesce(settings,'{}'::jsonb) - 'ai_auto_reply_enabled'),
       updated_at = now()
 where id = '087a1f2d-7d2b-4aaf-8c70-322838ae0c54'
   and workspace_id = '1c6b54a1-5a01-4f69-9145-6bf3235d1f23';;
