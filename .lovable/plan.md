

# Production Readiness: Full Hardening Plan

## Overview
This plan addresses all critical items needed before production: remaining Albanian text, RBAC enforcement, subscription logic, onboarding flow, pricing source-of-truth, and security fixes.

---

## Phase 1: Language Cleanup (Remaining Albanian → English)

**Files with hardcoded Albanian text still present:**

| File | What to fix |
|------|------------|
| `src/config/plans.ts` | `PACKAGE_VARIANTS` labels ("Mujore", "3 muaj", "6 muaj", "Vjetore"), `formatLimit` ("Pa limit") |
| `src/components/ProtectedRoute.tsx` | Trial expired dialog (lines 88-120) — all Albanian |
| `src/components/AdminWithdrawalApproval.tsx` | "Statusi u përditësua", "Vendos", description text |
| `src/components/AdminWebScanner.tsx` | "Po skanon", "Skano & Ruaj", "Nuk ka skanime" etc. |
| `src/components/AdminPlatformWallet.tsx` | "Portofoli i Platformës", "Kërko Tërheqje" etc. |
| `src/components/WithdrawalRequestPanel.tsx` | "Vendosni një shumë", "Kërko tërheqje", "Zgjidhni" |
| `src/components/FreelancerBusinessPurchase.tsx` | Eligibility message fallback in Albanian |
| `src/components/landing/CompetitorComparison.tsx` | "Shumë pak", "AI vendime biznesi", heading text |
| `src/pages/BusinessProfile.tsx` | "Vetëm për Referime" |
| DB function `check_freelancer_discount_eligibility` | Albanian message strings |
| DB function `check_freelancer_relation_eligibility` | Albanian error messages |
| DB function `check_asset_duplicate` | Albanian message |

**Action**: Replace all Albanian strings with English equivalents in each file + create migration to update DB function messages.

---

## Phase 2: Role-Based Access Control (RBAC) Enforcement

### Current Issues
- Sidebar shows ALL nav items to ALL roles (no filtering by role)
- No route-level access control for Freelancer vs Ambassador vs Business
- `business_owner` has `bypassSubscription: true` — must be removed for production

### Changes

**A. Sidebar filtering** (`src/components/layout/Sidebar.tsx` + `nav-config.ts`):
- Add `requiredPermission` or `allowedRoles` field to `NavItem` interface
- Filter nav items based on `useRolePermissions()` permissions
- Ambassador: show ONLY referral dashboard, wallet, profile
- Freelancer: show assigned business management items + referral dashboard
- Business: show full business nav (current behavior)
- Agent: show only Inbox, CRM (no billing, channels, integrations)

**B. Route guards** (`src/App.tsx`):
- Wrap routes with role-check components
- Ambassador accessing `/crm` → redirect to `/partner` or `/referral`
- Agent accessing `/channels` → redirect to `/inbox`

**C. Remove `bypassSubscription` from `business_owner`** (`src/hooks/useRolePermissions.ts` line 130):
- Set `bypassSubscription: false`, `bypassFeatureGating: false`, `bypassUsageLimits: false`
- Keep bypass only for `admin` and `super_admin`

**D. Fix ProtectedRoute bypass** (`src/components/ProtectedRoute.tsx` line 61):
- Remove `"business_owner"` from `bypassRoles` array

---

## Phase 3: Subscription Logic Fix

### Define "Active Business" clearly

**Edge function `check-subscription`** + **DB queries**:
- Active = `payment_status IN ('active', 'paid')` AND `(package_end_at IS NULL OR package_end_at > now())`
- Trial = `payment_status = 'trial'` AND `trial_end > now()`
- Everything else = inactive

**Referral counting** (already handled by `check_freelancer_discount_eligibility` function — verify it matches above logic).

### Referral Status System
Add `referral_status` column to `freelancer_business_relations` with values: `invited`, `registered`, `trial`, `active`, `expired`, `canceled`. Create a trigger or periodic function to sync status based on the referred business's subscription state.

---

## Phase 4: Onboarding Flow Correction

### Current flow (Register.tsx)
1. Select account type → 2. Select plan → 3. Enter credentials → Sign up

**This is correct** — payment happens AFTER account creation via `/complete-payment`. The plan/duration selected at registration is stored in metadata and the user gets a 7-day trial. No changes needed to the registration order.

### Fix needed
- Remove `BASE_PRICES` / `PLAN_TIERS` hardcoded in `Register.tsx` (lines 24-29)
- Fetch plan names and prices from `pricing_settings` table dynamically
- Same for `DURATION_OPTIONS` — derive from `PACKAGE_VARIANTS` or backend

---

## Phase 5: Remove Hardcoded Pricing

**Files with hardcoded prices:**
- `src/pages/Register.tsx`: `PLAN_TIERS` with €49, €99, €199, €399
- `src/config/plans.ts`: `PACKAGE_VARIANTS` with discount percentages
- Various components referencing `plans.ts` exports

**Action**: 
- Use `useMonetizationCatalog()` hook (already exists) to fetch from `pricing_settings`
- Replace `PLAN_TIERS` in Register with dynamic data
- Keep `PACKAGE_VARIANTS` structure but populate from backend where possible

---

## Phase 6: Security Fixes

| Issue | Fix |
|-------|-----|
| CORS wildcard (`*`) | Replace with specific origin in production edge functions |
| `bypassSubscription` for business_owner | Remove (Phase 2C above) |
| Plaintext credentials in custom_channel_adapters | Migration: move to Supabase Vault `vault.create_secret()` |
| Password protection | Enable HIBP check via Cloud Auth Settings |
| `PAYPAL_WEBHOOK_ID` missing | Add secret for webhook signature verification |

---

## Phase 7: Minimum Functional Modules

### CRM
- Already has tables (`deals`, `leads`, `contacts`) and UI (`src/pages/CRM.tsx`)
- Need: seed real test data, verify CRUD operations work end-to-end

### Analytics
- `compute_executive_summary`, `compute_funnel_analytics`, `compute_channel_performance` DB functions exist
- Need: wire these to the Analytics page with real data instead of placeholders

---

## Implementation Order

1. **Albanian → English** (all files + DB functions) — 1 step
2. **RBAC: Sidebar + Route guards** — 1 step  
3. **Remove business_owner bypass** — 1 step
4. **Dynamic pricing in Register** — 1 step
5. **Referral status system** — 1 step (migration + sync logic)
6. **Security: CORS + Vault** — 1 step
7. **CRM + Analytics real data wiring** — 1 step

**Estimated file changes**: ~20 files modified, 2-3 new migrations

