UPDATE public.pricing_settings SET monthly_price = 59, annual_price = 566, updated_at = now() WHERE plan_key = 'standard' AND is_donation = false;
UPDATE public.pricing_settings SET monthly_price = 119, annual_price = 1142, updated_at = now() WHERE plan_key = 'professional' AND is_donation = false;
UPDATE public.pricing_settings SET monthly_price = 229, annual_price = 2198, updated_at = now() WHERE plan_key = 'advanced' AND is_donation = false;
UPDATE public.pricing_settings SET monthly_price = 449, annual_price = 4310, updated_at = now() WHERE plan_key = 'enterprise' AND is_donation = false;