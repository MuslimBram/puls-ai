-- ============================================================================
-- Lidhjet community module for Pulse — v2.3 ADDITIVE ONLY.
-- Does NOT touch: profiles, handle_new_user, user_roles, workspaces,
-- workspace_members, user_wallets, user_wallet_transactions, ai-router, …
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLES (FK-safe order: reports BEFORE violations — correction #1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.community_profiles (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_type           text CHECK (offer_type IN ('pune','sherbim','tregti','tjeter')),
  verification_status  text NOT NULL DEFAULT 'pending'
                       CHECK (verification_status IN ('pending','approved','rejected','clarify')),
  ai_risk_score        integer CHECK (ai_risk_score BETWEEN 0 AND 100),
  ai_notes             text,
  approved_at          timestamptz,
  review_ends_at       timestamptz,
  notifications_enabled boolean NOT NULL DEFAULT true,
  notification_mode    text NOT NULL DEFAULT 'in_app'
                       CHECK (notification_mode IN ('in_app','email','both','off')),
  suspended_until      timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id        uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  category            text NOT NULL CHECK (category IN ('pune','sherbim','tregti','tjeter')),
  title               text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description         text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 4000),
  price               numeric NOT NULL CHECK (price >= 0),
  price_justification text,
  service_tax         numeric NOT NULL DEFAULT 0,
  city                text,
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','closed','expired','removed')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id   uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  content        text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_ratings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  rater_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, rater_user_id)
);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id           uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason            text NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 120),
  detail            text CHECK (char_length(detail) <= 2000),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','reviewed','dismissed','confirmed')),
  reviewed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_reports_one_pending
  ON public.community_reports (reporter_user_id, post_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.community_violations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id          uuid REFERENCES public.community_posts(id) ON DELETE SET NULL,
  kind             text NOT NULL,
  detail           text,
  source_report_id uuid REFERENCES public.community_reports(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_violations_one_per_report
  ON public.community_violations (source_report_id) WHERE source_report_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.community_interests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  buyer_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_amount   numeric CHECK (offer_amount > 0),
  message        text,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','open','chat','declined','expired','closed')),
  tax_amount     numeric NOT NULL DEFAULT 0,
  tax_paid       boolean NOT NULL DEFAULT false,
  tax_paid_at    timestamptz,
  tax_eur        numeric,
  lek_per_eur    numeric,
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, buyer_id)
);

