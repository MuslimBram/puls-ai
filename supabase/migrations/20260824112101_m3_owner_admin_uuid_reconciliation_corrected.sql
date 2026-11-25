DO $$
BEGIN
  -- 1) Korrigjo UUID-në e fabrikuar gabimisht të muslim.brami me atë të saktë të SOURCE
  --    (asgjë tjetër s'e referon ende këtë rresht — update i sigurt i PK)
  UPDATE auth.users
  SET id = 'd87c4aa5-aadf-4510-93a9-e4cd9fc4895b'
  WHERE id = 'd87c4aa5-0000-0000-0000-e4cd9fc4895b' AND email = 'muslim.brami@gmail.com';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rreshti placeholder i gabuar s''u gjet — ndalo dhe kontrollo manualisht';
  END IF;

  -- 2) Krijo amirah.br0002@gmail.com (mungonte fare)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) VALUES (
    '10dbeb30-e599-4422-9fbf-6ee956b3c212',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'amirah.br0002@gmail.com', NULL, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Amirah Br","email":"amirah.br0002@gmail.com","email_verified":true}'::jsonb,
    now(), now(), '', '', '', '', false, false
  );

  -- 3) Krijo bio.dorient@gmail.com (mungonte fare)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) VALUES (
    'b264d82b-9891-40c1-b2db-b6440a86ea80',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'bio.dorient@gmail.com', NULL, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Bio Dorient","email":"bio.dorient@gmail.com","email_verified":true}'::jsonb,
    now(), now(), '', '', '', '', false, false
  );

  -- 4) user_roles për të treja (admin + user + business_owner, sipas SOURCE; super_admin s'ekziston te SOURCE për askënd, s'e shtoj)
  INSERT INTO public.user_roles (user_id, role) VALUES
    ('d87c4aa5-aadf-4510-93a9-e4cd9fc4895b', 'user'),
    ('d87c4aa5-aadf-4510-93a9-e4cd9fc4895b', 'business_owner'),
    ('d87c4aa5-aadf-4510-93a9-e4cd9fc4895b', 'admin'),
    ('10dbeb30-e599-4422-9fbf-6ee956b3c212', 'user'),
    ('10dbeb30-e599-4422-9fbf-6ee956b3c212', 'business_owner'),
    ('10dbeb30-e599-4422-9fbf-6ee956b3c212', 'admin'),
    ('b264d82b-9891-40c1-b2db-b6440a86ea80', 'user'),
    ('b264d82b-9891-40c1-b2db-b6440a86ea80', 'business_owner'),
    ('b264d82b-9891-40c1-b2db-b6440a86ea80', 'admin');

  RAISE NOTICE 'M3 (Owner/Admin) PERFUNDOI: 3 llogari te sakta tani te TARGET, duke perputhur SOURCE.';
END $$;
;
