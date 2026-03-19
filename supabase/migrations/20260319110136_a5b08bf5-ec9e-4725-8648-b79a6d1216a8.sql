
-- Workspace branding table for white-label customization
CREATE TABLE public.workspace_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Identity
  business_name TEXT,
  tagline TEXT,
  logo_url TEXT,
  logo_dark_url TEXT,
  favicon_url TEXT,
  -- Colors (stored as HSL values for CSS variable compatibility)
  primary_color TEXT DEFAULT '222 47% 11%',
  primary_foreground TEXT DEFAULT '210 40% 98%',
  accent_color TEXT DEFAULT '210 40% 96.1%',
  accent_foreground TEXT DEFAULT '222.2 47.4% 11.2%',
  brand_gradient_from TEXT,
  brand_gradient_to TEXT,
  -- Typography
  heading_font TEXT DEFAULT 'Inter',
  body_font TEXT DEFAULT 'Inter',
  -- Chat widget
  chat_widget_position TEXT DEFAULT 'bottom-right',
  chat_widget_greeting TEXT DEFAULT 'Hi! How can we help you?',
  chat_widget_avatar_url TEXT,
  chat_widget_bubble_color TEXT,
  -- Email
  email_header_html TEXT,
  email_footer_html TEXT,
  email_from_name TEXT,
  -- Auth pages
  login_background_url TEXT,
  login_welcome_text TEXT,
  -- Advanced
  custom_css TEXT,
  powered_by_visible BOOLEAN DEFAULT true,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.workspace_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_view_branding"
ON public.workspace_branding FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace_owners_can_manage_branding"
ON public.workspace_branding FOR ALL TO authenticated
USING (public.is_workspace_owner(auth.uid(), workspace_id))
WITH CHECK (public.is_workspace_owner(auth.uid(), workspace_id));

-- Public read for chat widget embedding (visitors need to see branding)
CREATE POLICY "public_branding_for_widget"
ON public.workspace_branding FOR SELECT TO anon
USING (true);
