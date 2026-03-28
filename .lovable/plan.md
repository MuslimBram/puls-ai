

# Fix Build Errors + Convert All Albanian Text to English

## Problem
1. **Build-breaking error in Login.tsx** (lines 625-628): Duplicate Apple button code + stray `>` character + JS comments (`//`) inside JSX
2. **Hardcoded Albanian text** across 10+ files — the app should be **English by default**, with translations only via i18n

## Plan

### Step 1: Fix Login.tsx build errors + convert to English
- Remove duplicate Apple button (lines 625-628) and stray `>`
- Remove JS comments (`//`) on lines 563, 596 — not valid in JSX
- Use `lovable.auth.signInWithOAuth` instead of `supabase.auth.signInWithOAuth`
- Convert ALL Albanian strings to English:
  - "Hyr në Llogari" → "Sign In"
  - "Fut kredencialet..." → "Enter your credentials to sign in"
  - "Fjalëkalimi" → "Password"
  - "Harrove fjalëkalimin?" → "Forgot password?"
  - "Po hyn..." → "Signing in..."
  - "Vazhdo me Google/Apple" → "Continue with Google/Apple"
  - "Nuk ke llogari? Regjistrohu" → "Don't have an account? Sign up"
  - All 2FA strings (Verifikimi, Kodi i Sigurisë, etc.) → English equivalents
  - All toast messages → English

### Step 2: Fix Register.tsx — convert to English
- "Krijo Llogari" → "Create Account"
- "Zgjidhni llojin..." → "Choose account type"
- Account type descriptions → English
- Plan selection labels → English
- Trial info box → English
- Form labels → English
- All toast messages → English
- "Vazhdo me Google/Apple" → "Continue with Google/Apple"

### Step 3: Fix GuidedTour.tsx — convert to English
- All 4 step titles and descriptions → English
- Button text: "Shko atje" → "Go there", "Tjetri" → "Next", "Përfundo" → "Finish"
- "Kalo udhëzuesin" → "Skip tour"

### Step 4: Fix CompletePayment.tsx — convert to English
- "Përfundoni Pagesën" → "Complete Payment"
- "Zgjidhni planin..." → "Select plan and duration..."
- "/muaj" → "/mo"
- "Kurseni" → "Save"

### Step 5: Fix TrialExpiredGate.tsx — convert to English
- "Vazhdo me Pagesën" → "Continue to Payment"
- "Çmimi mujor" → "Monthly price"
- Other Albanian strings → English

### Step 6: Fix other files with Albanian text
- `FreelancerBusinessPurchase.tsx` — convert labels and errors to English
- `RoleDashboardWidgets.tsx` — convert to English
- `UserWalletPanel.tsx` — convert to English
- `AdminSocialChannelManager.tsx` — convert to English
- `BrandingSettingsPanel.tsx` — convert to English

## Files affected
| File | Change |
|------|--------|
| `src/pages/Login.tsx` | Fix build errors + all Albanian → English |
| `src/pages/Register.tsx` | All Albanian → English |
| `src/components/GuidedTour.tsx` | All Albanian → English |
| `src/pages/CompletePayment.tsx` | All Albanian → English |
| `src/components/TrialExpiredGate.tsx` | All Albanian → English |
| `src/components/FreelancerBusinessPurchase.tsx` | All Albanian → English |
| `src/components/RoleDashboardWidgets.tsx` | All Albanian → English |
| `src/components/UserWalletPanel.tsx` | All Albanian → English |
| `src/components/AdminSocialChannelManager.tsx` | All Albanian → English |
| `src/components/BrandingSettingsPanel.tsx` | All Albanian → English |

