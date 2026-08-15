-- ============================================================
-- PULSE AI — LIDHJET NATIVE MODULE (PR1: DATABASE & BACKEND)
-- 14 COMMUNITY TABLES, SEED PRICE BANDS, RPCs & RLS POLICIES
-- ============================================================

-- 1. COMMUNITY PROFILES
CREATE TABLE IF NOT EXISTS public.community_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'under_review', 'suspended', 'banned')),
  verification_status text NOT NULL DEFAULT 'approved' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  offer_type text,
  bio text,
  avatar_url text,
  display_name text,
  suspended_until timestamptz,
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  under_review_until timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- 2. COMMUNITY SETTINGS
CREATE TABLE IF NOT EXISTS public.community_settings (
  id text PRIMARY KEY DEFAULT 'default',
  lek_per_eur numeric, -- Intentionally NULL by default; operator configures later
  ai_daily_limit integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Seed default settings row if missing
INSERT INTO public.community_settings (id, lek_per_eur, ai_daily_limit)
VALUES ('default', NULL, 5)
ON CONFLICT (id) DO NOTHING;

-- 3. COMMUNITY PRICE BANDS
CREATE TABLE IF NOT EXISTS public.community_price_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text UNIQUE NOT NULL,
  min_price numeric NOT NULL,
  max_price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ALL',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Seed Price Bands
INSERT INTO public.community_price_bands (category, min_price, max_price, currency)
VALUES
  ('pune', 200, 200000, 'ALL'),
  ('sherbim', 300, 300000, 'ALL'),
  ('tregti', 100, 2000000, 'ALL'),
  ('tjeter', 0, 5000000, 'ALL')
ON CONFLICT (category) DO UPDATE
SET min_price = EXCLUDED.min_price,
    max_price = EXCLUDED.max_price,
    currency = EXCLUDED.currency,
    updated_at = clock_timestamp();

-- 4. COMMUNITY POSTS
CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL, -- NULL = Personal identity, NOT NULL = Business identity
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL REFERENCES public.community_price_bands(category) ON DELETE RESTRICT,
  price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ALL',
  location text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'flagged', 'archived')),
  views_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- 5. COMMUNITY COMMENTS
CREATE TABLE IF NOT EXISTS public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- 6. COMMUNITY RATINGS
CREATE TABLE IF NOT EXISTS public.community_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rater_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 1 AND score <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (target_user_id, rater_user_id)
);

-- 7. COMMUNITY REPORTS
CREATE TABLE IF NOT EXISTS public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post', 'comment', 'profile', 'message', 'other')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- 8. COMMUNITY VIOLATIONS
CREATE TABLE IF NOT EXISTS public.community_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_report_id uuid REFERENCES public.community_reports(id) ON DELETE SET NULL,
  violation_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Partial Unique Index: One report can create maximum ONE violation
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_violations_source_report_id
  ON public.community_violations(source_report_id)
  WHERE source_report_id IS NOT NULL;

-- 9. COMMUNITY INTERESTS
CREATE TABLE IF NOT EXISTS public.community_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_amount numeric NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'tax_paid', 'rejected', 'expired')),
  tax_paid boolean NOT NULL DEFAULT false,
  tax_paid_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- 10. COMMUNITY INTEREST MESSAGES
CREATE TABLE IF NOT EXISTS public.community_interest_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interest_id uuid NOT NULL REFERENCES public.community_interests(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- 11. COMMUNITY NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.community_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- 12. COMMUNITY ATTACHMENTS
CREATE TABLE IF NOT EXISTS public.community_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text UNIQUE NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- 13. COMMUNITY AI DAILY COUNTERS
CREATE TABLE IF NOT EXISTS public.community_ai_daily_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  usage_date date NOT NULL DEFAULT (CURRENT_DATE AT TIME ZONE 'UTC'),
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, module, usage_date)
);

-- 14. COMMUNITY AI USAGE
CREATE TABLE IF NOT EXISTS public.community_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  via text NOT NULL CHECK (via IN ('system', 'workspace')),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('reserved', 'completed', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz
);

