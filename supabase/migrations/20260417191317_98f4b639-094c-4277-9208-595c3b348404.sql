-- Support tickets table
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL,
  requester_email TEXT,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_admin_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_requester ON public.support_tickets(requester_user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_assigned ON public.support_tickets(assigned_admin_id);

-- Ticket messages table
CREATE TABLE public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL,
  sender_role TEXT NOT NULL DEFAULT 'user',
  body TEXT NOT NULL,
  internal_note BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_ticket_messages_ticket ON public.support_ticket_messages(ticket_id);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- RLS: support_tickets
CREATE POLICY "Users view own tickets" ON public.support_tickets
  FOR SELECT USING (auth.uid() = requester_user_id);

CREATE POLICY "Admins view all tickets" ON public.support_tickets
  FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users create own tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = requester_user_id);

CREATE POLICY "Users update own open tickets" ON public.support_tickets
  FOR UPDATE USING (auth.uid() = requester_user_id AND status IN ('open','pending'));

CREATE POLICY "Admins update all tickets" ON public.support_tickets
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- RLS: support_ticket_messages
CREATE POLICY "Users view messages on own tickets" ON public.support_ticket_messages
  FOR SELECT USING (
    NOT internal_note AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.requester_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins view all ticket messages" ON public.support_ticket_messages
  FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users send messages on own tickets" ON public.support_ticket_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_user_id
    AND sender_role = 'user'
    AND internal_note = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.requester_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins send any messages" ON public.support_ticket_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_user_id
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- updated_at trigger
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Touch parent ticket updated_at when a new message arrives
CREATE OR REPLACE FUNCTION public.touch_support_ticket_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_support_ticket
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_ticket_on_message();