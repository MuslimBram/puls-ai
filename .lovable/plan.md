
# Complete Project Audit — Plan

Deliverable: a single PDF draft at `/mnt/documents/project-audit-v1.pdf` (plus the source markdown at `/mnt/documents/project-audit-v1.md` for future revisions). All 18 sections, full depth, every page / table / edge function listed individually. Sources = current codebase + chat history.

## Process

### Phase 1 — Data collection (parallel, read-only)
Spawn 6 background subagents in parallel, each writing its findings to a JSON file in `/tmp/audit/`:

1. **Pages & routes agent** — enumerate `src/App.tsx` routes + every file in `src/pages/`. For each: route path, guard (Protected/Permission), hooks used, tables touched, edge functions called, TODO/placeholder markers, line count.
2. **Database agent** — for each of the ~230 tables: columns, RLS status, policy count, referenced-by (grep across `src/` and `supabase/functions/`), foreign keys via `supabase--read_query` on `information_schema`. Flag orphan / unused tables.
3. **Edge functions agent** — list every dir under `supabase/functions/`, read each `index.ts` header, classify (auth required? cron? webhook?), check `config.toml` for JWT settings, find call sites.
4. **Integrations agent** — inspect `unified_connections`, `external_integrations`, `channel_registry`, `src/integrations/external/providers/*`, Meta/Telegram/Twilio/PayPal/Stripe code paths. Mark Implemented / Mock / Missing per provider.
5. **Billing & commissions agent** — verify `pricing_settings`, `subscriptions`, `partner_commissions` (first-payment-only rule), `paypal_transactions`, Stripe webhook, wallet flows, refunds, freelancer 40% discount.
6. **Security agent** — run `supabase--linter` + `security--get_scan_results`, cross-check `user_roles`, `has_role()` definer functions, RLS coverage, 2FA (`totp_secrets`, `Require2FASetup`), session/auto-logout, audit logs, secrets handling.

In parallel with subagents, I directly run:
- `chat_search--recall_chat_history` queries for original feature requests (sweep in 4 windows of ~500 msgs each) to populate Section 2 "Requested by user".
- `supabase--linter` for fresh security findings.

### Phase 2 — Report synthesis
Merge all 6 JSON files + chat-history findings into one master markdown with the exact 18 sections the user listed. Use real numbers; never assume functionality exists if grep finds no implementation. Per-feature status uses: Completed / Partially Completed / Started / Not Started / Missing. Section 16 scorecard derived from counts (e.g. Backend % = working edge functions ÷ total).

### Phase 3 — PDF generation + QA
Render markdown → PDF using ReportLab Platypus (US Letter, 1" margins, Arial-equivalent, monospace code blocks, page numbers, TOC). Then per the pdf skill QA rules:
1. `pdftoppm -jpeg -r 150` → inspect every page image, not just the first.
2. Fix overflow, broken tables, clipped headings. Re-render until clean.
3. Write final to `/mnt/documents/project-audit-v1.pdf` and emit `<presentation-artifact>` tag.

## Technical details

- Subagents are read-only; nothing in the project is modified.
- Output files live under `/mnt/documents/` (persistent) and `/tmp/audit/` (scratch).
- Total expected length: ~60–100 PDF pages.
- No code changes, no migrations, no secret reads.
- Estimated runtime: 4–8 minutes wall clock (subagents run in parallel).

## What the report will NOT do

- Will not auto-fix any issue it finds — the user can ask for fixes per-item afterward.
- Will not invent features. If a page is a stub, it is reported as a stub.
- Will not include service-role keys, DB passwords, or other secrets.

After approval I switch to build mode and execute Phase 1 immediately.
