# Pulse AI 2.0 — Arkitektura e Plotë

## Përmbledhje
Pulse AI është një Business Operating System AI ndërtuar mbi:
- **Frontend**: React + Vite → pulse-bos.com (kohablerjeve.top mbetet vetëm domain tranzicioni)
- **Hosting**: Vercel
- **Backend**: Supabase (PostgreSQL + Edge Functions + Auth + Storage)
- **AI**: canonical Pulse AI multi-provider router me provider selection/failover të centralizuar
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
    │  3. Pulse AI Router             │
    │     → zgjedh provider/model     │
    │     → gjeneron përgjigje        │
    │  4. sendToChannel               │
    │     → dërgon përgjigjen         │
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
- **Unified webhook** për hyrjet e mbështetura

### Shtresa 2: Siguria (Security Layer)
- JWT authentication (Supabase Auth)
- RLS (Row Level Security) per-biznes/workspace
- AES-GCM token encryption
- Device Trust AI
- Rate limiting sipas endpoint-it/provider-it

### Shtresa 3: AI Intelligence (3 nën-shtresa)
- **Business Memory Engine**
- **Revenue Intelligence**: lead scoring, churn prediction, upsell
- **Journey Intelligence**: fazat dhe stilet e komunikimit
- **Canonical AI Router**: provider selection, failover, workspace authorization dhe usage accounting në një rrugë të centralizuar

### Shtresa 4: Automatizimet (Automation Layer)
- Sales Sequences (A/B testing + AI personalizim)
- Email Campaigns
- Client Success Reminders
- Appointment Booking
- pg_cron për worker-at e planifikuar

### Shtresa 5: Business Intelligence
- Revenue Engine + pricing intelligence
- Lead scoring
- CEO Dashboard
- Ads/ROI analytics sipas integrimeve aktive
- Telephony analytics sipas provider-it të konfiguruar

### Shtresa 6: Administrimi
- Invoices PDF
- Contracts
- Google integrations sipas konfigurimit
- Supabase Storage (dokumentet)

### Shtresa 7: Multi-tenant
- Izolim me workspace/business context
- Workspace switcher
- Role-based authorization

### Shtresa 8: Infrastruktura
- Supabase (PostgreSQL + Edge Functions)
- GitHub CI/CD
- Vercel (frontend hosting)
- Provider integrations të ndara nga application layer

---

## Runtime integrations

### AI
- Pulse AI Router është rruga canonical për text AI.
- Provider credentials qëndrojnë server-side.
- Image generation përdor media-provider abstraction; provider-i aktiv i target-it të ri është Replicate.

### Email
- Transactional/auth queues ruhen në Supabase.
- Delivery target i runtime-it të ri është Resend.
- Supabase Auth Send Email Hook përdor Standard Webhooks.
- Bounce/complaint/suppression events verifikohen nga webhook-u i provider-it.

### Telegram
- Telegram Bot API përdoret direkt.
- Bot credential ruhet i enkriptuar server-side.
- Inbound përdor webhook; cron-i i Telegram kontrollon webhook health dhe nuk konkurron me `getUpdates`.

### Owner / platform configuration
| Integrim | Secret / Config | Ndikon |
|----------|-----------------|--------|
| AI providers | Provider-specific server secrets | Pulse AI Router |
| Meta App | META_APP_ID/SECRET | Meta channels |
| Stripe / billing providers | Provider-specific secrets | Billing |
| Resend | RESEND_API_KEY | Email delivery |
| Replicate | REPLICATE_API_TOKEN | Media generation |
| Twilio | Encrypted channel credentials / server config | SMS/Voice |

### Biznes / workspace
| Integrim | Si lidhet | Ndikon |
|----------|-----------|--------|
| Instagram | OAuth/provider setup | DMs + social workflows |
| WhatsApp | Meta/provider setup | Mesazhe |
| Facebook | OAuth/provider setup | Messenger |
| Telegram | Bot setup server-side | Mesazhe |
| Google integrations | OAuth/service configuration sipas modulit | Calendar/Drive workflows |

---

## Parime runtime

- Browser-i nuk duhet të mbajë provider secrets.
- Workspace authorization verifikohet server-side.
- Text AI nuk duhet të bëjë provider bypass jashtë canonical AI Router.
- Integrimet e jashtme përdorin adapter/provider boundaries që mund të zëvendësohen pa rindërtuar application layer.
- Production rollout, migrations dhe provider secrets kërkojnë verifikim/deployment të veçantë; ekzistenca në branch nuk barazohet me production-live.
