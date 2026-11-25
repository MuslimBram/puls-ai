DO $$
DECLARE
  v_user1 uuid := 'b3ddc738-0bd3-4341-b847-65f06cf44585';
  v_orig_status text;
  v_orig_alert_style text;
  v_post_id uuid;
  v_ai_cat text;
  v_ai_conf numeric;
  v_service_tax numeric;
BEGIN
  SELECT verification_status, alert_style INTO v_orig_status, v_orig_alert_style FROM public.community_profiles WHERE user_id = v_user1;
  UPDATE public.community_profiles SET verification_status = 'approved', approved_at = now() WHERE user_id = v_user1;

  -- A) alert_style: default + kufizim vlerash
  IF v_orig_alert_style IS DISTINCT FROM 'normal' THEN
    RAISE EXCEPTION 'GABIM: alert_style default duhej "normal", ishte %', v_orig_alert_style;
  END IF;
  BEGIN
    UPDATE public.community_profiles SET alert_style = 'invalid_value' WHERE user_id = v_user1;
    RAISE EXCEPTION 'GABIM: alert_style pranoi vlerë të pavlefshme!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'A) alert_style CHECK constraint funksionon — OK';
  END;
  UPDATE public.community_profiles SET alert_style = 'vibrate' WHERE user_id = v_user1;

  -- B) Postim me tekst "shitje" -> AI duhet të sugjerojë 'tregti' me besueshmëri të lartë
  INSERT INTO public.community_posts (author_user_id, title, description, category, price, city, status, service_tax,
    ai_suggested_category, ai_category_confidence)
  VALUES (v_user1, 'Shitet laptop Dell', 'Gjendje shumë e mirë, çmim negociabël, produkt origjinal', 'tregti', 4500, 'Tiranë', 'active',
    community_calculate_service_tax('tregti', 4500),
    (community_suggest_category('Shitet laptop Dell', 'Gjendje shumë e mirë, çmim negociabël, produkt origjinal')->>'category'),
    (community_suggest_category('Shitet laptop Dell', 'Gjendje shumë e mirë, çmim negociabël, produkt origjinal')->>'confidence')::numeric)
  RETURNING id, ai_suggested_category, ai_category_confidence, service_tax INTO v_post_id, v_ai_cat, v_ai_conf, v_service_tax;

  IF v_ai_cat IS DISTINCT FROM 'tregti' THEN
    RAISE EXCEPTION 'GABIM: AI duhej të sugjeronte tregti, sugjeroi %', v_ai_cat;
  END IF;
  IF v_service_tax IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'REGRESION FAZA 3: service_tax duhej 100, doli %', v_service_tax;
  END IF;

  RAISE NOTICE 'B) ai_suggested_category=% (besueshmëri %) — OK, dhe service_tax=% (regresion Faza 3 OK)', v_ai_cat, v_ai_conf, v_service_tax;

  -- Pastrim
  DELETE FROM public.community_posts WHERE id = v_post_id;
  UPDATE public.community_profiles SET verification_status = v_orig_status, approved_at = NULL, alert_style = v_orig_alert_style, updated_at = now() WHERE user_id = v_user1;

  RAISE NOTICE 'FAZA 4 (backend) VERIFIKIMI PERFUNDOI ME SUKSES';
END $$;
;
