

# Analiza: Çfarë mungon për përdoruesit e rinj të Pulse AI

## Gjendja aktuale

Platforma ka:
- **Landing Page** me hero, features, pricing preview, testimonials
- **Regjistrim 3-hapësh** (lloj llogarie → plan → kredenciale)
- **FloatingAIBot** (vetëm brenda dashboard-it, për përdorues të loguar)
- **AIChatWidget** në landing page (por është widget kontakti, jo ndihmës)
- **OnboardingWizard** — checklist bazik pas logimit
- **FieldGuides** — tooltip-e ndihmëse për fushat e profilit
- **SetupChecklist** në dashboard

## Problemet kryesore — Pyetjet që përdoruesi nuk gjen përgjigje

### 1. "Çfarë është Pulse AI dhe pse më duhet?"
- Landing page ka features por **mungon seksioni "Si Funksionon" (How It Works)** me hapa vizualë
- **Mungon seksioni FAQ** në landing page
- Nuk ka video demo ose tour interaktiv

### 2. "Si ta testoj para se të paguaj?"
- Prova 7-ditore ekziston por **nuk shpjegohet qartë çfarë përfshihet**
- Mungon **krahasimi i provës vs planit të paguar**

### 3. "Si të regjistroj? Çfarë roli të zgjedh?"
- Regjistrimi ka 3 role por **përshkimet janë minimale** — përdoruesi nuk kupton ndryshimin mes Biznesit, Freelancer-it dhe Ambasadorit
- **Mungon tooltip ose modal shpjegues** për secilin rol

### 4. "Çfarë duhet të plotësoj dhe pse?"
- FieldGuides ekzistojnë por vetëm për profil biznesi
- **Mungon udhëzuesi fillestar interaktiv** (guided tour) pas regjistrimit
- OnboardingWizard është shumë teknik — nuk shpjegon "pse"

### 5. "A ka AI ndihmës nëse nuk di ta përdor?"
- FloatingAIBot funksionon vetëm brenda dashboard-it
- **Mungon AI bot në landing page** që përgjigjet pyetjeve para regjistrimit
- AI bot aktual nuk ka kontekstin e plotë të platformës

---

## Plani i implementimit (6 detyra)

### Detyra 1: Seksioni "Si Funksionon" në Landing Page
Shto seksion me 3-4 hapa vizualë:
1. Regjistrohuni → 2. Plotësoni profilin → 3. Lidhni kanalet → 4. AI punon për ju
- Vendosje: pas "Problem/Solution", para "Features Grid"
- Përdor ikona dhe animacione ekzistuese

### Detyra 2: FAQ në Landing Page
Shto seksion FAQ me accordion (komponenti `ui/accordion` ekziston):
- "Çfarë është Pulse AI?"
- "Sa kushton?"  
- "A mund ta provoj falas?"
- "Cili është ndryshimi mes Biznesit, Freelancer-it dhe Ambasadorit?"
- "Si fitoj para me referime?"
- "A mund ta instaloj në telefon?"
- "Çfarë ndodh nëse nuk paguaj pas provës?"

### Detyra 3: Përshkrime të qarta për rolet në Regjistrim
Në hapin "account-type" të Register.tsx, shto përshkrime të detajuara:
- **Biznes**: "Menaxhoni biznesin tuaj — inbox, CRM, marketing, AI"
- **Freelancer**: "Menaxhoni biznese të klientëve — fitoni 35% komision nga referimet + 40% nga menaxhimi"
- **Ambasador**: "Vetëm referime — fitoni 35% komision jetësor (min. 3 referime/muaj)"

### Detyra 4: AI Chat Bot në Landing Page (para regjistrimit)
Zëvendëso AIChatWidget me FloatingAIBot në landing page, i konfiguruar për vizitorë të paloguar:
- Përgjigjet pyetjeve rreth platformës, çmimeve, roleve
- Nuk kërkon autentikim
- Përdor edge function `ai-help-bot` ekzistuese

### Detyra 5: Guided Tour interaktiv pas regjistrimit
Krijo komponent `GuidedTour` me hapa:
1. "Mirësevini! Ja ku filloni" → Dashboard overview
2. "Plotësoni profilin" → Profil biznesi
3. "Lidhni kanalet" → Channels
4. "AI juaj është gati" → Inbox
- Shfaqet vetëm herën e parë (ruhet në localStorage ose DB)

### Detyra 6: Seksioni "Çfarë përfshihet në provën falas" në Regjistrim
Pas zgjedhjes së provës 7-ditore, shto listë të qartë:
- ✓ Akses i plotë për 7 ditë
- ✓ AI asistent personal
- ⚠ Pas 7 ditëve: zgjidhni paketë ose humbni aksesin
- ⚠ Pas 30 ditëve pa pagesë: llogaria fshihet

---

## Skedarët që preken

| Skedar | Ndryshim |
|--------|----------|
| `src/pages/Index.tsx` | Shto "How It Works" + FAQ seksione + AI bot |
| `src/pages/Register.tsx` | Përshkrime rolesh + detaje prove |
| `src/components/GuidedTour.tsx` | Komponent i ri |
| `src/i18n/en.ts` + `src/i18n/sq.ts` | Çelësa i18n |