CREATE TABLE IF NOT EXISTS public.community_interest_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interest_id uuid NOT NULL REFERENCES public.community_interests(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  path       text NOT NULL,
  name       text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  mime       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_price_bands (
  category  text PRIMARY KEY CHECK (category IN ('pune','sherbim','tregti','tjeter')),
  min_price numeric NOT NULL CHECK (min_price >= 0),
  max_price numeric NOT NULL CHECK (max_price > min_price)
);

INSERT INTO public.community_price_bands (category, min_price, max_price) VALUES
  ('pune', 200, 200000),
  ('sherbim', 300, 300000),
  ('tregti', 100, 2000000),
  ('tjeter', 0, 5000000)
ON CONFLICT (category) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.community_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_ai_daily_counters (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module     text NOT NULL CHECK (module IN ('assess_profile','scan_image')),
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  PRIMARY KEY (user_id, module, usage_date)
);

CREATE TABLE IF NOT EXISTS public.community_ai_usage (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module       text NOT NULL CHECK (module IN ('assess_profile','scan_image')),
  via          text NOT NULL CHECK (via IN ('user_workspace','system_workspace')),
  workspace_id uuid,
  status       text NOT NULL DEFAULT 'reserved'
               CHECK (status IN ('reserved','completed','failed')),
  request_id   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS community_ai_usage_request_unique
  ON public.community_ai_usage (user_id, module, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_posts_author ON public.community_posts(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_feed ON public.community_posts(status, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_ws ON public.community_posts(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON public.community_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_ratings_post ON public.community_ratings(post_id);
CREATE INDEX IF NOT EXISTS idx_community_violations_user ON public.community_violations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_reports_post ON public.community_reports(post_id, status);
CREATE INDEX IF NOT EXISTS idx_community_reports_reporter ON public.community_reports(reporter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_interests_buyer ON public.community_interests(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_interest_msg ON public.community_interest_messages(interest_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_notif_user ON public.community_notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_ai_usage_user ON public.community_ai_usage(user_id, module, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.community_workspace_authorized(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _workspace_id IS NOT NULL AND _user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = _workspace_id AND w.owner_id = _user_id)
    OR public.is_workspace_member(_user_id, _workspace_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.community_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------------------
-- 3. PUBLIC RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_activate_profile(_offer_type text DEFAULT NULL)
RETURNS public.community_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.community_profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF _offer_type IS NOT NULL AND _offer_type NOT IN ('pune','sherbim','tregti','tjeter') THEN
    RAISE EXCEPTION 'invalid_offer_type' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.community_profiles (user_id, offer_type, verification_status, review_ends_at)
  VALUES (v_uid, _offer_type, 'pending', now() + interval '24 hours')
  ON CONFLICT (user_id) DO UPDATE
  SET offer_type = COALESCE(EXCLUDED.offer_type, community_profiles.offer_type),
      updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END
$func$;

CREATE OR REPLACE FUNCTION public.community_list_public_profiles()
RETURNS TABLE (user_id uuid, full_name text, avatar_url text, offer_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cp.user_id, p.full_name, p.avatar_url, cp.offer_type
  FROM public.community_profiles cp
  JOIN public.profiles p ON p.user_id = cp.user_id
  WHERE cp.verification_status = 'approved'
    AND (cp.suspended_until IS NULL OR cp.suspended_until < now());
$$;

-- ---------------------------------------------------------------------------
-- 4. ATOMIC SERVICE-TAX PAYMENT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_community_service_tax(_interest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_interest public.community_interests%ROWTYPE;
  v_post public.community_posts%ROWTYPE;
  v_wallet public.user_wallets%ROWTYPE;
  v_currency constant text := 'EUR';
  v_lek_per_eur numeric;
  v_tax_eur numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_interest FROM public.community_interests WHERE id = _interest_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'interest_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_post FROM public.community_posts WHERE id = v_interest.post_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'post_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_post.author_user_id <> v_uid THEN RAISE EXCEPTION 'forbidden_not_seller' USING ERRCODE = '42501'; END IF;
  IF v_interest.tax_paid THEN
    RETURN jsonb_build_object('ok', true, 'alreadyPaid', true, 'interest_id', v_interest.id, 'status', v_interest.status, 'tax_paid_at', v_interest.tax_paid_at);
  END IF;
  IF v_interest.expires_at < now() THEN RAISE EXCEPTION 'interest_expired' USING ERRCODE = 'P0001'; END IF;
  IF v_interest.status IN ('declined','closed','expired') THEN
    RAISE EXCEPTION 'interest_not_payable' USING ERRCODE = 'P0001', DETAIL = format('status=%s', v_interest.status);
  END IF;
  SELECT (value #>> '{}')::numeric INTO v_lek_per_eur FROM public.community_settings WHERE key = 'lek_per_eur';
  IF v_lek_per_eur IS NULL OR v_lek_per_eur <= 0 THEN
    RAISE EXCEPTION 'fx_not_configured' USING ERRCODE = 'P0001', DETAIL = 'Operator must provision community_settings.lek_per_eur before payments open.';
  END IF;
  v_tax_eur := round(v_interest.tax_amount / v_lek_per_eur, 2);
  SELECT * INTO v_wallet FROM public.user_wallets WHERE user_id = v_uid AND currency = v_currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_wallet.is_active THEN RAISE EXCEPTION 'wallet_inactive' USING ERRCODE = 'P0001'; END IF;
  IF v_wallet.current_balance < v_tax_eur THEN RAISE EXCEPTION 'insufficient_funds' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.user_wallets SET current_balance = current_balance - v_tax_eur, updated_at = now() WHERE id = v_wallet.id;
  INSERT INTO public.user_wallet_transactions
    (wallet_id, user_id, type, amount, currency, status, description, reference_id, metadata)
  VALUES
    (v_wallet.id, v_uid, 'community_service_tax', v_tax_eur, v_currency, 'completed',
     'Lidhjet service tax — chat unlock', _interest_id::text,
     jsonb_build_object('direction','debit','interest_id',v_interest.id,'post_id',v_post.id,'tax_lek',v_interest.tax_amount,'tax_eur',v_tax_eur,'lek_per_eur_used',v_lek_per_eur));
  UPDATE public.community_interests
  SET tax_paid = true, tax_paid_at = now(), status = 'chat', tax_eur = v_tax_eur, lek_per_eur = v_lek_per_eur, updated_at = now()
  WHERE id = v_interest.id AND tax_paid = false;
  INSERT INTO public.community_notifications (user_id, kind, payload)
  VALUES (v_interest.buyer_id, 'chat_opened', jsonb_build_object('interest_id',v_interest.id,'post_id',v_post.id));
  RETURN jsonb_build_object('ok',true,'alreadyPaid',false,'interest_id',v_interest.id,'status','chat','tax_eur',v_tax_eur,'tax_lek',v_interest.tax_amount,'lek_per_eur_used',v_lek_per_eur,'balance_after',v_wallet.current_balance-v_tax_eur);
END
$func$;

-- ---------------------------------------------------------------------------
-- 5. ATOMIC AI REQUEST CLAIM
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_community_ai_request(
  _user_id uuid, _module text, _daily_limit integer, _request_id text, _via text, _workspace_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_audit_id uuid;
  v_existing public.community_ai_usage%ROWTYPE;
  v_slot integer;
BEGIN
  IF _user_id IS NULL OR _request_id IS NULL OR btrim(_request_id) = '' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  IF _module NOT IN ('assess_profile','scan_image') THEN RAISE EXCEPTION 'invalid_module' USING ERRCODE='22023'; END IF;
  IF _via NOT IN ('user_workspace','system_workspace') THEN RAISE EXCEPTION 'invalid_via' USING ERRCODE='22023'; END IF;
  IF _via='system_workspace' AND (_daily_limit IS NULL OR _daily_limit <= 0) THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
  INSERT INTO public.community_ai_usage (user_id,module,via,workspace_id,status,request_id)
  VALUES (_user_id,_module,_via,_workspace_id,'reserved',_request_id)
  ON CONFLICT (user_id,module,request_id) WHERE request_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_audit_id;
  IF v_audit_id IS NULL THEN
    SELECT * INTO v_existing FROM public.community_ai_usage WHERE user_id=_user_id AND module=_module AND request_id=_request_id;
    RETURN jsonb_build_object('owner',false,'duplicate',true,'limited',false,'audit_id',v_existing.id,'status',v_existing.status);
  END IF;
  IF _via='system_workspace' THEN
    INSERT INTO public.community_ai_daily_counters (user_id,module,used_count)
    VALUES (_user_id,_module,1)
    ON CONFLICT (user_id,module,usage_date) DO UPDATE
    SET used_count = community_ai_daily_counters.used_count + 1
    WHERE community_ai_daily_counters.used_count < _daily_limit
    RETURNING used_count INTO v_slot;
    IF v_slot IS NULL THEN
      DELETE FROM public.community_ai_usage WHERE id=v_audit_id;
      RETURN jsonb_build_object('owner',false,'duplicate',false,'limited',true,'audit_id',NULL);
    END IF;
  END IF;
  RETURN jsonb_build_object('owner',true,'duplicate',false,'limited',false,'audit_id',v_audit_id,'status','reserved');
END
$func$;

-- ---------------------------------------------------------------------------
-- 6. ATOMIC REPORT REVIEW
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_community_report(_report_id uuid, _action text, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_report public.community_reports%ROWTYPE;
  v_violation_id uuid;
  v_new_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.community_is_staff() THEN RAISE EXCEPTION 'forbidden_not_staff' USING ERRCODE='42501'; END IF;
  IF _action NOT IN ('confirm','dismiss') THEN RAISE EXCEPTION 'invalid_action' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_report FROM public.community_reports WHERE id=_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found' USING ERRCODE='P0002'; END IF;
  IF v_report.status <> 'pending' THEN
    RETURN jsonb_build_object('ok',true,'alreadyReviewed',true,'alreadyConfirmed',v_report.status='confirmed','report_id',v_report.id,'status',v_report.status);
  END IF;
  v_new_status := CASE WHEN _action='confirm' THEN 'confirmed' ELSE 'dismissed' END;
  UPDATE public.community_reports SET status=v_new_status, reviewed_by=v_uid, reviewed_at=now() WHERE id=v_report.id;
  IF _action='confirm' THEN
    INSERT INTO public.community_violations (user_id,post_id,kind,detail,source_report_id)
    VALUES (v_report.reported_user_id,v_report.post_id,'moderation',COALESCE(_notes,v_report.reason),v_report.id)
    RETURNING id INTO v_violation_id;
  END IF;
  INSERT INTO public.community_notifications (user_id,kind,payload)
  VALUES (v_report.reporter_user_id,'report_reviewed',jsonb_build_object('report_id',v_report.id,'status',v_new_status));
  RETURN jsonb_build_object('ok',true,'alreadyReviewed',false,'alreadyConfirmed',false,'report_id',v_report.id,'status',v_new_status,'violation_id',v_violation_id);
END
$func$;

-- ---------------------------------------------------------------------------
-- 7. TRIGGERS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_enforce_post_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $func$
DECLARE v_cp public.community_profiles%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' AND NEW.author_user_id <> auth.uid() THEN RAISE EXCEPTION 'author_mismatch' USING ERRCODE='42501'; END IF;
  IF NEW.workspace_id IS NOT NULL AND NOT public.community_workspace_authorized(NEW.author_user_id, NEW.workspace_id) THEN RAISE EXCEPTION 'workspace_not_authorized' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(NEW.author_user_id,'admin') AND NOT public.has_role(NEW.author_user_id,'super_admin') THEN
    SELECT * INTO v_cp FROM public.community_profiles WHERE user_id=NEW.author_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'community_profile_required' USING ERRCODE='P0001'; END IF;
    IF v_cp.verification_status <> 'approved' THEN RAISE EXCEPTION 'profile_not_approved' USING ERRCODE='P0001'; END IF;
    IF v_cp.suspended_until IS NOT NULL AND v_cp.suspended_until > now() THEN RAISE EXCEPTION 'user_suspended' USING ERRCODE='P0001'; END IF;
    IF EXISTS (SELECT 1 FROM public.community_posts p WHERE p.author_user_id=NEW.author_user_id AND p.created_at > now()-interval '24 hours') THEN RAISE EXCEPTION 'rate_limit_one_post_per_24h' USING ERRCODE='P0001'; END IF;
  END IF;
  RETURN NEW;
END
$func$;
DROP TRIGGER IF EXISTS community_enforce_post_rules ON public.community_posts;
CREATE TRIGGER community_enforce_post_rules BEFORE INSERT ON public.community_posts FOR EACH ROW EXECUTE FUNCTION public.community_enforce_post_rules();

CREATE OR REPLACE FUNCTION public.community_enforce_comment_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $func$
DECLARE v_cp public.community_profiles%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' AND NEW.author_user_id <> auth.uid() THEN RAISE EXCEPTION 'author_mismatch' USING ERRCODE='42501'; END IF;
  IF NEW.workspace_id IS NOT NULL AND NOT public.community_workspace_authorized(NEW.author_user_id,NEW.workspace_id) THEN RAISE EXCEPTION 'workspace_not_authorized' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(NEW.author_user_id,'admin') AND NOT public.has_role(NEW.author_user_id,'super_admin') THEN
    SELECT * INTO v_cp FROM public.community_profiles WHERE user_id=NEW.author_user_id;
    IF NOT FOUND OR v_cp.verification_status <> 'approved' THEN RAISE EXCEPTION 'profile_not_approved' USING ERRCODE='P0001'; END IF;
    IF v_cp.suspended_until IS NOT NULL AND v_cp.suspended_until > now() THEN RAISE EXCEPTION 'user_suspended' USING ERRCODE='P0001'; END IF;
    IF (SELECT count(*) FROM public.community_comments c WHERE c.post_id=NEW.post_id AND c.author_user_id=NEW.author_user_id) >= 2 THEN RAISE EXCEPTION 'comment_limit_reached' USING ERRCODE='P0001'; END IF;
  END IF;
  RETURN NEW;
END
$func$;
DROP TRIGGER IF EXISTS community_enforce_comment_rules ON public.community_comments;
CREATE TRIGGER community_enforce_comment_rules BEFORE INSERT ON public.community_comments FOR EACH ROW EXECUTE FUNCTION public.community_enforce_comment_rules();

CREATE OR REPLACE FUNCTION public.community_apply_suspension()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $func$
BEGIN
  IF (SELECT count(*) FROM public.community_violations v WHERE v.user_id=NEW.user_id AND v.created_at > now()-interval '30 days') >= 3 THEN
    UPDATE public.community_profiles SET suspended_until=GREATEST(COALESCE(suspended_until,now()),now()+interval '7 days'), updated_at=now() WHERE user_id=NEW.user_id;
  END IF;
  RETURN NEW;
END
$func$;
DROP TRIGGER IF EXISTS community_apply_suspension ON public.community_violations;
CREATE TRIGGER community_apply_suspension AFTER INSERT ON public.community_violations FOR EACH ROW EXECUTE FUNCTION public.community_apply_suspension();

CREATE OR REPLACE FUNCTION public.community_notify_new_interest()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $func$
DECLARE v_seller uuid;
BEGIN
  SELECT author_user_id INTO v_seller FROM public.community_posts WHERE id=NEW.post_id;
  IF v_seller IS NOT NULL THEN
    INSERT INTO public.community_notifications (user_id,kind,payload)
    SELECT v_seller,'new_interest',jsonb_build_object('interest_id',NEW.id,'post_id',NEW.post_id,'buyer_id',NEW.buyer_id)
    WHERE EXISTS (SELECT 1 FROM public.community_profiles cp WHERE cp.user_id=v_seller AND cp.notifications_enabled);
  END IF;
  RETURN NEW;
END
$func$;
DROP TRIGGER IF EXISTS community_notify_new_interest ON public.community_interests;
CREATE TRIGGER community_notify_new_interest AFTER INSERT ON public.community_interests FOR EACH ROW EXECUTE FUNCTION public.community_notify_new_interest();

CREATE OR REPLACE FUNCTION public.community_notify_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $func$
DECLARE v_interest public.community_interests%ROWTYPE; v_seller uuid; v_recipient uuid;
BEGIN
  SELECT * INTO v_interest FROM public.community_interests WHERE id=NEW.interest_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT author_user_id INTO v_seller FROM public.community_posts WHERE id=v_interest.post_id;
  v_recipient := CASE WHEN NEW.sender_id=v_interest.buyer_id THEN v_seller ELSE v_interest.buyer_id END;
  IF v_recipient IS NOT NULL AND v_recipient <> NEW.sender_id THEN
    INSERT INTO public.community_notifications (user_id,kind,payload)
    SELECT v_recipient,'new_message',jsonb_build_object('interest_id',NEW.interest_id)
    WHERE EXISTS (SELECT 1 FROM public.community_profiles cp WHERE cp.user_id=v_recipient AND cp.notifications_enabled);
  END IF;
  RETURN NEW;
END
$func$;
DROP TRIGGER IF EXISTS community_notify_new_message ON public.community_interest_messages;
CREATE TRIGGER community_notify_new_message AFTER INSERT ON public.community_interest_messages FOR EACH ROW EXECUTE FUNCTION public.community_notify_new_message();

DROP TRIGGER IF EXISTS community_touch_profiles ON public.community_profiles;
CREATE TRIGGER community_touch_profiles BEFORE UPDATE ON public.community_profiles FOR EACH ROW EXECUTE FUNCTION public.community_touch_updated_at();
DROP TRIGGER IF EXISTS community_touch_posts ON public.community_posts;
CREATE TRIGGER community_touch_posts BEFORE UPDATE ON public.community_posts FOR EACH ROW EXECUTE FUNCTION public.community_touch_updated_at();
DROP TRIGGER IF EXISTS community_touch_interests ON public.community_interests;
CREATE TRIGGER community_touch_interests BEFORE UPDATE ON public.community_interests FOR EACH ROW EXECUTE FUNCTION public.community_touch_updated_at();

CREATE OR REPLACE FUNCTION public.community_expire_stale_records()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $func$
BEGIN
  UPDATE public.community_interests SET status='expired',updated_at=now() WHERE status IN ('pending','open') AND tax_paid=false AND expires_at<now();
  UPDATE public.community_posts SET status='expired',updated_at=now() WHERE status='active' AND created_at<now()-interval '30 days';
END
$func$;

-- ---------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_interest_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_price_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_ai_daily_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_profiles_select ON public.community_profiles;
CREATE POLICY community_profiles_select ON public.community_profiles FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.community_is_staff());
DROP POLICY IF EXISTS community_profiles_update_prefs ON public.community_profiles;
CREATE POLICY community_profiles_update_prefs ON public.community_profiles FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS community_posts_select ON public.community_posts;
CREATE POLICY community_posts_select ON public.community_posts FOR SELECT TO authenticated USING (status<>'removed' OR author_user_id=auth.uid() OR public.community_is_staff());
DROP POLICY IF EXISTS community_comments_select ON public.community_comments;
CREATE POLICY community_comments_select ON public.community_comments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id=post_id AND (p.status<>'removed' OR p.author_user_id=auth.uid() OR public.community_is_staff())));
DROP POLICY IF EXISTS community_ratings_select ON public.community_ratings;
CREATE POLICY community_ratings_select ON public.community_ratings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS community_violations_select ON public.community_violations;
CREATE POLICY community_violations_select ON public.community_violations FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.community_is_staff());
DROP POLICY IF EXISTS community_reports_select ON public.community_reports;
CREATE POLICY community_reports_select ON public.community_reports FOR SELECT TO authenticated USING (reporter_user_id=auth.uid() OR public.community_is_staff());
DROP POLICY IF EXISTS community_interests_select ON public.community_interests;
CREATE POLICY community_interests_select ON public.community_interests FOR SELECT TO authenticated USING (buyer_id=auth.uid() OR EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id=post_id AND p.author_user_id=auth.uid()) OR public.community_is_staff());
DROP POLICY IF EXISTS community_msgs_select ON public.community_interest_messages;
CREATE POLICY community_msgs_select ON public.community_interest_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.community_interests i JOIN public.community_posts p ON p.id=i.post_id WHERE i.id=interest_id AND (i.buyer_id=auth.uid() OR p.author_user_id=auth.uid() OR public.community_is_staff())));
DROP POLICY IF EXISTS community_notif_select ON public.community_notifications;
CREATE POLICY community_notif_select ON public.community_notifications FOR SELECT TO authenticated USING (user_id=auth.uid());
DROP POLICY IF EXISTS community_notif_update_read ON public.community_notifications;
CREATE POLICY community_notif_update_read ON public.community_notifications FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS community_attachments_select ON public.community_attachments;
CREATE POLICY community_attachments_select ON public.community_attachments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id=post_id AND (p.status<>'removed' OR p.author_user_id=auth.uid() OR public.community_is_staff())));
DROP POLICY IF EXISTS community_price_bands_select ON public.community_price_bands;
CREATE POLICY community_price_bands_select ON public.community_price_bands FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS community_settings_select ON public.community_settings;
CREATE POLICY community_settings_select ON public.community_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS community_ai_usage_select ON public.community_ai_usage;
CREATE POLICY community_ai_usage_select ON public.community_ai_usage FOR SELECT TO authenticated USING (public.community_is_staff());

-- ---------------------------------------------------------------------------
-- 9. GRANTS
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.community_profiles FROM anon, authenticated;
REVOKE ALL ON public.community_posts FROM anon, authenticated;
REVOKE ALL ON public.community_comments FROM anon, authenticated;
REVOKE ALL ON public.community_ratings FROM anon, authenticated;
REVOKE ALL ON public.community_violations FROM anon, authenticated;
REVOKE ALL ON public.community_reports FROM anon, authenticated;
REVOKE ALL ON public.community_interests FROM anon, authenticated;
REVOKE ALL ON public.community_interest_messages FROM anon, authenticated;
REVOKE ALL ON public.community_notifications FROM anon, authenticated;
REVOKE ALL ON public.community_attachments FROM anon, authenticated;
REVOKE ALL ON public.community_price_bands FROM anon, authenticated;
REVOKE ALL ON public.community_settings FROM anon, authenticated;
REVOKE ALL ON public.community_ai_daily_counters FROM anon, authenticated;
REVOKE ALL ON public.community_ai_usage FROM anon, authenticated;

GRANT SELECT ON public.community_profiles TO authenticated;
GRANT SELECT ON public.community_posts TO authenticated;
GRANT SELECT ON public.community_comments TO authenticated;
GRANT SELECT ON public.community_ratings TO authenticated;
GRANT SELECT ON public.community_violations TO authenticated;
GRANT SELECT ON public.community_reports TO authenticated;
GRANT SELECT ON public.community_interests TO authenticated;
GRANT SELECT ON public.community_interest_messages TO authenticated;
GRANT SELECT ON public.community_notifications TO authenticated;
GRANT SELECT ON public.community_attachments TO authenticated;
GRANT SELECT ON public.community_price_bands TO authenticated;
GRANT SELECT ON public.community_settings TO authenticated;
GRANT SELECT ON public.community_ai_usage TO authenticated;
GRANT UPDATE (offer_type, notifications_enabled, notification_mode) ON public.community_profiles TO authenticated;
GRANT UPDATE (read_at) ON public.community_notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. FUNCTION EXECUTE PRIVILEGES
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.community_is_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_workspace_authorized(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_workspace_authorized(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_activate_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_list_public_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_community_service_tax(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_community_report(uuid,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.community_activate_profile(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_list_public_profiles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pay_community_service_tax(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_community_report(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_community_ai_request(uuid,text,integer,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_enforce_post_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_enforce_comment_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_apply_suspension() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_notify_new_interest() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_notify_new_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_expire_stale_records() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. STORAGE
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('community-attachments','community-attachments',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS community_att_insert ON storage.objects;
CREATE POLICY community_att_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='community-attachments' AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS community_att_select ON storage.objects;
CREATE POLICY community_att_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id='community-attachments' AND ((storage.foldername(name))[1]=auth.uid()::text OR public.community_is_staff()));
DROP POLICY IF EXISTS community_att_update ON storage.objects;
CREATE POLICY community_att_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='community-attachments' AND (storage.foldername(name))[1]=auth.uid()::text) WITH CHECK (bucket_id='community-attachments' AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS community_att_delete ON storage.objects;
CREATE POLICY community_att_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='community-attachments' AND ((storage.foldername(name))[1]=auth.uid()::text OR public.community_is_staff()));

-- ---------------------------------------------------------------------------
-- 12. CRON
-- ---------------------------------------------------------------------------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    BEGIN PERFORM cron.unschedule('community-expire-stale'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('community-expire-stale','*/15 * * * *',$sql$SELECT public.community_expire_stale_records()$sql$);
  ELSE
    RAISE NOTICE 'pg_cron not available — schedule community_expire_stale_records() externally.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'community cron schedule skipped: %', SQLERRM;
END
$cron$;;
