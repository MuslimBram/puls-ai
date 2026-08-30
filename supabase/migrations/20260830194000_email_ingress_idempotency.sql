begin;

-- Email retries/polls must not create duplicate inbox rows. Existing messages
-- without provider_message_id remain untouched; new email-poll writes always
-- assign RFC Message-ID or a deterministic fallback event id.
do $$
begin
  if exists (
    select 1
    from public.inbox_messages
    where channel_type = 'email'
      and provider_message_id is not null
      and workspace_id is not null
      and channel_id is not null
    group by workspace_id, channel_id, provider_message_id
    having count(*) > 1
  ) then
    raise exception 'duplicate email provider_message_id rows exist; reconcile before enabling unique ingress boundary';
  end if;
end;
$$;

create unique index if not exists inbox_messages_email_event_unique
  on public.inbox_messages (workspace_id, channel_id, provider_message_id)
  where channel_type = 'email'
    and provider_message_id is not null
    and workspace_id is not null
    and channel_id is not null;

comment on index public.inbox_messages_email_event_unique is
  'Race-safe idempotency boundary for inbound email events within one workspace/channel.';

commit;
