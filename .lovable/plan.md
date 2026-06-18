
# Plan — Menu Reorg + Partner Commission (First Payment Only)

## 1. Sidebar Reorganization (`src/components/layout/nav-config.ts`)

Add 3 new groups, remove duplicates from existing groups, keep all routes functional (no dead links). Each sub-item maps to an existing real page using query params for sub-views where a dedicated page does not yet exist.

### Group: **Content Studio** (icon: Sparkles)
| Label | Route |
|---|---|
| Create Content | `/media-studio?tab=create` |
| AI Images | `/media-studio?tab=images` |
| AI Videos | `/media-studio?tab=videos` |
| AI Posts | `/media-studio?tab=posts` |
| Content Library | `/media-studio?tab=library` |
| Calendar | `/content-calendar` (existing page, route added if missing) |

Will verify `MediaStudio.tsx` already reads `?tab=` and route registration for `/content-calendar`. If missing, add the route to `App.tsx` (existing `ContentCalendar.tsx` page).

### Group: **Business Scanner** (icon: Radar)
| Label | Route |
|---|---|
| Website Analysis | `/sources?type=website` |
| Product Analysis | `/sources?type=product` |
| Service Analysis | `/sources?type=service` |
| Social Media Analysis | `/sources?type=social` |
| SEO Analysis | `/seo-audit` |
| Competitor Analysis | `/competitor-intelligence` |

`Sources.tsx` will be extended to read `?type=` and filter the scanner UI to that asset type (light additive change, no new logic).

### Group: **AI Business Advisor** (icon: Brain)
| Label | Route |
|---|---|
| Suggested Posts | `/ai-decisions?tab=posts` |
| Suggested Offers | `/ai-decisions?tab=offers` |
| Suggested Replies | `/ai-decisions?tab=replies` |
| Suggested Campaigns | `/ai-decisions?tab=campaigns` |
| SEO Opportunities | `/ai-decisions?tab=seo` |
| Competitor Insights | `/ai-decisions?tab=competitors` |

`AIDecisions.tsx` already aggregates `ai_suggested_actions` + recommendations; add a tab filter reading `?tab=` to scope cards to each advisor area. All data is live (no placeholders) — pulled from `ai_suggested_actions`, `offer_suggestions`, `reply_drafts`, `competitive_signals`, `scan_insights` already in DB.

### Cleanup in existing groups
- Remove from **Intelligence**: `Competitor Intel`, `SEO Audit` (moved to Business Scanner)
- Remove from **Engagement**: `Media Studio` (moved to Content Studio)
- Remove from **Growth & AI Core**: `AI Decisions` (moved to AI Business Advisor)
- Remove from **Admin**: `Sources & Scanner` duplicate (Business Scanner now exposes it to users)

## 2. Verification pass (no placeholders)

For every menu item above, confirm:
- Route registered in `src/App.tsx`
- Page renders real data (hook hits Supabase, not mock arrays)
- CRUD/filters/integrations wired to existing tables

Will produce a short verification table in the final summary listing each item as **Fully Working** / **Backend Ready** / **UI Only**. Any item that is not Fully Working will get a tracked TODO note rather than being hidden — but no new placeholder UI will be created.

## 3. Partner Commissions — First Payment Only

### Rule
A partner earns commission **only on the referred customer's first paid invoice**. No commission on renewals, plan upgrades, additional purchases, or recurring monthly billing.

### Backend changes

**a. Schema** (migration)
- Add column `partner_commissions.is_first_payment boolean not null default true`
- Add `partner_commissions.source_invoice_id text` (idempotency key from payment provider)
- Unique partial index: `(partner_id, workspace_id) where is_first_payment = true` — guarantees one commission per referred workspace, ever.

**b. `supabase/functions/generate-commissions/index.ts`** — rewrite logic:
- Skip workspace if a commission already exists for it (regardless of period).
- Only generate when the workspace's **first** successful payment is detected (check `paypal_transactions` / `billing_history` for earliest `status='completed'` record for that workspace).
- Use that earliest invoice's amount as `gross_amount` (not the monthly plan price).
- Set `is_first_payment = true`, `source_invoice_id = <invoice/transaction id>`.
- Remove monthly period loop — commission generation becomes event-style (still safe to run on cron; it becomes a no-op after first payment).

**c. PayPal webhook hook** (`paypal-webhook` function): on `PAYMENT.SALE.COMPLETED` / first successful capture for a referred workspace, immediately trigger commission insert (so partners see credit without waiting for cron).

### UI changes
- `src/pages/PartnerDashboard.tsx` — relabel "Monthly Commissions" → "Referral Commissions (first payment)"; add helper text: *"You earn commission only on each referred customer's first paid invoice. Renewals are not commissionable."*
- `src/pages/Admin.tsx` partner commissions tab — same copy update; payout calculator updated automatically since it reads from `partner_commissions`.
- `src/hooks/usePartner.ts` / `usePartnerWallet.ts` — no schema-breaking change; queries continue to work. Add filter helper `isFirstPayment` for display badge.

### Reports / payouts
- Payout calculation already sums `partner_commissions.commission_amount`. Because new logic inserts at most one row per referred workspace, totals reflect first-payment-only automatically.
- Backfill: one-time SQL in the migration to mark all historical rows `is_first_payment = true` for the earliest row per (partner_id, workspace_id) and **delete duplicates** (after archiving to `partner_commissions_archive` table). Will confirm archive approach with user before deletion.

## 4. Out of scope (explicit)
- No new pages created. No new content generation features. No new scanner logic. No new advisor logic. This is reorg + commission rule only.

## 5. Deliverables
1. Updated `nav-config.ts`
2. Tab-param support added to `MediaStudio`, `Sources`, `AIDecisions` (read-only filter, no business logic change)
3. Route registration for `/content-calendar` if missing
4. Migration: commission schema + backfill
5. Edge function rewrite: `generate-commissions`
6. Webhook hook for first-payment trigger
7. UI copy updates on Partner Dashboard + Admin
8. Verification table (Fully Working / Backend Ready / UI Only) for every new menu item

**Awaiting your explicit "ok continue" before implementation.**
