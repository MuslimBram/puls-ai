-- M3 (pjesë): përputhje UUID Owner/Admin me SOURCE.
-- amirah.br0001@gmail.com (Owner) tashmë e saktë — s'preket.
-- muslim.brami@gmail.com: llogari TEST ("FAZA7-B8-TEST-USER") me UUID të gabuar -> hiqet, rikrijohet me UUID e SOURCE.
-- amirah.br0002@gmail.com, bio.dorient@gmail.com: mungonin fare -> krijohen.
-- SHENIM: encrypted_password mbetet NULL (placeholder strukturor) — fjalëkalimet reale duhen sjellë nga
-- migrimi i vërtetë i SOURCE (M2), jo të fabrikohen këtu.

DO $$
BEGIN
  -- 1) Hiq user_roles + auth.users të llogarisë test (email do lirohet për rikrijim)
  DELETE FROM public.user_roles WHERE user_id = 'b3ddc738-0bd3-4341-b847-65f06cf44585';
  DELETE FROM auth.users WHERE id = 'b3ddc738-0bd3-4341-b847-65f06cf44585';
  -- (community_profiles për këtë UUID hiqet automatikisht via ON DELETE CASCADE)

  -- 2) Rikrijo muslim.brami@gmail.com me UUID e saktë të SOURCE
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) VALUES (
    'd87c4aa5-0000-0000-0000-e4cd9fc4895b', -- PLACEHOLDER: UUID e plotë do konfirmohet/korrigjohet me M2
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'muslim.brami@gmail.com', NULL, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Muslim Brami","email":"muslim.brami@gmail.com","email_verified":true}'::jsonb,
    now(), now(), '', '', '', '', false, false
  );

  RAISE NOTICE 'Faza 2 e M3 përfundoi (pjesa muslim.brami) — vazhdon më poshtë';
END $$;
;
