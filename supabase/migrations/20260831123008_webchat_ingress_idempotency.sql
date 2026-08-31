begin;

-- Website-chat retries must not create duplicate inbox rows. Keep the unique
-- boundary scoped to website_chat so provider-specific delivery semantics are
-- unchanged.
do $$
begin
  if exists (
    select 1
    from public.inbox_messages
    where channel_type = 'website_chat'
      and provider_message_id is not null
      and workspace_id is not null
      and channel_id is not null
    group by workspace_id, channel_id, provider_message_id
    having count(*) > 1
  ) then
    raise exception 'duplicate website_chat provider_message_id rows exist; reconcile before enabling unique ingress boundary';
  end if;
end;
$$;

create unique index if not exists inbox_messages_webchat_event_unique
  on public.inbox_messages (workspace_id, channel_id, provider_message_id)
  where channel_type = 'website_chat'
    and provider_message_id is not null
    and workspace_id is not null
    and channel_id is not null;

comment on index public.inbox_messages_webchat_event_unique is
  'Race-safe idempotency boundary for website-chat events within one workspace/channel.';

commit;
