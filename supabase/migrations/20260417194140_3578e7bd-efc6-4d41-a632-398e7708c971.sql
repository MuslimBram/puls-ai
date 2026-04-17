-- Add traceability columns linking leads back to their originating conversation thread / inbox message
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.conversation_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inbox_message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_identifier text,
  ADD COLUMN IF NOT EXISTS channel_type text;

CREATE INDEX IF NOT EXISTS idx_leads_thread_id ON public.leads(thread_id);
CREATE INDEX IF NOT EXISTS idx_leads_inbox_message_id ON public.leads(inbox_message_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact_identifier ON public.leads(user_id, contact_identifier);