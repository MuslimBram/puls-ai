# Pulse AI — Manual i Plotë Përdorimi

## Kreu 1: Hyrje

Pulse AI është sistemi juaj i automatizimit të biznesit me AI.
Qëllimi: 0 leads të humbur, 0 follow-up të harruara, maksimum automatizim.

---

## Kreu 2: Rolet dhe Akseset

### Owner (Super Admin) — Akses i Plotë
- Shikon dhe kontrollon TË GJITHA bizneset në platformë
- Menaxhon faturimet, planet, partnerët
- Sheh SaaS Health dhe analytics globale
- Aprovat/refuzon pajisje të reja për çdo përdorues
- **Mund të bëjë çdo gjë pa kufizime**

### Admin Platformë — Akses i Plotë (pa Owner controls)
- Menaxhon të gjitha bizneset
- Sheh analytics globale + raporte
- Nuk mund të ndryshojë Owner settings
- Aprovat pajisje të reja

### Admin Biznesi — Menaxhon Biznesin e Vet
- **MUND të shtojë biznesin e tij vetë** (self-service)
- Jep akses stafit të vet (Freelancer/Agent/Ambassador)
- Konfiguron AI agent, kanalët, sequences
- Sheh reports vetëm për biznesin e vet
- NUK sheh bizneset e tjera

### Freelancer — Klientët e Vet
- Menaxhon klientët e caktuar
- Content Studio + CRM + Sequences
- Nuk sheh bizneset e tjera agjencisë

### Agent/Bashkëpunëtor — Inbox + Detyra
- Vetëm inbox live + helpdesk
- Nuk ka akses te CRM/Analytics

### Ambassador — Partner Program
- Dashboard partner + wallet
- Sheh vetëm fitumet e veta

---

## Kreu 3: Shtimi i Biznesit të Ri (Business Admin)

Business Admin mund të shtojë biznesin e tij pa ndërhyrjen e Owner-it:

1. Kyçu → Dashboard → "Shto Biznesin Tim"
2. Plotëso: emrin, llojin, qytetin, adresën
3. Lidh Instagram (OAuth)
4. Lidh WhatsApp (QR)
5. AI skanon automatikisht (5 min)
6. Fto stafin tënd: Settings → Team → Invite → cakto rolin

**Owner vetëm shikon** te admin panel se u shtua biznes i ri.

---

## Kreu 4: Inbox AI

**Çfarë bën automatikisht:**
- Përgjigjet çdo DM brenda 3 sekondave
- Di çmimet, oraret, produktet (nga skanimi)
- Rezervon takime automatikisht
- Kap çdo pyetje si lead → CRM

**Kur ndërhyn stafi:**
- Klienti kërkon "njeri/agjent"
- AI ka besueshmëri < 50%
- Ankesë e hapur e pa-zgjidhur
- Bisedë komplekse (negocim çmimi, kontratat)

**Si dorëzohet te stafi:**
- Biseda merr statusin "awaiting_human" (portokalli)
- Stafi merr njoftim (email/push)
- Vazhdon normalisht nga inbox

---

## Kreu 5: Content Studio

### Krijimi i postimit:
1. Content Studio → "Krijo Postim"
2. Zgjidh platformën (IG/FB/LinkedIn)
3. Shkruaj: "Postim për [produktin] me ofertë javore"
4. AI gjeneron: tekst + hashtag + sugjerim ore
5. Zgjidh imazhin ose gjenero me AI
6. Scheduled posting ose publiko tani

### Calendar i postimeve:
- Shfaq të gjitha postimet e planifikuara
- Drag & drop për ndryshim ore
- Filtra per platformë/status

---

## Kreu 6: CRM dhe Pipeline

### Shtimi i lead-it manualisht:
1. CRM → New Lead → plotëso të dhënat
2. Cakto score (ose lër AI ta caktojë)
3. Cakto sequence automatike
4. Cakto stafit

### Import CSV:
1. CRM → Import → Ngarko CSV
2. Map kolonat (email, name, phone)
3. Kliko Import → AI detekton duplikate
4. Shiko raportin: X importuar, Y duplikate, Z gabime

### Pipeline Kanban:
- Drag & drop deals midis kolonave
- Kolona custom (mund të shtoni/fshini)
- Automatizone: kur kalon te "Propozim" → dërgo email automatik

---

## Kreu 7: Sequences (Follow-up Automatik)

### Krijo sequence:
1. Sales → Sequences → New
2. Emëro: p.sh. "Onboarding i Ri"
3. Trigger: "lead_created" me score > 50
4. Shto hapat:
   - Hapi 1: Email (0 ditë) — prezantuese
   - Hapi 2: WhatsApp (3 ditë) — vlera
   - Hapi 3: Email (7 ditë) — ofertë finale
5. Aktivizo → sequence fillon automatikisht

### Enroll manualisht:
- CRM → zgjidh kontaktet → "Enroll in Sequence"
- Mund të zgjedhësh datën e fillimit

---

## Kreu 8: Rezervimet Online

### Konfiguro:
1. Appointment Types → New Type
2. Emri (p.sh. "Konsultë falas"), kohëzgjatja, çmimi
3. Availability Rules → cakto ditët dhe orët
4. Kopjo linkun publik → vendos te IG bio / website

### Klienti rezervon:
1. Hap linkun → shikon orët e lira
2. Zgjedh orën → plotëson emrin + emailin
3. Merr email konfirmimi
4. Merr kujtesë 24h para automatikisht

---

## Kreu 9: Fatura dhe Kontrata

### Krijo faturë:
1. Admin → Invoices → New Invoice
2. Emri i klientit, emaili, shërbimi, çmimi
3. Generate PDF → dërgo direkt te email klientit
4. Numri i faturës gjenerohet automatikisht (INV-2026-0001)

### Kontratë me e-sign:
1. Admin → Contracts → New Contract
2. Plotëso tekstin (ose përdor template)
3. Dërgo te email klientit
4. Klienti klikon "Firma" → dokument i nënshkruar

---

## Kreu 10: Siguria

### Device Trust:
- Çdo login nga pajisje e re → njoftim te Admini
- Admin aprovat/refuzon me 1 klikim nga email
- Klienti pret te faqja "Waiting Approval"

### Best practices:
- Mos ndaj fjalëkalimin me askënd
- Aktivo 2FA te Settings → Security → Enable TOTP
- Shiko "Login Attempts" çdo javë
- Nëse shikon hyrje të dyshimta → Blloko menjëherë

---

## Kreu 11: CEO Dashboard

### Metrikat kryesore (5 që duhen parë çdo ditë):
1. **New Leads** — sot vs dje
2. **AI Handle Rate** — % bisedash pa ndërhyrje njeriu
3. **Hot Leads** — leads me score > 70 pa veprim
4. **At Risk** — klientë me churn risk > 60%
5. **Revenue** — muaji aktual vs i kaluari

### Sinkronizimet:
- Meta Ads: kliko "Sync" → shiko ROI reklamave
- Google Ads: kliko "Sync Google" → krahasim me Meta
- Vicidial: merr automatikisht çdo natë (cron)

