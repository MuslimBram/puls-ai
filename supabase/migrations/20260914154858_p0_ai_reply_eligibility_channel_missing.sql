-- P0 HAPI 4 / C-1 -- ai_reply_eligibility must not pass a NULL channel_id
-- through to the outbound path.
--
-- Wave 0 (20260914100000_p0_inbound_ai_reply_orchestration.sql) defined
-- ai_reply_jobs.channel_id as nullable, mirroring inbox_messages.channel_id,
-- which is nullable in production and NULL on the majority of inbound rows.
-- ai_reply_eligibility guarded the channel behind `if _channel_id is not null`,
-- so a NULL channel_id skipped channel_not_in_workspace / channel_disabled /
-- channel_auto_reply_disabled and returned eligible=true. The orchestrator then
-- called resolveRecipient and dispatchOutbound, and _shared/internal-dispatch
-- rejects a non-UUID channelId -- turning a case that should be skipped into a
-- retrying failure.
--
-- This migration replaces exactly one function body and changes exactly one
-- outcome: (channel_id IS NULL AND channel_type <> 'website_chat') now returns
-- {"eligible": false, "reason": "channel_missing"}. Every other input returns
-- byte-identically to Wave 0, in the same precedence order. Nothing else in the
-- schema is touched: no table, column, index, trigger, cron entry or policy.
--
-- The orchestrator needs no change: inbound-ai-reply already maps any
-- eligible!==true to completeJob({kind:"skipped", reason: elig.reason}), so the
-- new reason surfaces as ai_reply_jobs.status='skipped',
-- skip_reason='channel_missing' with no further side effects.

create or replace function public.ai_reply_eligibility(
  _workspace_id uuid,
  _channel_id   uuid,
  _thread_id    uuid,
  _channel_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  _master   boolean;
  _override boolean;
  _ch       public.channels%rowtype;
  _ch_pref  boolean;
begin
  if _workspace_id is null then
    return jsonb_build_object('eligible', false, 'reason', 'workspace_missing');
  end if;

  if _channel_type is null or _channel_type not in
     ('whatsapp','telegram','email','website_chat') then
    return jsonb_build_object('eligible', false, 'reason', 'channel_type_unsupported');
  end if;

  select auto_reply_enabled into _master
  from public.ai_agent_configs
  where workspace_id = _workspace_id
  limit 1;

  if _master is null then
    return jsonb_build_object('eligible', false, 'reason', 'agent_config_missing');
  end if;
  if _master is not true then
    return jsonb_build_object('eligible', false, 'reason', 'workspace_auto_reply_disabled');
  end if;

  if _thread_id is not null then
    select ai_auto_reply_override into _override
    from public.conversation_threads
    where id = _thread_id and workspace_id = _workspace_id;

    if _override is false then
      return jsonb_build_object('eligible', false, 'reason', 'thread_auto_reply_disabled');
    end if;
  end if;

  -- C-1 FIX. A provider channel cannot be answered without a channel row:
  -- the outbound path resolves credentials by channel_id and requires a
  -- non-null UUID. Before this fix a NULL channel_id skipped every channel
  -- check below and returned eligible=true, sending the job into a sender it
  -- could never satisfy. It must end as skipped/channel_missing instead.
  -- website_chat is the deliberate exception, unchanged: its reply is a
  -- stored inbox row, not a provider call, so it needs no channel.
  if _channel_id is null and _channel_type <> 'website_chat' then
    return jsonb_build_object('eligible', false, 'reason', 'channel_missing');
  end if;

  if _channel_id is not null then
    select * into _ch from public.channels
    where id = _channel_id and workspace_id = _workspace_id;

    if not found then
      return jsonb_build_object('eligible', false, 'reason', 'channel_not_in_workspace');
    end if;
    if _ch.is_enabled is not true then
      return jsonb_build_object('eligible', false, 'reason', 'channel_disabled');
    end if;

    begin
      _ch_pref := (_ch.settings ->> 'ai_auto_reply_enabled')::boolean;
    exception when others then
      _ch_pref := null;
    end;

    if _ch_pref is false then
      return jsonb_build_object('eligible', false, 'reason', 'channel_auto_reply_disabled');
    end if;
  end if;

  return jsonb_build_object('eligible', true, 'reason', 'ok');
end;
$$;

revoke all on function public.ai_reply_eligibility(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.ai_reply_eligibility(uuid, uuid, uuid, text) to authenticated;;
