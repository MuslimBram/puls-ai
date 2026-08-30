begin;

-- Custom webhook retries must not create duplicate inbox rows. Scope the
-- uniqueness boundary to custom_webhook so existing provider-specific retry
-- semantics remain untouched.
do $$
begin
  if exists (
    select 1
    from public.inbox_messages
    where channel_type = 'custom_webhook'
      and provider_message_id is not null
      and workspace_id is not null
      and channel_id is not null
    group by workspace_id, channel_id, provider_message_id
    having count(*) > 1
  ) then
    raise exception 'duplicate custom_webhook provider_message_id rows exist; reconcile before enabling unique ingress boundary';
  end if;
end;
$$;

create unique index if not exists inbox_messages_custom_webhook_event_unique
  on public.inbox_messages (workspace_id, channel_id, provider_message_id)
  where channel_type = 'custom_webhook'
    and provider_message_id is not null
    and workspace_id is not null
    and channel_id is not null;

comment on index public.inbox_messages_custom_webhook_event_unique is
  'Race-safe idempotency boundary for custom webhook events within one workspace/channel.';

commit;
