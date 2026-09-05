-- Staging-safe admin seed: only assign the role when the auth user exists.
INSERT INTO public.user_roles (user_id, role)
SELECT '2377e9fa-6e45-4dfb-8436-ab14f4909409'::uuid, 'admin'::public.app_role
WHERE EXISTS (
  SELECT 1 FROM auth.users
  WHERE id = '2377e9fa-6e45-4dfb-8436-ab14f4909409'::uuid
)
ON CONFLICT (user_id, role) DO NOTHING;
