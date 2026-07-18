# Pulse AI — SOP (Standard Operating Procedures)

## SOP-01: Onboarding i Biznesit të Ri

**Kush:** Business Owner / Freelancer  
**Kohëzgjatja:** 15 minuta  
**Rezultati:** AI aktiv që di produktet dhe çmimet

### Hapat:
1. Regjistrim te kohablerjeve.top → email + fjalëkalim
2. Zgjedh llojin e biznesit (Restorant/Salon/Gym/E-commerce/Tjetër)
3. Lidh Instagram (butoni OAuth → autorizo → konfirmo)
4. Lidh WhatsApp (skanon QR me WhatsApp Business)
5. Prit skanimin automatik (5 min) — AI lexon profilin IG
6. Shiko "Knowledge Base" → korrigjo nëse ka gabime
7. Test: dërgon "test" te WhatsApp juaj → AI duhet t'i përgjigjet me menunë
8. Shko live → njofto klientët se keni support 24/7

**Nëse AI nuk di çmimet:** Shko te Agent Config → Training Data → Shto FAQ manualisht

---

## SOP-02: Menaxhimi i Leads

**Kush:** Business Owner / Admin  
**Frekuenca:** Çdo ditë, 09:00

### Hapat:
1. Hap Dashboard → shiko "Hot Leads" (score > 70)
2. Revenue Intelligence → "Vepro sot" → shiko listën
3. Për çdo lead hot: shiko bisedën → vendos nëse ia kalon stafit apo lë AI
4. Leads të reja nga forma publike → CRM → cakto sequence automatike
5. Leads pa përgjigje 3 ditë → sequence winback

**KPI:** 0 leads me score > 70 pa veprim brenda 24 orësh

---

## SOP-03: Aprovimi i Pajisjes së Re (Security)

**Kush:** Admin / Super Admin  
**Koha:** Menjëherë (email mbërrin)

### Hapat:
1. Merr email me titull "🔴 Hyrje nga pajisje e re"
2. Shiko: IP, vendi, ora, risk level
3. Nëse njeh përdoruesin: kliko **APROVO** në email
4. Nëse dyshon: kliko **REFUZO** → kontakto përdoruesin direkt
5. Nëse kritike (vend i huaj + orë e natës): Refuzo + ndryshoni fjalëkalimin

**KURRË:** mos aprovo nëse nuk njeh pajisjen

---

## SOP-04: Raportimi Mujor

**Kush:** Admin / Owner  
**Frekuenca:** Ditën e parë të çdo muaji

### Hapat:
1. CEO Dashboard → DeepAnalytics → zgjidh muajin e kaluar
2. Eksporto: Leads CSV + Revenue + Call CDR
3. Shiko: Konvertimet, AI handle rate, Churn, Upsells
4. Krahaso me muajin paraardhës
5. Identifiko: 3 gjëra që funksionuan + 1 që nuk funksionoi
6. Rregullime: agent_config → custom_instructions sipas gjetjeve

---

## SOP-05: Shtimi i Stafit të Ri

**Kush:** Admin / Owner  
**Kohëzgjatja:** 5 minuta

### Hapat:
1. Settings → Team → Invite Member
2. Zgjidh rolin: Admin/Freelancer/Agent/Ambassador
3. Lidhu me workspace-in e duhur
4. Stafi merr email → regjistrohet → Device Trust kërkon aprovim
5. **Aprovoje** nga pajisja jote aktive
6. Tregoi: inbox URL, handoff keywords, si të dorëzohet te njeriu

---

## SOP-06: Konfigurimi i Sekuencës së Re

**Kush:** Admin / Business Owner  
**Kohëzgjatja:** 10 minuta

### Hapat:
1. Sales → Sequences → New Sequence
2. Emro dhe zgjidh triggerin (manual/lead_created/deal_stale)
3. Shto hapat (min 3):
   - Hapi 1: Email (0 ditë) — prezantuese
   - Hapi 2: WhatsApp (3 ditë) — vlera + pyetje
   - Hapi 3: Email (7 ditë) — ofertë + CTA
4. Aktivizo A/B testing për subject lines
5. Enroll kontaktet e para (min 10) — test
6. Pas 3 ditësh: shiko open rate → rregulloje

---

## SOP-07: Trajnimi i AI Agent

**Kush:** Business Owner  
**Frekuenca:** 1 herë/muaj ose kur ndryshojnë çmimet

### Hapat:
1. Agent Config → Training Data
2. Shiko çfarë ka mësuar nga skanimi
3. Korrigjo çmimet e gabuara
4. Shto FAQ të reja (pyetje që klientët kanë bërë por AI nuk dinte)
5. Shto "Objection Handlers" (kundërshtime të shpeshta + përgjigjet)
6. Generate Instructions → AI gjeneron udhëzimet vetë bazuar te training data
7. Test me mesazh "Çfarë ofroni?" → konfirmo që AI di gjithçka

