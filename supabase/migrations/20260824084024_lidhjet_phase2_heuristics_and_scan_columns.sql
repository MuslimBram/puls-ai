-- FAZA 2 (Lidhjet): funksione heuristike të testueshme + kolona për rezultatin e skanimit të bashkëngjitjeve

-- 1) Email i përkohshëm/disposable
CREATE OR REPLACE FUNCTION public.community_is_disposable_email(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_email !~ '^[^@]+@[^@]+\.[^@]+$'  -- format i pavlefshëm trajtohet si i dyshimtë
    OR lower(split_part(p_email, '@', 2)) = ANY(ARRAY[
      'mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','temp-mail.org',
      'yopmail.com','trashmail.com','throwaway.email','dispostable.com','fakeinbox.com',
      'getnada.com','maildrop.cc','spambog.com','mailnesia.com','mintemail.com','sharklasers.com',
      'guerrillamailblock.com','tempinbox.com','emailondeck.com','moakt.com','mohmal.com',
      'tempr.email','burnermail.io','discard.email','mailcatch.com','spamgourmet.com'
    ]);
$$;

-- 2) Numër telefoni i dyshimtë (shumë i shkurtër, shifra të përsëritura, pa prefiks)
CREATE OR REPLACE FUNCTION public.community_is_suspicious_phone(p_phone text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
BEGIN
  IF length(v_digits) < 8 THEN RETURN true; END IF;
  IF v_digits ~ '^(\d)\1{6,}$' THEN RETURN true; END IF; -- p.sh. 0000000000
  IF v_digits ~ '(012345|123456|654321|098765)' THEN RETURN true; END IF; -- sekuenca
  RETURN false;
END;
$$;

-- 3) Validim emri (pa iniciale/numra/simbole, jo shumë i shkurtër)
CREATE OR REPLACE FUNCTION public.community_validate_name(p_first text, p_last text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_name_re text := '^[A-Za-zÀ-ÖØ-öø-ɏ\u1E00-\u1EFF''\-\s]+$';
BEGIN
  IF p_first IS NULL OR p_last IS NULL OR trim(p_first) = '' OR trim(p_last) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Emri dhe mbiemri janë të detyrueshëm.');
  END IF;
  IF NOT (p_first ~ v_name_re) OR NOT (p_last ~ v_name_re) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Emri/mbiemri përmban numra ose simbole të palejuara.');
  END IF;
  IF length(trim(p_first)) < 2 OR length(trim(p_last)) < 2 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Emri ose mbiemri është shumë i shkurtër (mund të jetë inicial).');
  END IF;
  IF length(trim(p_first)) <= 2 AND length(trim(p_last)) <= 2 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Emri dhe mbiemri janë të dy shumë të shkurtër — ju lutemi shpjegoni nëse është emër i vërtetë.');
  END IF;
  RETURN jsonb_build_object('valid', true, 'reason', null);
END;
$$;

-- 4) Detektim kontakti (email/telefon/link mesazherie) — pasqyron detectContactInformation() nga TS, për testim/riperdorim
CREATE OR REPLACE FUNCTION public.community_detect_contact_info(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_email text;
  v_link text;
  v_phone_digits text;
BEGIN
  IF p_text IS NULL OR p_text = '' THEN
    RETURN jsonb_build_object('has_contact', false);
  END IF;

  v_email := substring(p_text FROM '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}');
  IF v_email IS NOT NULL THEN
    RETURN jsonb_build_object('has_contact', true, 'type', 'email', 'match', v_email);
  END IF;

  v_link := substring(p_text FROM '(wa\.me|t\.me|telegram\.me|whatsapp\.com|instagram\.com|facebook\.com|viber\.com)/[A-Za-z0-9_.-]+');
  IF v_link IS NOT NULL THEN
    RETURN jsonb_build_object('has_contact', true, 'type', 'messaging_link', 'match', v_link);
  END IF;

  IF p_text ~* '\y(ig|insta|telegram|tg|whatsapp|wa|viber)\s*[:=]\s*@?[A-Za-z0-9_.-]+' THEN
    RETURN jsonb_build_object('has_contact', true, 'type', 'social_handle', 'match',
      substring(p_text FROM '\y(ig|insta|telegram|tg|whatsapp|wa|viber)\s*[:=]\s*@?[A-Za-z0-9_.-]+'));
  END IF;

  v_phone_digits := (regexp_matches(p_text, '(\+?\d[\d\-.\s]{6,}\d)'))[1];
  IF v_phone_digits IS NOT NULL AND length(regexp_replace(v_phone_digits, '\D', '', 'g')) >= 7 THEN
    RETURN jsonb_build_object('has_contact', true, 'type', 'phone', 'match', v_phone_digits);
  END IF;

  RETURN jsonb_build_object('has_contact', false);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('has_contact', false);
END;
$$;

-- 5) Kolona për rezultatin e skanimit të bashkëngjitjeve (mungonin plotësisht)
ALTER TABLE public.community_attachments
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending','clean','flagged','blocked')),
  ADD COLUMN IF NOT EXISTS scan_notes text,
  ADD COLUMN IF NOT EXISTS scanned_at timestamptz;
;
