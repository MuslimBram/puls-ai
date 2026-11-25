-- FAZA 3 (Lidhjet): taksë shërbimi me shkallë çmimi (sipas specifikimit tuaj origjinal)
-- category=NULL do të thotë "vlen për të gjitha kategoritë" (universal) — struktura lejon
-- mbivendosje kategori-specifike në të ardhmen pa migrim të ri, siç e përmendët ("AI do vendosë duke parë tregun").

CREATE TABLE public.community_tax_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NULL,  -- NULL = universal (aplikohet kur s'ka rregull kategori-specifike)
  min_price numeric NOT NULL,
  max_price numeric NOT NULL,
  tax_amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_tax_bands_range_check CHECK (max_price > min_price),
  CONSTRAINT community_tax_bands_tax_positive CHECK (tax_amount >= 0)
);

ALTER TABLE public.community_tax_bands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_tax_bands_select" ON public.community_tax_bands FOR SELECT USING (true);

-- Shkallët universale (0-950 mbulon edhe çmimet nën 500, pasi specifikimi nuk përcaktoi diçka të veçantë atje)
INSERT INTO public.community_tax_bands (category, min_price, max_price, tax_amount) VALUES
  (NULL, 0,       950,     50),
  (NULL, 950.01,  4950,    100),
  (NULL, 4950.01, 9950,    200),
  (NULL, 9950.01, 49950,   500),
  (NULL, 49950.01, 99950,  1000),
  (NULL, 99950.01, 499950, 2000),
  (NULL, 499950.01, 999950, 5000);

-- Funksioni i llogaritjes: kërkon fillimisht band kategori-specifik, pastaj universal,
-- dhe për çmime mbi shkallën më të lartë (999,950) vazhdon me 0.5% (raporti i shkallës së fundit) në vend që të mbetet i pambuluar.
CREATE OR REPLACE FUNCTION public.community_calculate_service_tax(p_category text, p_price numeric)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tax numeric;
BEGIN
  IF p_price IS NULL OR p_price < 0 THEN
    RETURN 0;
  END IF;

  -- 1) provo band kategori-specifik (nëse ekziston ndonjëherë)
  SELECT tax_amount INTO v_tax
  FROM public.community_tax_bands
  WHERE category = p_category AND p_price BETWEEN min_price AND max_price
  LIMIT 1;

  IF v_tax IS NOT NULL THEN RETURN v_tax; END IF;

  -- 2) band universal
  SELECT tax_amount INTO v_tax
  FROM public.community_tax_bands
  WHERE category IS NULL AND p_price BETWEEN min_price AND max_price
  LIMIT 1;

  IF v_tax IS NOT NULL THEN RETURN v_tax; END IF;

  -- 3) mbi shkallën më të lartë (999,950): vazhdim me 0.5% (i njëjti raport si shkalla e fundit ~5000/999950)
  IF p_price > 999950 THEN
    RETURN round(p_price * 0.005, 0);
  END IF;

  RETURN 0;
END;
$$;
;
