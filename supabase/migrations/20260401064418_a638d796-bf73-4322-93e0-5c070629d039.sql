
-- Business scan quiz submissions
CREATE TABLE public.business_scan_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  industry TEXT,
  location TEXT,
  website TEXT,
  social_profiles JSONB DEFAULT '{}',
  current_state JSONB DEFAULT '{}',
  goals TEXT[] DEFAULT '{}',
  problems TEXT[] DEFAULT '{}',
  budget TEXT,
  score INT DEFAULT 0,
  level TEXT,
  route TEXT,
  answers_json JSONB DEFAULT '{}',
  email TEXT,
  phone TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow public inserts (no auth required for the quiz)
ALTER TABLE public.business_scan_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a scan"
  ON public.business_scan_submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read all submissions"
  ON public.business_scan_submissions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
