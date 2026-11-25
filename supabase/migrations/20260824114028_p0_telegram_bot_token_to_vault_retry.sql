DO $$
DECLARE
  v_token text;
  v_channel_id uuid := 'ef15c0e6-4b85-4ada-8a54-789cd68416f8';
  v_owner uuid := '3e1c8084-ab5d-459b-96a3-90e39a354778';
  v_vault_result jsonb;
BEGIN
  SELECT settings->>'bot_token' INTO v_token FROM channels WHERE id = v_channel_id;
  IF v_token IS NULL OR length(v_token) < 4 THEN
    RAISE EXCEPTION 'Token s''u gjet ose është shumë i shkurtër te channels.settings';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT public.vault_store_secret(
    NULL, 'telegram_bot_token', v_token, 'Telegram Bot Token (migruar nga settings i qartë)'
  ) INTO v_vault_result;

  RESET ROLE;

  UPDATE channels
  SET settings = settings - 'bot_token',
      credentials_encrypted = coalesce(credentials_encrypted, '{}'::jsonb)
        || jsonb_build_object('vault_secret_name', v_vault_result->>'vault_secret_name')
  WHERE id = v_channel_id;

  RAISE NOTICE 'P0 RREGULLUAR: bot_token tani në Vault (ref: %), settings.bot_token u hoq.', v_vault_result->>'vault_secret_name';
END $$;
;
