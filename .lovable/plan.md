# Pulse AI — Migration Plan: SOURCE → TARGET

- **Repository (single source of truth):** `MuslimBram/puls-ai` (branch `main`)
- **SOURCE backend:** `wllvvzzjhnmbydpbvump` (live, 272 tables, 138 edge functions, 518 RLS policies, real data)
- **TARGET backend:** `wlvlgghqwwhhqaqqopml` (empty, not yet linked)
- **Status:** code phase only. No database migration, no deploy, no changes to SOURCE.

## 1. Code changes prepared (NOT yet applied)

| File | Current | After migration |
|---|---|---|
| `.env` | `VITE_SUPABASE_URL/PUBLISHABLE_KEY/PROJECT_ID` = SOURCE | TARGET url + anon key + `wlvlgghqwwhhqaqqopml` |
| `supabase/config.toml` line 1 | `project_id = "wllvvzzjhnmbydpbvump"` | `project_id = "wlvlgghqwwhhqaqqopml"` (keep all `verify_jwt` blocks unchanged) |
| `supabase/functions/mcp/index.ts` line 172 | `var projectRef = "wllvvzzjhnmbydpbvump"` | TARGET ref, or read from `Deno.env.get("SUPABASE_URL")` |
| `src/pages/PublicApi.tsx` lines 297, 299 | hardcoded `https://oazqhnibgfkuiuczzikq.supabase.co/functions/v1/public-api` | build from `import.meta.env.VITE_SUPABASE_URL` |
| `src/integrations/supabase/types.ts` | SOURCE schema | regenerate after restore |
| `docs/generate_report.py` line 453 | doc text only | cosmetic, optional |

Everything else is environment-driven: all edge functions use `Deno.env.get("SUPABASE_URL")`, the frontend uses `import.meta.env.VITE_SUPABASE_*`, MCP tools use `process.env.SUPABASE_URL`. No other hardcoded Supabase host exists in functional code.

## 2. Backup & verification plan (before any DB action)

1. `pg_dump --schema-only` of SOURCE → `backup/schema.sql`
2. `pg_dump --data-only` of SOURCE → `backup/data.sql`
3. Export `auth.users` via Admin API (preserve UUIDs and password hashes)
4. Export storage buckets + objects + bucket policies
5. Record inventory: table count, function count, RLS policy count, row counts per populated table
6. Store the git tag of the pre-migration commit for rollback
7. Rollback path: SOURCE stays untouched and live; if TARGET restore fails, revert the 5 code changes and keep pointing at SOURCE

## 3. Checklist to carry over to TARGET

**Secrets (Edge Function env)**
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_SANDBOX`, PayPal webhook id
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Meta / WhatsApp: app id, app secret, verify token, access tokens
- Twilio: account SID, auth token, phone numbers
- Email: Resend / SMTP keys, `notify.kohablerjeve.top` sender config
- Google: OAuth client id/secret, Ads + Search Console credentials
- `LOVABLE_API_KEY`, any connector gateway keys
- Auto-provided by the platform: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

**Auth / OAuth**
- Site URL + Redirect allow-list (`pulsi.lovable.app`, `kohablerjeve.top`, `www.kohablerjeve.top`, `alfis.re`, preview URL)
- Google and Apple providers re-enabled with the same client ids
- Email confirmation ON, anonymous sign-ups OFF, leaked-password protection ON
- Auth email hook pointed at TARGET `auth-email-hook`
- 24h session timeout / JWT expiry settings

**Webhooks (external dashboards must be re-pointed to the TARGET functions host)**
- Stripe → `stripe-webhook`
- PayPal → `paypal-webhook`
- Meta / WhatsApp → `meta-webhook`, `whatsapp-webhook`
- Twilio → `twilio-inbound-call`, `twilio-twiml`, `twilio-status-callback`
- Generic → `webhook-ingest`, `integration-webhook`, `sms-webhook`, `telegram-webhook`

**verify_jwt overrides to preserve exactly (`supabase/config.toml`)**
- `false`: auth-email-hook, integration-webhook, paypal-webhook, meta-webhook, meta-webhook-test, preview-transactional-email, handle-email-unsubscribe, handle-email-suppression, process-drip-emails, stripe-webhook, whatsapp-webhook, telegram-webhook, sms-webhook, twilio-inbound-call, twilio-twiml, twilio-status-callback, webhook-ingest
- `true`: process-email-queue, send-transactional-email

**Cron / scheduled jobs**
- Email queue dispatch, drip emails, subscription checks, usage resets (`reset_daily_ai_replies`, `reset_monthly_usage`, `reset_expired_media_daily_usage`), account cleanup, ads sync, health monitor
- `pg_cron` + `pg_net` extensions enabled on TARGET

**Storage**
- Recreate every bucket with identical name, public/private flag, size and MIME limits, then re-upload objects and recreate storage policies

**Database extras**
- 65 database functions (all `SECURITY DEFINER` with `search_path = public`)
- 518 RLS policies + explicit `GRANT`s per table
- Enum types (`app_role`, `payment_mode`), triggers, vault secrets

## 4. Sequence

```
SOURCE wllvvzzjhnmbydpbvump  (untouched, stays live)
  → backup (schema, data, auth users, storage)
  → restore into TARGET wlvlgghqwwhhqaqqopml
  → verify (tables, RLS, grants, functions, row counts)
  → secrets + auth + storage + cron on TARGET
  → apply the 5 code changes in MuslimBram/puls-ai
  → deploy 138 edge functions + frontend
  → re-point external webhooks and DNS
  → test: login/OAuth, RLS per role, Stripe/PayPal checkout + webhook,
           WhatsApp/Meta inbound, email queue, MCP, cron, subscription gating
  → only then decommission SOURCE
```

## 5. Open items

- 3 critical privilege-escalation findings (device self-approval, `payout_requests` and `platform_withdrawal_requests` unrestricted status on insert) remain open. Recommended fix location: TARGET, right after restore.
