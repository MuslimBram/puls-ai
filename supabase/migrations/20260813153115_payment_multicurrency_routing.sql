
-- ══════════════════════════════════════════════════════════════════
-- MULTI-CURRENCY ROUTING v1
-- Adds explicit price matrix to pricing_settings (values NOT changed).
-- country_currency_routing table for admin-managed geo routing.
-- ══════════════════════════════════════════════════════════════════

-- 1. Explicit price matrix on pricing_settings
--    EUR = canonical/base.  ALL = Albanian market.  USD = US market.
--    NULL = not yet configured → fall back to FX preview (informational only).
ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS monthly_price_eur  numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_price_usd  numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_price_all  numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS annual_price_eur   numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS annual_price_usd   numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS annual_price_all   numeric DEFAULT NULL;

COMMENT ON COLUMN pricing_settings.monthly_price_eur IS 'Explicit EUR monthly price. NULL = use FX preview from ALL canonical price. Set before enabling EUR checkout.';
COMMENT ON COLUMN pricing_settings.monthly_price_usd IS 'Explicit USD monthly price. NULL = use FX preview. Set before enabling USD checkout.';
COMMENT ON COLUMN pricing_settings.monthly_price_all IS 'Explicit ALL monthly price. NULL = use monthly_price (legacy canonical). Canonical ALL price is already in monthly_price.';

-- Back-fill ALL columns from existing canonical monthly_price / annual_price
UPDATE pricing_settings
SET monthly_price_all = monthly_price,
    annual_price_all  = annual_price
WHERE monthly_price_all IS NULL;

-- 2. Country → currency routing config
--    Admin-managed. Frontend uses this to determine default currency per country.
CREATE TABLE IF NOT EXISTS country_currency_routing (
  country_code   text PRIMARY KEY,    -- ISO 3166-1 alpha-2, e.g. 'AL', 'US', 'DE'
  currency       text NOT NULL,       -- 'ALL' | 'EUR' | 'USD'
  region_label   text,                -- 'Albania' | 'European Union' | 'United States'
  is_sepa        boolean DEFAULT false,
  notes          text,
  updated_at     timestamptz DEFAULT now()
);

COMMENT ON TABLE country_currency_routing IS
  'Maps country codes to default payment currencies. Admin-managed. Frontend reads this to pre-select currency.';

-- Seed canonical routing
INSERT INTO country_currency_routing (country_code, currency, region_label, is_sepa) VALUES
  -- Albania
  ('AL', 'ALL', 'Albania', false),
  -- Kosovo (uses EUR but ALB market close)
  ('XK', 'EUR', 'Kosovo', false),
  -- SEPA / Eurozone
  ('AT', 'EUR', 'Austria', true),
  ('BE', 'EUR', 'Belgium', true),
  ('BG', 'EUR', 'Bulgaria', true),
  ('CY', 'EUR', 'Cyprus', true),
  ('CZ', 'EUR', 'Czechia', true),
  ('DE', 'EUR', 'Germany', true),
  ('DK', 'EUR', 'Denmark', true),
  ('EE', 'EUR', 'Estonia', true),
  ('ES', 'EUR', 'Spain', true),
  ('FI', 'EUR', 'Finland', true),
  ('FR', 'EUR', 'France', true),
  ('GB', 'EUR', 'United Kingdom', true),
  ('GR', 'EUR', 'Greece', true),
  ('HR', 'EUR', 'Croatia', true),
  ('HU', 'EUR', 'Hungary', true),
  ('IE', 'EUR', 'Ireland', true),
  ('IT', 'EUR', 'Italy', true),
  ('LT', 'EUR', 'Lithuania', true),
  ('LU', 'EUR', 'Luxembourg', true),
  ('LV', 'EUR', 'Latvia', true),
  ('ME', 'EUR', 'Montenegro', false),
  ('MK', 'EUR', 'North Macedonia', false),
  ('MT', 'EUR', 'Malta', true),
  ('NL', 'EUR', 'Netherlands', true),
  ('NO', 'EUR', 'Norway', true),
  ('PL', 'EUR', 'Poland', true),
  ('PT', 'EUR', 'Portugal', true),
  ('RO', 'EUR', 'Romania', true),
  ('RS', 'EUR', 'Serbia', false),
  ('SE', 'EUR', 'Sweden', true),
  ('SI', 'EUR', 'Slovenia', true),
  ('SK', 'EUR', 'Slovakia', true),
  ('CH', 'EUR', 'Switzerland', true),
  -- USA / USD
  ('US', 'USD', 'United States', false),
  ('CA', 'USD', 'Canada', false)
ON CONFLICT (country_code) DO NOTHING;

-- RLS: public read (needed at checkout)
ALTER TABLE country_currency_routing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_routing" ON country_currency_routing FOR SELECT USING (true);
CREATE POLICY "admin_manage_routing" ON country_currency_routing FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','super_admin'))
);

-- 3. Add fee disclosure flag + receiving currency to payment_method_config
ALTER TABLE payment_method_config
  ADD COLUMN IF NOT EXISTS receiving_currency text,
  ADD COLUMN IF NOT EXISTS conversion_warning boolean DEFAULT false;

COMMENT ON COLUMN payment_method_config.receiving_currency IS
  'The actual currency the receiving account holds. If different from charged_currency, show conversion warning.';
COMMENT ON COLUMN payment_method_config.conversion_warning IS
  'True when receiving account currency != typical charged currency — triggers fee/conversion disclosure.';

-- Update existing rows with receiving_currency matching their currency
UPDATE payment_method_config SET
  receiving_currency = currency,
  conversion_warning = false
WHERE receiving_currency IS NULL;
;
