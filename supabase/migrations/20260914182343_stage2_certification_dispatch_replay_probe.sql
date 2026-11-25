-- HAPI 4 STAGE 2 — dispatch replay protection, exercised directly against the
-- production RPCs. No network call, no provider, no message.
--   1. claim a dispatch id            -> must be granted
--   2. settle it as sent              -> records the provider message id
--   3. claim the SAME dispatch id     -> must be refused, returning the original
--                                        outcome instead of allowing a resend
-- The observable proof is the final table state: exactly one row, still 'sent',
-- provider message id intact. A second grant would have reset it to 'pending'.
do $$
declare
  _d uuid := 'dddddddd-0000-4000-8000-00000000d001';
  _first jsonb;
  _second jsonb;
begin
  _first := public.claim_outbound_dispatch(
    _d, '1c6b54a1-5a01-4f69-9145-6bf3235d1f23'::uuid,
    '087a1f2d-7d2b-4aaf-8c70-322838ae0c54'::uuid, 'telegram', null, 'cert-replay-probe');

  perform public.settle_outbound_dispatch(_d, 'sent', 'CERT-PROVIDER-MSG-1', null);

  _second := public.claim_outbound_dispatch(
    _d, '1c6b54a1-5a01-4f69-9145-6bf3235d1f23'::uuid,
    '087a1f2d-7d2b-4aaf-8c70-322838ae0c54'::uuid, 'telegram', null, 'cert-replay-probe');

  -- Fail the migration loudly if replay protection did not hold.
  if (_first ->> 'claimed') is distinct from 'true' then
    raise exception 'REPLAY PROBE FAILED: first claim was not granted: %', _first;
  end if;
  if (_second ->> 'claimed') is distinct from 'false' then
    raise exception 'REPLAY PROBE FAILED: replay was granted: %', _second;
  end if;
  if (_second ->> 'status') is distinct from 'sent'
     or (_second ->> 'provider_message_id') is distinct from 'CERT-PROVIDER-MSG-1' then
    raise exception 'REPLAY PROBE FAILED: replay did not return the original outcome: %', _second;
  end if;

  raise notice 'REPLAY PROBE PASSED: first=% second=%', _first, _second;
end $$;;
