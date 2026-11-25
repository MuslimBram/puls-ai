-- FAZA 4 (Lidhjet): njoftime (dridhje/beep/normal/heshtje) + kategorizim AI (informativ, s'e anulon zgjedhjen e përdoruesit)

-- 1) alert_style = SI sinjalizon pajisja (dridhje/beep/normal/heshtje) — E NDARË nga notification_mode ekzistues
--    (notification_mode = KU dërgohet: in_app/email/both/off — koncept i ndryshëm, s'e zëvendësojmë)
ALTER TABLE public.community_profiles
  ADD COLUMN IF NOT EXISTS alert_style text NOT NULL DEFAULT 'normal'
    CHECK (alert_style IN ('vibrate','beep','normal','silent'));

-- 2) Kategorizim AI (informativ/analitik — NUK anulon kategorinë e deklaruar nga postuesi, vetëm e sugjeron)
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS ai_suggested_category text,
  ADD COLUMN IF NOT EXISTS ai_category_confidence numeric;

CREATE OR REPLACE FUNCTION public.community_suggest_category(p_title text, p_description text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text := lower(coalesce(p_title,'') || ' ' || coalesce(p_description,''));
  v_pune_score int := 0;
  v_sherbim_score int := 0;
  v_tregti_score int := 0;
BEGIN
  -- 'punë' — vend pune, rekrutim
  IF v_text ~ '(pun[eë]|rekrutim|shpallje pun[eë]|k[eë]rkohet|CV|orar pune|pages[eë] mujore|kontrat[eë] pune)' THEN
    v_pune_score := v_pune_score + 2;
  END IF;
  -- 'shërbim' — konsulencë, riparim, mësimdhënie
  IF v_text ~ '(sh[eë]rbim|konsulenc|riparim|instalim|m[eë]simdh[eë]nie|asistenc[eë]|pastrim|transport|ndihm[eë])' THEN
    v_sherbim_score := v_sherbim_score + 2;
  END IF;
  -- 'tregti' — shitje, blerje, produkt
  IF v_text ~ '(shes|shitet|blej|shitje|blerje|produkt|artikull|çmim|negociab[eë]l|gjendje e mir[eë])' THEN
    v_tregti_score := v_tregti_score + 2;
  END IF;

  IF v_pune_score = 0 AND v_sherbim_score = 0 AND v_tregti_score = 0 THEN
    RETURN jsonb_build_object('category', 'tjeter', 'confidence', 0.3);
  END IF;

  IF v_pune_score >= v_sherbim_score AND v_pune_score >= v_tregti_score THEN
    RETURN jsonb_build_object('category', 'pune', 'confidence', LEAST(0.95, 0.5 + v_pune_score * 0.15));
  ELSIF v_sherbim_score >= v_tregti_score THEN
    RETURN jsonb_build_object('category', 'sherbim', 'confidence', LEAST(0.95, 0.5 + v_sherbim_score * 0.15));
  ELSE
    RETURN jsonb_build_object('category', 'tregti', 'confidence', LEAST(0.95, 0.5 + v_tregti_score * 0.15));
  END IF;
END;
$$;
;
