# Dorëzimi 2026-11-28 — Politika e partnerëve (owner-v1) + Telefonia me 5 ofrues

Dega: `claude/loving-bardeen-xumvuo`. **Asgjë nuk është vendosur në Production.** Migrimi është i përgatitur dhe nuk është aplikuar.

---

## A. Politika zyrtare e partnerëve dhe referimeve

### 1. Si ishte historikisht (para kësaj dege)

| Vendi | Çfarë thoshte / bënte |
|---|---|
| `src/i18n/sq.ts` (FAQ) | 35% jetësor; Freelancer 35% + 40% menaxhim; Ambasador 35% |
| `src/i18n/en.ts`, `FAQSection.tsx`, `AffiliateTerms.tsx`, AI Help | "Nuk premtojmë përqindje fikse ose komision jetësor" |
| `ReferralProgram.tsx` | 15% e çdo blerjeje, në portofol "automatikisht" |
| `ReferralIncentivePopup.tsx` | "15% e gjithçkaje që shpenzojnë — përgjithmonë" |
| `PartnerDashboard.tsx` | Vetëm fatura e parë, asnjë komision për rinovime |
| `useFreelancerRelations.ts` | Shkruante 35 / 40 në `commission_rate` |
| Backend (`generate-commissions`, `stripe-webhook`) | Vetëm pagesa e parë × `partner_accounts.commission_rate` |
| Databaza | `commission_rate DEFAULT 0` dhe regjistrimi nuk e plotësonte kurrë → **0%** për çdo partner |
| Programi i referimit të zakonshëm | **Nuk ishte i lidhur fare**: `reward_amount` mbetej 0, askush nuk e llogariste |

### 2. Politika që zbatohet tani

Burimi i vetëm: `supabase/functions/_shared/commission-policy.ts` (i njëjti kod në backend, faqe dhe AI Help).

| Programi | Pagesa e parë | Rinovimet |
|---|---|---|
| Referim | 15% (një herë) + biznesi merr 15% zbritje | 0% |
| Freelancer | 15% (një herë) + 20% e tarifave të menaxhimit **të arkëtuara** | vetëm 20% e tarifave të arkëtuara |
| Ambasador | 15% jetësor + 15% bonus = **30%** | 15% |

Llojet e komisionit janë të ndara: `referral_commission`, `management_fee_commission`, `ambassador_lifetime_commission`, `ambassador_first_payment_bonus` (+ `legacy_first_payment` për rreshtat e vjetër).

### 3. Shembuj llogaritjeje (paketa Standard 9,900 L/muaj)

| Rasti | Llogaritja | Rezultati |
|---|---|---|
| Biznes i referuar, pagesa e parë me 15% zbritje | 9,900 × 0.85 | paguan **8,415 L** |
| Referues — pagesa e parë | 15% × 8,415 | **1,262.25 L** (një herë) |
| Freelancer — pagesa e parë | 15% × 8,415 | **1,262.25 L** |
| Freelancer — tarifë menaxhimi e arkëtuar 20,000 L | 20% × 20,000 | **4,000 L** |
| Ambasador — pagesa e parë | 30% × 8,415 | **2,524.50 L** |
| Ambasador — çdo rinovim 9,900 L | 15% × 9,900 | **1,485 L / muaj** |
| Rimbursim i plotë para miratimit | — | komisioni anulohet |
| Chargeback pas miratimit | — | rresht negativ, portofoli zbret, historiku ruhet |

Komisioni llogaritet mbi shumën **e paguar realisht**, prandaj zbritja 15% e ul edhe komisionin e pagesës së parë.

### 4. Backend

- `_shared/commission-engine.ts`: motori, idempotent sipas `(përfituesi, lloji, pagesa burimore)`.
- `_shared/commission-store-supabase.ts`: ruajtja; lëvizjet e parave bëhen me funksione SQL atomike.
- `stripe-webhook`: përdor motorin; një rresht pagese për faturë (dërgimi i përsëritur nuk dyfishon); `charge.refunded` → kthim pro rata; **i ri** `charge.dispute.created` → chargeback.
- `generate-commissions`: i pavarur nga ofruesi (Stripe, PayPal, manual) + tarifat e menaxhimit + rimbursimet.
- `approve-commissions`: pret 7 ditë; mban partnerët e pezulluar ose me sinjalizim mashtrimi; kreditor shpërblimet e referimit në portofol.
- `create-checkout`: 15% zbritje edhe për kodet e referimit të zakonshëm; vetëm në pagesën e parë; zbritjet nuk mblidhen (merret më e madhja).
- Butonat Approve/Cancel të adminit: tani RPC atomike server-side (më parë një klik i dyfishtë mund ta kreditonte dy herë).

### 5. Databaza — `supabase/migrations/20261128120000_partner_referral_policy_owner_v1.sql`

- `commission_policy_rules`: kopja e auditueshme e normave (një test garanton që përputhen me kodin).
- `partner_accounts.partner_program` (`freelancer` | `ambassador`, i plotësuar nga rolet). `commission_rate` mbetet si fushë **legacy**, motori nuk e lexon më → nuk mund të bëhet më 0% në heshtje.
- Kolona të reja në `partner_commissions` + indekse unike; asnjë rresht ekzistues nuk fshihet ose rillogaritet.
- Tabela të reja: `partner_management_fees`, `referral_rewards`.
- Funksione: `refresh_partner_pending`, `reverse_partner_commission`, `credit_referral_reward`, `reverse_referral_reward`, `admin_approve_partner_commission`, `admin_cancel_partner_commission`.
- Hiqet politika që lejonte klientin të shkruante vetë `business_referrals` (rrezik: referim i falsifikuar).

### 6. Siguria dhe mashtrimi

