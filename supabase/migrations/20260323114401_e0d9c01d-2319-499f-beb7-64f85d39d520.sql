
CREATE TABLE public.admin_saved_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scan_name text NOT NULL,
  url text NOT NULL,
  scan_type text NOT NULL DEFAULT 'general',
  content_markdown text,
  content_html text,
  metadata jsonb DEFAULT '{}'::jsonb,
  extracted_items jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_saved_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage saved scans"
  ON public.admin_saved_scans
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'business_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'business_owner'));

CREATE TRIGGER set_updated_at_admin_saved_scans
  BEFORE UPDATE ON public.admin_saved_scans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
