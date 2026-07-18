# Pulse AI 2.0 — Arkitektura e Plotë

## Përmbledhje
Pulse AI është një Business Operating System AI ndërtuar mbi:
- **Frontend**: React (Lovable) → kohablerjeve.top
- **Backend**: Supabase (PostgreSQL + Edge Functions + Auth + Storage)
- **AI**: Lovable Gateway (Gemini) primary + Anthropic Claude fallback
- **Kanalet**: Instagram, WhatsApp Business, Facebook, Telegram, SMS

---

## Zinxhiri i plotë: Nga mesazhi te memoria

```
[Klienti dërgon mesazh — IG/WA/FB/Telegram]
                    ↓
         unified-ai-agent (webhook)
                    ↓
    ┌─────────────────────────────────┐
    │     PARA PËRGJIGJES (sinkron)   │
    │  1. recall-business-context     │
    │     → memoria + sistem prompt   │
    │  2. journey-engine (enrich)     │
    │     → ton sipas fazës           │
    │  3. Lovable/Anthropic AI        │
    │     → gjeneron përgjigje        │
    │  4. sendToChannel               │
    │     → dërgon (<1 sekondë)       │
    └─────────────────────────────────┘
                    ↓
    ┌─────────────────────────────────┐
    │  PAS PËRGJIGJES (async)         │
    │  5. extract-and-store-memory    │
    │  6. journey-engine (update)     │
    │  7. score-and-rank-leads        │
    └─────────────────────────────────┘
```

---

## 8 Shtresat e Arkitekturës

### Shtresa 1: Kanalet (Channels Layer)
- Instagram Graph API v22
- WhatsApp Business Cloud API
- Facebook Messenger API
- Telegram Bot API
- SMS (Twilio)
- **Unified webhook**: 1 endpoint për të gjitha

### Shtresa 2: Siguria (Security Layer)
- JWT authentication (Supabase Auth)
- RLS (Row Level Security) per-biznes
- AES-GCM token encryption
- Device Trust AI (pajisje të reja kërkojnë aprovim)
- Rate limiting: 300 mesazhe/minutë

### Shtresa 3: AI Intelligence (3 nën-shtresa)
- **Business Memory Engine**: 14 lloje memories, confidence decay
- **Revenue Intelligence**: lead scoring, churn prediction, upsell
- **Journey Intelligence**: 9 faza, 8 stile komunikimi

### Shtresa 4: Automatizimet (Automation Layer)
- Sales Sequences (A/B testing + AI personalizim)
- Email Campaigns (si ActiveCampaign)
- Client Success Reminders (7/14/30 ditë)
- Appointment Booking (si Calendly)
- pg_cron: 6 cron jobs automatike

### Shtresa 5: Business Intelligence
- Revenue Engine + pricing AI
- Lead scoring 0-100
- CEO Dashboard live
- Meta Ads + Google Ads ROI
- Vicidial CDR + analiza AI

### Shtresa 6: Administrimi
- Invoices PDF (auto-numbering)
- Contracts (e-sign tokens)
- Google Workspace sync
- Supabase Storage (dokumentet)

### Shtresa 7: Multi-tenant
- Per-biznes izolim (business_id everywhere)
- Workspace switcher
- 6 role types: Owner/Admin/Business/Freelancer/Agent/Ambassador

### Shtresa 8: Infrastruktura
- Supabase (PostgreSQL 15 + PostGIS)
- 120 Edge Functions (Deno runtime)
- 154+ SQL migrations
- GitHub CI/CD
- Vercel (frontend hosting)

---

## Integrimet e Jashtme

### Owner (Platforma — 1 herë):
| Integrim | Secret | Ndikon |
|----------|--------|--------|
| Anthropic API | ANTHROPIC_API_KEY | Fallback AI |
| Meta App | META_APP_ID/SECRET | Të gjitha bizneset |
| Stripe | STRIPE_SECRET_KEY | Billing platform |
| Resend | RESEND_API_KEY | Emaile platform |
| Google Ads | GOOGLE_ADS_* | CEO Dashboard |
| Vicidial | VICIDIAL_* | Telephony |

### Biznes (Çdo biznes vetë):
| Integrim | Si lidhet | Ndikon |
|----------|-----------|--------|
| Instagram | OAuth 1 klikim | DMs + skanim |
| WhatsApp | QR code scan | Mesazhe |
| Facebook | OAuth | Messenger |
| Google Calendar | Service account | Rezervimet |
| Google Drive | Sharing me email | Dokumentet |

---

## Performanca

- **Koha e përgjigjes AI**: < 2 sekonda
- **Throughput**: 300 mesazhe/minutë/kanal
- **Uptime target**: 99.9% (Supabase SLA)
- **Database**: autoscaling deri 100GB
- **Edge Functions**: 0ms cold start (Deno Deploy)

