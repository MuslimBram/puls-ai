DO $$
DECLARE
  v_user1 uuid := 'b3ddc738-0bd3-4341-b847-65f06cf44585';
  v_user2 uuid := '3e1c8084-ab5d-459b-96a3-90e39a354778';
  v_orig_status text;
  v_post_id uuid;
  v_att_id uuid;
  v_detect jsonb;
  v_counts record;
BEGIN
  -- A) Kontroll detektimi kontakti mbi tekst REALIST postimi (i njëjtë rregull që tani ekzekutohet te edge function para insert-it)
  v_detect := community_detect_contact_info('Shitet biçikletë Trek, gjendje shumë e mirë, çmim negociabël');
  IF (v_detect->>'has_contact')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALSE POSITIVE: tekst normal u shënua si kontakt: %', v_detect;
  END IF;

  v_detect := community_detect_contact_info('Interesuar? Më shkruani në whatsapp.com/message/ABC123');
  IF (v_detect->>'has_contact')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALSE NEGATIVE: link whatsapp nuk u kap: %', v_detect;
  END IF;

  v_detect := community_detect_contact_info('Kontaktoni në ana.shitje@gmail.com për detaje');
  IF (v_detect->>'has_contact')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALSE NEGATIVE: email nuk u kap: %', v_detect;
  END IF;

  RAISE NOTICE 'A) Detektimi i kontaktit: OK (pa false-positive, kapi email + link mesazherie)';

  -- B) Regresion i plotë FAZA 1 (i njëjti test si më parë, për të konfirmuar që FAZA 2 s'e prishi asgjë)
  SELECT verification_status INTO v_orig_status FROM public.community_profiles WHERE user_id = v_user1;
  UPDATE public.community_profiles SET verification_status = 'approved', approved_at = now() WHERE user_id = v_user1;

  INSERT INTO public.community_posts (author_user_id, title, description, category, price, price_justification, city, status)
  VALUES (v_user1, 'TEST_FAZA2_POST', 'Test description clean, no contact info here', 'tregti', 500, NULL, 'Tiranë', 'active')
  RETURNING id INTO v_post_id;

  -- C) Kolonat e reja të skanimit (scan_status/scan_notes/scanned_at) pranojnë vlera korrekte
  INSERT INTO public.community_attachments (post_id, path, name, mime, size_bytes, scan_status, scan_notes, scanned_at)
  VALUES (v_post_id, v_user1::text || '/test.jpg', 'test.jpg', 'image/jpeg', 12345, 'clean', 'TEST_FAZA2_SCAN_NOTE', now())
  RETURNING id INTO v_att_id;

  -- D) scan_status refuzon vlera të pavlefshme (duhet të dështojë me qëllim)
  BEGIN
    INSERT INTO public.community_attachments (post_id, path, name, mime, size_bytes, scan_status)
    VALUES (v_post_id, v_user1::text || '/bad.jpg', 'bad.jpg', 'image/jpeg', 100, 'invalid_status_value');
    RAISE EXCEPTION 'GABIM: scan_status pranoi një vlerë të pavlefshme!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'D) CHECK constraint i scan_status funksionon (refuzoi vlerë të pavlefshme) — OK';
  END;

  INSERT INTO public.community_comments (post_id, author_user_id, content) VALUES (v_post_id, v_user2, 'TEST_FAZA2_COMMENT_1');
  INSERT INTO public.community_comments (post_id, author_user_id, content) VALUES (v_post_id, v_user2, 'TEST_FAZA2_COMMENT_2');
  INSERT INTO public.community_comments (post_id, author_user_id, content) VALUES (v_post_id, v_user2, 'TEST_FAZA2_COMMENT_3');

  SELECT
    (SELECT count(*) FROM community_posts WHERE title = 'TEST_FAZA2_POST') AS posts,
    (SELECT count(*) FROM community_attachments WHERE post_id = v_post_id AND scan_status = 'clean') AS attachments_clean,
    (SELECT count(*) FROM community_comments WHERE post_id = v_post_id) AS comments
  INTO v_counts;

  IF v_counts.posts <> 1 OR v_counts.attachments_clean <> 1 OR v_counts.comments <> 3 THEN
    RAISE EXCEPTION 'REGRESION FAZA 1 DESHTOI: %', v_counts;
  END IF;
  RAISE NOTICE 'B/C) Regresioni FAZA 1 + kolonat e skanimit: OK — posts=% attachments_clean=% comments=%', v_counts.posts, v_counts.attachments_clean, v_counts.comments;

  -- Pastrim + rikthim profili
  DELETE FROM public.community_comments WHERE post_id = v_post_id;
  DELETE FROM public.community_attachments WHERE post_id = v_post_id;
  DELETE FROM public.community_posts WHERE id = v_post_id;
  UPDATE public.community_profiles SET verification_status = v_orig_status, approved_at = NULL, updated_at = now() WHERE user_id = v_user1;

  RAISE NOTICE 'FAZA 2 VERIFIKIMI PERFUNDOI ME SUKSES';
END $$;
;
