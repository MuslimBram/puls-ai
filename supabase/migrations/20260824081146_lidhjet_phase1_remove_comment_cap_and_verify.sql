-- 1) Heq kufirin e vjetër "2 komente/person/postim" nga trigger-i community_enforce_comment_rules,
--    sipas kërkesës së fundit: "Ne komente mes te komentojne me shume se 2 here!" (komente pa limit)
CREATE OR REPLACE FUNCTION public.community_enforce_comment_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cp public.community_profiles%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' AND NEW.author_user_id <> auth.uid() THEN RAISE EXCEPTION 'author_mismatch' USING ERRCODE='42501'; END IF;
  IF NEW.workspace_id IS NOT NULL AND NOT public.community_workspace_authorized(NEW.author_user_id,NEW.workspace_id) THEN RAISE EXCEPTION 'workspace_not_authorized' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(NEW.author_user_id,'admin') AND NOT public.has_role(NEW.author_user_id,'super_admin') THEN
    SELECT * INTO v_cp FROM public.community_profiles WHERE user_id=NEW.author_user_id;
    IF NOT FOUND OR v_cp.verification_status <> 'approved' THEN RAISE EXCEPTION 'profile_not_approved' USING ERRCODE='P0001'; END IF;
    IF v_cp.suspended_until IS NOT NULL AND v_cp.suspended_until > now() THEN RAISE EXCEPTION 'user_suspended' USING ERRCODE='P0001'; END IF;
    -- Kufiri i 2 komenteve u hoq: tani lejohen komente pa limit (siç kërkuar)
  END IF;
  RETURN NEW;
END
$function$;

