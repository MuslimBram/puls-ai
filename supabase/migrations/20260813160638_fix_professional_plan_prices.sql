
-- professional = 39900 ALL / 439 EUR / 499 USD (was mislabeled growth=19900, professional=39900)
UPDATE pricing_settings SET monthly_price_all=39900, monthly_price_eur=439, monthly_price_usd=499,
  annual_price_all=406980, annual_price_eur=4474, annual_price_usd=5090
WHERE plan_key='professional';
-- growth = 19900 ALL / 219 EUR / 249 USD
UPDATE pricing_settings SET monthly_price_all=19900, monthly_price_eur=219, monthly_price_usd=249,
  annual_price_all=202980, annual_price_eur=2232, annual_price_usd=2540
WHERE plan_key='growth';
;