-- Partial Unique Index: Duplicate request_id protection
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_ai_usage_user_module_request
  ON public.community_ai_usage(user_id, module, request_id)
  WHERE request_id IS NOT NULL;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_community_posts_author ON public.community_posts(author_user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_workspace ON public.community_posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_category ON public.community_posts(category);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON public.community_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_community_interests_buyer ON public.community_interests(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_community_interests_seller ON public.community_interests(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_community_interests_post ON public.community_interests(post_id);
CREATE INDEX IF NOT EXISTS idx_community_interest_messages_interest ON public.community_interest_messages(interest_id);
CREATE INDEX IF NOT EXISTS idx_community_attachments_post ON public.community_attachments(post_id);
CREATE INDEX IF NOT EXISTS idx_community_notifications_user ON public.community_notifications(user_id, read);

-- ============================================================
-- SECURITY-DEFINER RPCs
-- ============================================================

-- RPC 1: LAZY COMMUNITY PROFILE ACTIVATION
CREATE OR REPLACE FUNCTION public.community_activate_profile()
RETURNS public.community_profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_profile public.community_profiles;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  INSERT INTO public.community_profiles (
    user_id,
    status,
    activated_at,
    under_review_until,
    created_at,
    updated_at
  )
  VALUES (
    v_caller,
    'under_review',
    clock_timestamp(),
    clock_timestamp() + interval '24 hours',
    clock_timestamp(),
    clock_timestamp()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET updated_at = clock_timestamp()
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

-- RPC 2: LIST PUBLIC PROFILES
CREATE OR REPLACE FUNCTION public.community_list_public_profiles()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  offer_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.user_id,
    p.full_name,
    p.avatar_url,
    cp.offer_type
  FROM public.community_profiles cp
  JOIN public.profiles p ON p.user_id = cp.user_id
  WHERE cp.verification_status = 'approved'
    AND (cp.suspended_until IS NULL OR cp.suspended_until < now());
$$;

GRANT EXECUTE ON FUNCTION public.community_list_public_profiles() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.community_list_public_profiles() FROM PUBLIC, anon;

-- RPC 3: STAFF REPORT REVIEW & VIOLATION CREATION
CREATE OR REPLACE FUNCTION public.review_community_report(
  p_report_id uuid,
  p_action text,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_report public.community_reports;
  v_target_user uuid;
BEGIN
  -- Verify caller is admin or super_admin
  IF NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'super_admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Admin role required for report review';
  END IF;

  IF p_action NOT IN ('confirm', 'dismiss') THEN
    RAISE EXCEPTION 'INVALID_ACTION: Must be confirm or dismiss';
  END IF;

  -- Lock report FOR UPDATE to prevent race conditions
  SELECT * INTO v_report
  FROM public.community_reports
  WHERE id = p_report_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND_OR_ALREADY_REVIEWED';
  END IF;

  IF p_action = 'confirm' THEN
    -- Update report status
    UPDATE public.community_reports
    SET status = 'confirmed',
        reviewed_by = v_caller,
        reviewed_at = clock_timestamp(),
        notes = p_notes,
        updated_at = clock_timestamp()
    WHERE id = p_report_id;

    -- Infer target user if target_type is post/comment/profile
    IF v_report.target_type = 'post' THEN
      SELECT author_user_id INTO v_target_user FROM public.community_posts WHERE id = v_report.target_id;
    ELSIF v_report.target_type = 'comment' THEN
      SELECT author_user_id INTO v_target_user FROM public.community_comments WHERE id = v_report.target_id;
    ELSIF v_report.target_type = 'profile' THEN
      v_target_user := v_report.target_id;
    ELSE
      v_target_user := v_report.reporter_user_id;
    END IF;

    -- Create confirmed violation
    INSERT INTO public.community_violations (
      user_id,
      source_report_id,
      violation_type,
      severity,
      notes,
      created_at
    )
    VALUES (
      COALESCE(v_target_user, v_report.reporter_user_id),
      p_report_id,
      'report_confirmed_' || v_report.target_type,
      'medium',
      p_notes,
      clock_timestamp()
    )
    ON CONFLICT (source_report_id) WHERE source_report_id IS NOT NULL DO NOTHING;

  ELSIF p_action = 'dismiss' THEN
    UPDATE public.community_reports
    SET status = 'dismissed',
        reviewed_by = v_caller,
        reviewed_at = clock_timestamp(),
        notes = p_notes,
        updated_at = clock_timestamp()
    WHERE id = p_report_id;
  END IF;

  RETURN true;
END;
$$;

-- RPC 3: ATOMIC SERVICE TAX PAYMENT (EUR WALLET DEBIT)
CREATE OR REPLACE FUNCTION public.pay_community_service_tax(
  _interest_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_interest public.community_interests;
  v_post public.community_posts;
  v_lek_per_eur numeric;
  v_tax_lek numeric := 200; -- 200 ALL fixed service tax
  v_tax_eur numeric;
  v_wallet public.user_wallets;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- Lock interest FOR UPDATE
  SELECT * INTO v_interest
  FROM public.community_interests
  WHERE id = _interest_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'interest_not_found', 'message', 'Interest record not found');
  END IF;

  -- Verify post ownership (only post author / seller can pay)
  SELECT * INTO v_post
  FROM public.community_posts
  WHERE id = v_interest.post_id;

  IF v_post.author_user_id != v_caller THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthorized_seller_only', 'message', 'Only the post seller can pay service tax');
  END IF;

  -- Check if already paid
  IF v_interest.status = 'tax_paid' OR v_interest.tax_paid = true THEN
    RETURN jsonb_build_object('success', false, 'code', 'alreadyPaid', 'message', 'Service tax already paid');
  END IF;

  -- Check expiry
  IF v_interest.expires_at < clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'code', 'expired', 'message', 'Interest has expired');
  END IF;

  -- Fetch FX rate from community_settings (must be configured)
  SELECT lek_per_eur INTO v_lek_per_eur
  FROM public.community_settings
  WHERE id = 'default';

  IF v_lek_per_eur IS NULL OR v_lek_per_eur <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'fx_not_configured', 'message', 'FX rate lek_per_eur is not configured');
  END IF;

  -- Calculate EUR monetary tax amount
  v_tax_eur := CEIL(v_tax_lek / v_lek_per_eur);

  -- Lock EUR wallet FOR UPDATE
  SELECT * INTO v_wallet
  FROM public.user_wallets
  WHERE user_id = v_caller AND currency = 'EUR'
  FOR UPDATE;

  IF NOT FOUND OR v_wallet.current_balance < v_tax_eur THEN
    RETURN jsonb_build_object('success', false, 'code', 'insufficient_funds', 'message', 'Insufficient EUR wallet balance');
  END IF;

  -- Debit wallet balance
  UPDATE public.user_wallets
  SET current_balance = current_balance - v_tax_eur,
      updated_at = clock_timestamp()
  WHERE id = v_wallet.id;

  -- Insert wallet ledger transaction
  INSERT INTO public.user_wallet_transactions (
    wallet_id,
    user_id,
    type,
    amount,
    currency,
    status,
    description,
    metadata
  )
  VALUES (
    v_wallet.id,
    v_caller,
    'community_service_tax',
    v_tax_eur,
    'EUR',
    'completed',
    'Community service tax payment for post ' || v_post.title,
    jsonb_build_object(
      'direction', 'debit',
      'tax_lek', v_tax_lek,
      'tax_eur', v_tax_eur,
      'lek_per_eur_used', v_lek_per_eur,
      'interest_id', _interest_id,
      'post_id', v_interest.post_id
    )
  );

  -- Update interest status
  UPDATE public.community_interests
  SET tax_paid = true,
      tax_paid_at = clock_timestamp(),
      status = 'tax_paid',
      updated_at = clock_timestamp()
  WHERE id = _interest_id;

  -- Notify buyer
  INSERT INTO public.community_notifications (
    user_id,
    type,
    title,
    message,
    payload
  )
  VALUES (
    v_interest.buyer_user_id,
    'service_tax_paid',
    'Service Tax Paid',
    'Seller has paid service tax. Chat is now active.',
    jsonb_build_object('interest_id', _interest_id, 'post_id', v_interest.post_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'code', 'paid',
    'tax_eur', v_tax_eur,
    'tax_lek', v_tax_lek,
    'lek_per_eur_used', v_lek_per_eur
  );
END;
$$;

-- RPC 4: ATOMIC AI CLAIM & DAILY RATE LIMITING
CREATE OR REPLACE FUNCTION public.claim_community_ai_request(
  p_user_id uuid,
  p_module text,
  p_daily_limit integer,
  p_request_id text DEFAULT NULL,
  p_via text DEFAULT 'system',
  p_workspace_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing public.community_ai_usage;
  v_counter public.community_ai_daily_counters;
  v_usage_id uuid;
BEGIN
  -- Idempotency check for request_id
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.community_ai_usage
    WHERE user_id = p_user_id AND module = p_module AND request_id = p_request_id;

    IF FOUND THEN
      IF v_existing.status = 'completed' THEN
        RETURN jsonb_build_object('status', 'completed', 'allowed', false, 'reused', true, 'record_id', v_existing.id);
      ELSIF v_existing.status = 'failed' THEN
        RETURN jsonb_build_object('status', 'failed', 'allowed', false, 'reused', true, 'error', v_existing.error_message);
      ELSIF v_existing.status = 'reserved' THEN
        RETURN jsonb_build_object('status', 'in_progress', 'code', '409_in_progress', 'allowed', false, 'reused', true);
      END IF;
    END IF;
  END IF;

  -- Handle system path rate limiting (daily counter)
  IF p_via = 'system' THEN
    -- Upsert daily counter
    INSERT INTO public.community_ai_daily_counters (user_id, module, usage_date, count)
    VALUES (p_user_id, p_module, (CURRENT_DATE AT TIME ZONE 'UTC'), 0)
    ON CONFLICT (user_id, module, usage_date) DO NOTHING;

    -- Lock counter row FOR UPDATE
    SELECT * INTO v_counter
    FROM public.community_ai_daily_counters
    WHERE user_id = p_user_id AND module = p_module AND usage_date = (CURRENT_DATE AT TIME ZONE 'UTC')
    FOR UPDATE;

    IF v_counter.count >= p_daily_limit THEN
      RETURN jsonb_build_object('status', 'capped', 'code', 'daily_limit_exceeded', 'allowed', false);
    END IF;

    -- Increment daily counter
    UPDATE public.community_ai_daily_counters
    SET count = count + 1,
        updated_at = clock_timestamp()
    WHERE id = v_counter.id;
  END IF;

  -- Create reservation record
  INSERT INTO public.community_ai_usage (
    request_id,
    user_id,
    module,
    via,
    workspace_id,
    status
  )
  VALUES (
    p_request_id,
    p_user_id,
    p_module,
    p_via,
    p_workspace_id,
    'reserved'
  )
  RETURNING id INTO v_usage_id;

  RETURN jsonb_build_object(
    'status', 'reserved',
    'allowed', true,
    'usage_id', v_usage_id
  );
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_price_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_interest_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_ai_daily_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_ai_usage ENABLE ROW LEVEL SECURITY;

-- 1. community_profiles
DO $$ BEGIN
  CREATE POLICY "Profiles are viewable by authenticated users" ON public.community_profiles FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Users can insert own community profile" ON public.community_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  CREATE POLICY "Users can update own community profile" ON public.community_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2. community_settings
DO $$ BEGIN
  CREATE POLICY "Settings are viewable by authenticated users" ON public.community_settings FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Admins can manage community settings" ON public.community_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. community_price_bands
DO $$ BEGIN
  CREATE POLICY "Price bands viewable by authenticated users" ON public.community_price_bands FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Admins can manage price bands" ON public.community_price_bands FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 4. community_posts
DO $$ BEGIN
  CREATE POLICY "Posts viewable by authenticated users" ON public.community_posts FOR SELECT TO authenticated USING (status = 'active' OR author_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  CREATE POLICY "Users can insert own posts" ON public.community_posts FOR INSERT TO authenticated WITH CHECK (author_user_id = auth.uid());
  CREATE POLICY "Users can update own posts" ON public.community_posts FOR UPDATE TO authenticated USING (author_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  CREATE POLICY "Users can delete own posts" ON public.community_posts FOR DELETE TO authenticated USING (author_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 5. community_comments
DO $$ BEGIN
  CREATE POLICY "Comments viewable by authenticated users" ON public.community_comments FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Users can insert own comments" ON public.community_comments FOR INSERT TO authenticated WITH CHECK (author_user_id = auth.uid());
  CREATE POLICY "Users can update own comments" ON public.community_comments FOR UPDATE TO authenticated USING (author_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  CREATE POLICY "Users can delete own comments" ON public.community_comments FOR DELETE TO authenticated USING (author_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 6. community_ratings
DO $$ BEGIN
  CREATE POLICY "Ratings viewable by authenticated users" ON public.community_ratings FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Users can insert ratings for others" ON public.community_ratings FOR INSERT TO authenticated WITH CHECK (rater_user_id = auth.uid() AND target_user_id != auth.uid());
  CREATE POLICY "Users can update own ratings" ON public.community_ratings FOR UPDATE TO authenticated USING (rater_user_id = auth.uid());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 7. community_reports
DO $$ BEGIN
  CREATE POLICY "Users view own reports, staff view all" ON public.community_reports FOR SELECT TO authenticated USING (reporter_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
  CREATE POLICY "Users can insert reports" ON public.community_reports FOR INSERT TO authenticated WITH CHECK (reporter_user_id = auth.uid());
  CREATE POLICY "Admins can update reports" ON public.community_reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 8. community_violations (DIRECT CLIENT INSERT DENIED)
DO $$ BEGIN
  CREATE POLICY "Users view own violations, staff view all" ON public.community_violations FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 9. community_interests
DO $$ BEGIN
  CREATE POLICY "Interests viewable by buyer, seller, admin" ON public.community_interests FOR SELECT TO authenticated USING (buyer_user_id = auth.uid() OR seller_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  CREATE POLICY "Buyers can create interest" ON public.community_interests FOR INSERT TO authenticated WITH CHECK (buyer_user_id = auth.uid() AND seller_user_id != auth.uid());
  CREATE POLICY "Participants can update interest" ON public.community_interests FOR UPDATE TO authenticated USING (buyer_user_id = auth.uid() OR seller_user_id = auth.uid());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 10. community_interest_messages (DIRECT CLIENT INSERT DENIED - VIA EDGE FUNCTION ONLY)
DO $$ BEGIN
  CREATE POLICY "Participants view messages" ON public.community_interest_messages FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.community_interests i
      WHERE i.id = interest_id AND (i.buyer_user_id = auth.uid() OR i.seller_user_id = auth.uid())
    )
  );
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 11. community_notifications
DO $$ BEGIN
  CREATE POLICY "Users view own notifications" ON public.community_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
  CREATE POLICY "Users update own notifications (read status)" ON public.community_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 12. community_attachments
DO $$ BEGIN
  CREATE POLICY "Attachments viewable by authenticated users" ON public.community_attachments FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Users insert own attachments" ON public.community_attachments FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());
  CREATE POLICY "Owners and admins delete attachments" ON public.community_attachments FOR DELETE TO authenticated USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 13. community_ai_daily_counters
DO $$ BEGIN
  CREATE POLICY "Users view own daily counters" ON public.community_ai_daily_counters FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 14. community_ai_usage
DO $$ BEGIN
  CREATE POLICY "Users view own ai usage" ON public.community_ai_usage FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
