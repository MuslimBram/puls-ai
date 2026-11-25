-- Verifikim FAZA 3 pa prekur portofole/pagesa reale — vetëm llogaritja dhe ruajtja e taksës
DO $$
DECLARE
  v_user1 uuid := 'b3ddc738-0bd3-4341-b847-65f06cf44585';
  v_user2 uuid := '3e1c8084-ab5d-459b-96a3-90e39a354778';
  v_orig_status text;
  v_post_id uuid;
  v_interest_id uuid;
  v_service_tax numeric;
  v_tax_amount numeric;
BEGIN
  SELECT verification_status INTO v_orig_status FROM public.community_profiles WHERE user_id = v_user1;
  UPDATE public.community_profiles SET verification_status = 'approved', approved_at = now() WHERE user_id = v_user1;

  -- Postim me çmim 4500 (kategoria 'tregti') -> pritet service_tax 100L
  INSERT INTO public.community_posts (author_user_id, title, description, category, price, city, status, service_tax)
  VALUES (v_user1, 'TEST_FAZA3_POST', 'Test description i pastër, pa kontakt', 'tregti', 4500, 'Tiranë', 'active',
          community_calculate_service_tax('tregti', 4500))
  RETURNING id, service_tax INTO v_post_id, v_service_tax;

  IF v_service_tax IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'GABIM: service_tax duhej 100, doli %', v_service_tax;
  END IF;

  -- Ofertë nga user2 me shumë 5200 -> tax_amount duhet 200 (bazuar te oferta, jo te çmimi fillestar 4500)
  INSERT INTO public.community_interests (post_id, buyer_id, offer_amount, message, status, tax_amount)
  VALUES (v_post_id, v_user2, 5200, 'TEST_FAZA3_OFFER', 'pending', community_calculate_service_tax('tregti', 5200))
  RETURNING id, tax_amount INTO v_interest_id, v_tax_amount;

  IF v_tax_amount IS DISTINCT FROM 200 THEN
    RAISE EXCEPTION 'GABIM: tax_amount duhej 200, doli %', v_tax_amount;
  END IF;

  RAISE NOTICE 'FAZA 3 OK: post.service_tax=% (pritej 100), interest.tax_amount=% (pritej 200, nga oferta 5200 jo çmimi fillestar 4500)', v_service_tax, v_tax_amount;

  -- Pastrim (pa prekur wallets/community_settings/pagesa)
  DELETE FROM public.community_interests WHERE id = v_interest_id;
  DELETE FROM public.community_posts WHERE id = v_post_id;
  UPDATE public.community_profiles SET verification_status = v_orig_status, approved_at = NULL, updated_at = now() WHERE user_id = v_user1;

  RAISE NOTICE 'PASTRIMI PERFUNDOI ME SUKSES';
END $$;
;
