-- Telegram health checks and webhook setup record provider failures here.
-- Additive and nullable so existing channel rows remain valid.
alter table public.channels
  add column if not exists last_error text;

comment on column public.channels.last_error is
  'Latest provider connection or webhook error; null when the channel is healthy.';
