-- White Label: çmime në Euro (vendim i pronarit, 2026-11-25)
--   monthly_price_eur  = tarifa mujore për databazën & AI-në
--   annual_licence_eur = licenca vjetore (zëvendëson tarifën e nisjes)
-- Kolonat e vjetra në Lek (monthly_licence, setup_fee) ruhen për historikun.
alter table public.white_label_packages
  add column if not exists monthly_price_eur numeric(10,2),
  add column if not exists annual_licence_eur numeric(10,2);

update public.white_label_packages set monthly_price_eur = 60,  annual_licence_eur = 1700, updated_at = now() where package_key = 'launch';
update public.white_label_packages set monthly_price_eur = 100, annual_licence_eur = 2800, updated_at = now() where package_key = 'growth';
update public.white_label_packages set monthly_price_eur = 180, annual_licence_eur = 4500, updated_at = now() where package_key = 'agency';