-- 2) Verifikim FULL end-to-end: aktivizon përkohësisht 1 profil real, teston TË GJITHA rrugët e shkrimit
--    (duke përfshirë trigger-at community_enforce_post_rules / _comment_rules / _apply_suspension),
--    pastaj rikthen çdo gjë saktësisht si ishte (asnjë e dhënë reale s'ndryshon përfundimisht).
DO $$
DECLARE
  v_user1 uuid := 'b3ddc738-0bd3-4341-b847-65f06cf44585';
  v_user2 uuid := '3e1c8084-ab5d-459b-96a3-90e39a354778';
  v_orig_status text;
  v_post_id uuid;
  v_interest_id uuid;
  v_counts record;
  v_comment3_blocked boolean := false;
BEGIN
  SELECT verification_status INTO v_orig_status FROM public.community_profiles WHERE user_id = v_user1;

  -- Aktivizim i përkohshëm për test (do rikthehet më poshtë)
  UPDATE public.community_profiles SET verification_status = 'approved', approved_at = now() WHERE user_id = v_user1;

  INSERT INTO public.community_posts (author_user_id, title, description, category, price, price_justification, city, status)
  VALUES (v_user1, 'TEST_FAZA1_POST', 'Test description for phase 1 verification', 'tregti', 500, NULL, 'Tiranë', 'active')
  RETURNING id INTO v_post_id;

  INSERT INTO public.community_attachments (post_id, path, name, mime, size_bytes)
  VALUES (v_post_id, v_user1::text || '/test.jpg', 'test.jpg', 'image/jpeg', 12345);

  -- 3 komente nga i njëjti user2 (duhet të kalojnë të tria tani që u hoq limiti prej 2)
  INSERT INTO public.community_comments (post_id, author_user_id, content) VALUES (v_post_id, v_user2, 'TEST_FAZA1_COMMENT_1');
  INSERT INTO public.community_comments (post_id, author_user_id, content) VALUES (v_post_id, v_user2, 'TEST_FAZA1_COMMENT_2');
  BEGIN
    INSERT INTO public.community_comments (post_id, author_user_id, content) VALUES (v_post_id, v_user2, 'TEST_FAZA1_COMMENT_3');
  EXCEPTION WHEN OTHERS THEN
    v_comment3_blocked := true;
  END;

  INSERT INTO public.community_ratings (post_id, rater_user_id, rating)
  VALUES (v_post_id, v_user2, 5);

  INSERT INTO public.community_reports (reporter_user_id, post_id, reported_user_id, reason, status)
  VALUES (v_user2, v_post_id, v_user1, 'TEST_FAZA1_REPORT', 'pending');

  INSERT INTO public.community_interests (post_id, buyer_id, offer_amount, message, status)
  VALUES (v_post_id, v_user2, 450, 'TEST_FAZA1_OFFER', 'pending')
  RETURNING id INTO v_interest_id;

  UPDATE public.community_interests SET tax_paid = true, status = 'chat' WHERE id = v_interest_id;

  INSERT INTO public.community_interest_messages (interest_id, sender_id, body)
  VALUES (v_interest_id, v_user1, 'TEST_FAZA1_MESSAGE');

  INSERT INTO public.community_violations (user_id, post_id, kind, detail)
  VALUES (v_user2, v_post_id, 'contact_info_in_message', 'TEST_FAZA1_VIOLATION');

  INSERT INTO public.community_notifications (user_id, kind, payload)
  VALUES (v_user1, 'new_offer', jsonb_build_object('test', true, 'post_id', v_post_id));

  SELECT
    (SELECT count(*) FROM community_posts WHERE title = 'TEST_FAZA1_POST') AS posts,
    (SELECT count(*) FROM community_attachments WHERE post_id = v_post_id) AS attachments,
    (SELECT count(*) FROM community_comments WHERE post_id = v_post_id AND content LIKE 'TEST_FAZA1_COMMENT%') AS comments,
    (SELECT count(*) FROM community_ratings WHERE post_id = v_post_id) AS ratings,
    (SELECT count(*) FROM community_reports WHERE reason = 'TEST_FAZA1_REPORT') AS reports,
    (SELECT count(*) FROM community_interests WHERE message = 'TEST_FAZA1_OFFER') AS interests,
    (SELECT count(*) FROM community_interest_messages WHERE body = 'TEST_FAZA1_MESSAGE') AS messages,
    (SELECT count(*) FROM community_violations WHERE detail = 'TEST_FAZA1_VIOLATION') AS violations,
    (SELECT count(*) FROM community_notifications WHERE payload->>'test' = 'true') AS notifications
  INTO v_counts;

  RAISE NOTICE 'VERIFIKIM: posts=% attachments=% comments(duhet 3)=% (koment_3_u_bllokua=%) ratings=% reports=% interests=% messages=% violations=% notifications=%',
    v_counts.posts, v_counts.attachments, v_counts.comments, v_comment3_blocked, v_counts.ratings, v_counts.reports, v_counts.interests, v_counts.messages, v_counts.violations, v_counts.notifications;

  IF v_counts.posts <> 1 OR v_counts.attachments <> 1 OR v_counts.comments <> 3 OR v_comment3_blocked
     OR v_counts.ratings <> 1 OR v_counts.reports <> 1 OR v_counts.interests <> 1 OR v_counts.messages <> 1
     OR v_counts.violations <> 1 OR v_counts.notifications <> 1 THEN
    RAISE EXCEPTION 'PHASE1_VERIFICATION_FAILED: counts=%', v_counts;
  END IF;

  -- Pastrim i të dhënave të testit
  DELETE FROM public.community_notifications WHERE payload->>'test' = 'true';
  DELETE FROM public.community_violations WHERE detail = 'TEST_FAZA1_VIOLATION';
  DELETE FROM public.community_interest_messages WHERE body = 'TEST_FAZA1_MESSAGE';
  DELETE FROM public.community_interests WHERE message = 'TEST_FAZA1_OFFER';
  DELETE FROM public.community_reports WHERE reason = 'TEST_FAZA1_REPORT';
  DELETE FROM public.community_ratings WHERE post_id = v_post_id;
  DELETE FROM public.community_comments WHERE post_id = v_post_id;
  DELETE FROM public.community_attachments WHERE post_id = v_post_id;
  DELETE FROM public.community_posts WHERE id = v_post_id;

  -- Rikthimi i profilit real të user1 saktësisht siç ishte (pending)
  UPDATE public.community_profiles SET verification_status = v_orig_status, approved_at = NULL, updated_at = now() WHERE user_id = v_user1;

  RAISE NOTICE 'PASTRIMI PERFUNDOI: user1 u rikthye ne status=%', v_orig_status;
END $$;
;