Të testuara: vetë-referimi (pronari, paguesi, anëtari i workspace-it), partneri i pezulluar, pagesat e papaguara/dështuara/të rimbursuara/të kontestuara, dyfishimi nga webhook-u, kthimi i plotë dhe pro rata, kthimi i dyfishtë, pagesat para datës së politikës (nuk rillogariten), dhe mosdyfishimi mes partnerit dhe referuesit të zakonshëm.

### 7. Testet (të ekzekutuara)

| Skedari | Rezultati |
|---|---|
| `src/__tests__/commissions/commissionPolicy.test.ts` | 38/38 PASS |
| `src/__tests__/commissions/policyConsistency.test.ts` | 11/11 PASS |
| `src/__tests__/telephony/telephonyProviders.test.ts` | 34/34 PASS |
| Testet ekzistuese të përditësuara (`phaseFProductTruthClosure`, `publicAiProductExpert`, `channelCredentialStorageSafety`, `voiceAiRelayWorkspaceBoundary`) | PASS |
| I gjithë suita | 2171 PASS, **23 FAIL** — të njëjtat 23 dështonin edhe në `main` para ndryshimeve (OrbitSelector, nav, faza0 `.catch` etj.) |
| `npm run build` | OK |
| ESLint mbi skedarët e ndryshuar | 0 gabime |

---

## B. Telefonia: Twilio, Telnyx, Plivo, Vonage, Custom SIP

| Ofruesi | Hyrëse + IVR | Dalëse | Mbyll / mbaj / transfero | Softphone në shfletues | AI me zë | Zë shqip |
|---|---|---|---|---|---|---|
| Twilio | ✔ | ✔ | ✔ | ✔ | ✔ | jo i verifikuar (përdorni audio) |
| Telnyx | ✔ | ✔ | ✔ | ✗ | ✗ | **✔ Azure sq-AL (Anila/Ilir)** |
| Plivo | ✔ | ✔ | ✔ | ✗ | ✗ | jo i verifikuar |
| Vonage | ✔ | ✔ | ✔ | ✗ | ✗ | jo i verifikuar |
| Custom SIP | ✔ (përmes urës) | ✔ | ✔ | sipas urës | ✗ | sipas urës |

- `_shared/telephony/`: veprimet neutrale (TwiML / TeXML / Plivo XML / Vonage NCCO), motori IVR, adapterët REST, nënshkrimet.
- `telephony-webhook`: funksion i ri për 4 ofruesit; token sekret në URL (ruhet hash) + nënshkrimi i ofruesit (ed25519 / HMAC / JWT).
- `save-channel-credentials`: verifikim te ofruesi, enkriptim, URL-të e webhook-ut tregohen një herë.
- `telephony-call-manager`: thirrjet bëhen përmes çdo ofruesi.
- Faqja e konfigurimit: krahasim çmimesh + pse zgjidhet secili ofrues + gjuha dhe regjistri (standard/gegë/toskë).
- **Gabim i ndrequr te Twilio IVR**: një ridrejtim te nyja X luante nyjen PAS X-it (thirrësit kapërcenin përshëndetjen/menynë).
- **Recepsionisti AI nuk ishte i lidhur kurrë me thirrjet**: tani lidhet kur `voice_ai_enabled` është aktiv, në gjuhën e kanalit.
- Dialekti: AI-ja përshtat fjalorin gegë/toskë; zëri sintetik mbetet shqip standard.

---

## C. Pengesat që mbeten (duhen bërë para Production)

1. **Migrimi nuk është ekzekutuar kundër Postgres-it** (sandbox-i bllokoi parser-in SQL). Ekzekutojeni së pari në staging.
2. Rigjeneroni `src/integrations/supabase/types.ts` pas migrimit (kodi përdor cast-e deri atëherë).
3. **Asnjë ofrues telefonie nuk është testuar live** (nuk ka kredenciale). Të verifikohen në llogari prove:
   - Telnyx `POST /v2/texml/calls/{id}/update`;
   - `SipAuthUsername` në TeXML;
   - forma e URL-së për nënshkrimin V2 të Plivo-s;
   - `notify` i Vonage.
4. Stripe Dashboard: aktivizoni ngjarjen `charge.dispute.created` për webhook-un.
5. `generate-commissions` dhe `approve-commissions` nuk janë të planifikuara në repo (pg_cron). Kontrolloni nëse janë në dashboard.
6. Zbritja 15% për biznesin e referuar zbatohet vetëm te Stripe checkout; PayPal dhe pagesat manuale ende jo.
7. Interpretim që duhet konfirmuar nga pronari: zbritja 15% vlen për çdo biznes të referuar (edhe nga Freelancer/Ambasador).
8. Zbritja 40% e freelancerit për blerje paketash (`FreelancerBusinessPurchase.tsx`) nuk mbulohet nga politika; nuk është prekur.
9. Zbritja vjetore te PayPal ishte 15% (në vend të 20% si gjetkë); është ndrequr në 20%, sipas vendimit të 25.11.

## D. Lista për vendosjen në Production

1. Rishikim i PR-së; migrimi aplikohet në staging; ekzekutohen `generate-commissions` dhe `approve-commissions` mbi të dhëna prove.
2. Aplikohet migrimi në Production (me autorizim të veçantë) → rigjenerohen tipet.
3. Vendosen funksionet: `stripe-webhook`, `generate-commissions`, `approve-commissions`, `create-checkout`, `create-paypal-order`, `ai-help-bot`, `save-channel-credentials`, `telephony-call-manager`, `telephony-webhook`, `twilio-inbound-call`, `voice-ai-relay`.
4. Aktivizohet `charge.dispute.created` në Stripe; planifikohen dy cron-et.
5. Testohet një thirrje live për secilin ofrues para se t'u ofrohet klientëve.
