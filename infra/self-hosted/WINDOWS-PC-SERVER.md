# Pulse AI — Windows PC as self-hosted Supabase server

## Goal

Temporarily replace the unavailable managed Supabase backend with a self-hosted Supabase stack running on the Windows PC, while keeping the Pulse AI frontend on Vercel.

This is a continuity/first-client path. The previous managed project must NOT be deleted. When billing is restored, the managed project remains a separate recovery/source system until data reconciliation is explicitly completed.

## Target architecture

Browser
  -> https://pulse-bos.com
  -> Vercel frontend

Frontend environment
  VITE_SUPABASE_URL=https://api.pulse-bos.com
  VITE_SUPABASE_PUBLISHABLE_KEY=<self-hosted publishable key>

Public backend
  https://api.pulse-bos.com
  -> Cloudflare Tunnel
  -> Windows PC
  -> Caddy/HTTPS
  -> Supabase API gateway :8000
  -> Auth / REST / Realtime / Storage / Edge Functions
  -> PostgreSQL

No PostgreSQL port is exposed to the public Internet.

## Windows host requirements

Supabase currently documents Docker as the recommended self-hosting path. Their current minimum for the complete stack is 4 GB RAM / 2 CPU cores / 40 GB SSD; 8 GB+ RAM, 4 cores and 80 GB+ SSD are recommended.

Install:
- Docker Desktop for Windows
- WSL2 integration
- Git

Host policy:
- Docker Desktop starts automatically with Windows
- Windows sleep/hibernate is disabled while acting as the server
- Prefer wired Ethernet
- Prefer UPS power protection
- Windows Firewall allows only the local Docker/Cloudflare paths required
- Never expose Postgres directly

## Supabase installation

Use the official Supabase self-hosted Docker distribution from the current stable self-hosted release. Do not copy an ad-hoc compose file from this repository and do not pin to an old example release without checking the current official release.

The self-hosted stack must include:
- API gateway
- Auth
- Postgres
- Realtime
- Storage
- Edge Functions
- Studio

Start with the complete stack. Remove optional services only after the first production certification.

## Public HTTPS

Use Cloudflare Tunnel for the public API hostname:

  api.pulse-bos.com -> Windows PC -> local Supabase gateway

Cloudflare Tunnel avoids inbound router port forwarding and can run as a Windows service.

Supabase production guidance requires HTTPS in front of the API gateway and recommends a reverse proxy such as Caddy or Nginx. WebSocket support is required for Realtime.

Expected Supabase URLs:
- SUPABASE_PUBLIC_URL=https://api.pulse-bos.com
- API_EXTERNAL_URL=https://api.pulse-bos.com/auth/v1
- SITE_URL=https://pulse-bos.com

Google OAuth must use:
- https://api.pulse-bos.com/auth/v1/callback

The frontend redirect remains:
- https://pulse-bos.com/auth/callback

## API keys

Use the current self-hosted key model:
- publishable key in the browser
- secret key only in backend/server components

Do not commit .env or any secret key to Git.

The existing Pulse AI client already reads:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Therefore the frontend does not need a provider-specific rewrite to switch from managed Supabase to the PC backend.

## Pulse AI Edge Functions

The repository contains the Pulse AI Edge Functions under:
- supabase/functions/

For self-hosting, place the function code under the self-hosted instance's:
- volumes/functions/

The shared modules and every function required by the first-client journey must be copied as a coherent tree.

Do not deploy only one function and call the migration complete.

Priority runtime functions:
1. auth-related functions
2. save-channel-credentials
3. enforce-limits
4. inbound-ai-reply
5. ai-router dependencies
6. business scan functions
7. generate-media
8. payment/webhook functions
9. WhatsApp / Telegram send/inbound functions
10. all remaining functions needed by exercised UI paths

## Database

The database schema must be reconstructed from the repository's ordered migrations.

Important:
- Run migrations in repository order.
- Verify every migration applies cleanly.
- Do not guess missing data.
- Do not remove security/RLS migrations just to make a screen work.
- Preserve workspace_id and business_id tenant boundaries.
- Preserve the canonical plan catalogue and entitlement gates.

Current commercial channel quota:
- Standard = 2
- Professional = 4
- Advanced = 8
- Enterprise = unlimited

## Data migration from the unavailable managed project

Do NOT assume the old managed project data is retrievable while it is inactive.

There are two separate paths:

A. Managed project becomes accessible again:
- export roles/schema/data
- restore into self-hosted
- restore Storage objects separately
- redeploy functions
- validate Auth/OAuth
- reconcile secrets
- run tenant/isolation checks

B. Managed project remains unavailable:
- build a clean self-hosted database entirely from repository migrations
- create a new controlled Admin account
- create/recreate the real Pulse AI business profile in the self-hosted workspace
- rescan https://pulse-bos.com
- regenerate canonical business knowledge
- reconnect channels
- reconfigure payment providers and AI provider secrets

Path B is usable for first-client continuity, but it is NOT a claim that historical production data has been migrated.

## First-client pilot

Pilot business:
  Pulse AI

Sequence:
1. Admin login with mandatory MFA
2. Workspace available
3. Pulse AI business profile exists
4. Scan https://pulse-bos.com
5. Business scan completes
6. Canonical business knowledge exists
7. AI reads only Pulse AI business context
8. Connect first real channel using secure business binding
9. Package quota is enforced
10. Test real inbound/outbound
11. Test campaign creation
12. Test media entitlement and quota behavior
13. Test Stripe/PayPal entitlement path
14. Run Golden Journey
15. Run final CI certification

## Recovery / rollback

The Vercel frontend remains on the existing domain.

Switching backend providers is done by changing Vercel environment variables:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Do not change application code merely to switch the backend URL.

The previous managed project remains untouched as a recovery target.

## Security non-negotiables

- Never expose Postgres directly.
- Never publish service/secret keys to the browser.
- Keep RLS enabled.
- Unknown entitlement configuration fails closed.
- No arbitrary first-business fallback.
- Every channel and website connection is bound to an explicit business.
- Every inbound AI request resolves business context from the bound channel/business.
- Visitor/public paths never receive private workspace data.
- Production secrets are stored outside Git.

## Definition of DONE

The PC-server migration is not considered complete until:
- Docker stack is healthy
- HTTPS endpoint is reachable
- Auth email login works
- Google OAuth works
- Google Authenticator enrollment/challenge works
- browser Supabase client works against the PC server
- Edge Functions invoke successfully
- DB migrations are complete
- RLS/tenant isolation checks pass
- Pulse AI business scan completes
- channel creation stores the correct business_id
- package limits enforce 2/4/8/unlimited
- real WhatsApp/Telegram test passes
- payment entitlement test passes
- Golden Journey passes

## Official references

- Supabase Self-Hosting: https://supabase.com/docs/guides/self-hosting
- Supabase Self-Hosting with Docker: https://supabase.com/docs/guides/self-hosting/docker
- Supabase HTTPS / Reverse Proxy: https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https
- Supabase Self-hosted Functions: https://supabase.com/docs/guides/self-hosting/self-hosted-functions
- Supabase Restore Platform Project: https://supabase.com/docs/guides/self-hosting/restore-from-platform
- Supabase Self-hosted OAuth: https://supabase.com/docs/guides/self-hosting/self-hosted-oauth
- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/
- Cloudflare Tunnel as Windows service: https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/windows/
