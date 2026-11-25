ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;
