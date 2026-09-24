-- R112 P0 — canonical channel/website entitlement catalog
-- Keep customer-facing plan keys aligned with pricing_settings:
-- standard < professional < advanced < enterprise.
--
-- Legacy "growth" is retired; map it to the current Professional tier.
UPDATE public.channel_registry
SET min_plan = 'professional'
WHERE min_plan = 'growth';

-- Canonical customer channel quotas requested for the commercial plans:
-- Standard = 2, Professional = 4, Advanced = 8, Enterprise = unlimited.
UPDATE public.pricing_settings SET channels_limit = 2 WHERE plan_key = 'standard';
UPDATE public.pricing_settings SET channels_limit = 4 WHERE plan_key = 'professional';
UPDATE public.pricing_settings SET channels_limit = 8 WHERE plan_key = 'advanced';
UPDATE public.pricing_settings SET channels_limit = -1 WHERE plan_key = 'enterprise';

-- Website Chat is a billable/customer capability and must be visible in the
-- same catalog used by the channel entitlements. Add/reconcile it safely.
INSERT INTO public.channel_registry (
  id,
  name,
  category,
  description,
  is_available,
  integration_status,
  credential_fields,
  min_plan,
  supported_modes,
  professional_capabilities,
  personal_capabilities,
  account_type_label
)
VALUES (
  'website_chat',
  'Website Chat',
  'website',
  'Website chat widget',
  true,
  'setup_ready',
  '[]'::jsonb,
  'standard',
  '["professional"]'::jsonb,
  '["messaging","inbox","notifications"]'::jsonb,
  '[]'::jsonb,
  'Website'
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_available = EXCLUDED.is_available,
  integration_status = EXCLUDED.integration_status,
  min_plan = EXCLUDED.min_plan,
  supported_modes = EXCLUDED.supported_modes,
  professional_capabilities = EXCLUDED.professional_capabilities,
  personal_capabilities = EXCLUDED.personal_capabilities,
  account_type_label = EXCLUDED.account_type_label;
