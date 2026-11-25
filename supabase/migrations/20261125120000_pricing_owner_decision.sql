-- Çmimet sipas vendimit të pronarit (2026-11-25).
-- 1) Paketat e bizneseve: imazhe/ditë, video/ditë, zbritja vjetore 20%,
--    çmimet EUR/USD sipas kursit 1 EUR = 88 ALL, 1 USD = 80 ALL.
--    Enterprise: çmimet dhe video mbeten siç janë (pret vendim).
update public.pricing_settings set
  daily_image_limit = 15, daily_video_seconds_limit = 60,
  annual_price = 95040, annual_price_all = 95040,
  monthly_price_eur = 112.50, monthly_price_usd = 123.75,
  annual_price_eur = 1080.00, annual_price_usd = 1188.00
where plan_key = 'standard';

update public.pricing_settings set
  channels_limit = 7, daily_image_limit = 50, daily_video_seconds_limit = 300,
  annual_price = 191040, annual_price_all = 191040,
  monthly_price_eur = 226.14, monthly_price_usd = 248.75,
  annual_price_eur = 2170.91, annual_price_usd = 2388.00
where plan_key = 'professional';

update public.pricing_settings set
  channels_limit = 15, daily_image_limit = 500, daily_video_seconds_limit = 600,
  annual_price = 383040, annual_price_all = 383040,
  monthly_price_eur = 453.41, monthly_price_usd = 498.75,
  annual_price_eur = 4352.73, annual_price_usd = 4788.00
where plan_key = 'advanced';

-- 2) White Label: investim një herë + mirëmbajtje mujore (në Lek) + kapaciteti i klientëve.
alter table public.white_label_packages
  add column if not exists one_time_price_all numeric(14,2),
  add column if not exists monthly_maintenance_all numeric(14,2);

update public.white_label_packages set name = 'White Label – Limited',           one_time_price_all = 1000000,  monthly_maintenance_all = 50000,  included_clients = 50,  updated_at = now() where package_key = 'launch';
update public.white_label_packages set name = 'White Label – Unlimited',         one_time_price_all = 5000000,  monthly_maintenance_all = 100000, included_clients = 300, updated_at = now() where package_key = 'growth';
update public.white_label_packages set name = 'White Label – Premium Unlimited', one_time_price_all = 10000000, monthly_maintenance_all = 200000, included_clients = -1,  updated_at = now() where package_key = 'agency';
