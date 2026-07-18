# Pulse AI — Prompt Library

## Kategoria 1: Inbox AI (DM responses)

### PROMPT-01: Përgjigje çmimi
```
Trigger: klienti pyet çmimin e produktit X
System: [memoria e biznesit + çmimet reale]
Prompt: "Klienti pyeti çmimin. Përgjigju me çmimin real nga memoria. 
Nëse nuk e di, thuaj 'do kontrolloj'. ASNJËHERË nuk shpik çmime."
Output: çmim + ofertë e lehtë (p.sh. "A dëshironi ta rezervoni?")
```

### PROMPT-02: Rezervim automatik
```
Trigger: klienti thotë "dua të rezervoj", "a keni vend", "kur jeni të lirë"
System: [oraret + disponueshmëria nga appointment-booking]
Prompt: "Ofro 2-3 slote disponueshme. Pyet emrin dhe numrin.
Konfirmo rezervimin me detaje të plota. Dërgo kujtesë 24h para."
Output: slot orar + konfirmim + kujtesë automatike
```

### PROMPT-03: Trajtimi i ankesës
```
Trigger: fjalë: "problem", "gabim", "pakënaqur", "nuk funksionoi"
System: [journey_phase = at_risk, communication_style = reengaging]
Prompt: "Shpreh keqardhje SINQERISHT para çdo shpjegimi.
Dëgjo, kuptoji, propozoji zgjidhje konkrete. MOS justifiko menjëherë.
Pas zgjidhjes: 'Çfarë tjetër mund të bëj për ju?'"
Output: empatia + zgjidhje + follow-up
```

### PROMPT-04: Upsell i natyrshëm
```
Trigger: Revenue Intelligence detekton score > 70 + purchased_base_tier
System: [historiku i blerjeve + paketa tjetër]
Prompt: "Klienti ka [X] blerje. Ofroi [paketin tjetër] si zgjidhje natyrale
për nevojën që ka shprehur. MOS bëj sikur 'ke ofertë'. Sugjeroi si këshillë."
Output: propozim i personalizuar (jo reklamë)
```

### PROMPT-05: Handoff te njeriu
```
Trigger: besueshmëria AI < 50% ose klienti kërkon "njeri/agjent"
System: [statusi i bisedës → awaiting_human]
Prompt: "Njoftoje klientin me respekt se po ia kalohet një specialisti.
Jep kohën e pritjes nëse e di. Mos e lër të ndjejë se AI po largohet."
Output: "Po ju lidh me një nga specialistët tanë. Koha e pritjes: ~X min."
```

---

## Kategoria 2: Sales Sequences

### PROMPT-06: Email i parë (Hapi 1)
```
Trigger: lead i ri me score > 40
Ditë: 0 (menjëherë)
Ton: educational (fase exploring)
Template: "Pershendetje {{name}},

Faleminderit që u interesuat për [biznesin]. Doja t'ju tregoja shkurtimisht
si mund t'ju ndihmojmë me [nevoja e tyre].

[Vlera kryesore në 2 rreshta]

Jeni të lirë të na shkruani ose të rezervoni 15 minuta këtu: [link]

Me respekt,
[Emri]"
```

### PROMPT-07: Follow-up Dita 3
```
Trigger: nuk ka hapjen e emailit të parë
Ditë: 3
Ton: consultative
Template: "{{name}}, ju shkrova 3 ditë më parë.

Shumë herë emailet humbasin në inbox. Doja të sigurohesha që e morët.

Pyetja ime: a keni [problemi specifik]? Sepse kemi klientë si ju që 
kanë zgjidhur saktësisht këtë me [produktin].

Nëse jeni të interesuar, 10 minuta bisedë mjaftojnë."
```

### PROMPT-08: Oferta finale Dita 7
```
Trigger: nuk ka reagim në 7 ditë
Ditë: 7
Ton: closing
Template: "{{name}}, ky është emaili im i fundit.

Nëse [problemi] nuk është prioritet tani, e kuptoj plotësisht.
Por nëse JO, kjo javë kemi [ofertë speciale me afat].

[CTA i qartë: Rezervo / Provo falas / Kontakto]

Nëse nuk dëgjohem prej jush, nuk do të shqetësoj më."
```

---

## Kategoria 3: Content Studio

### PROMPT-09: Post Instagram (Produkt)
```
Ton: energjetik, informal
Gjatësia: 3-4 paragrafë + 5-7 hashtag
Template: "Shkruaj post Instagram për [produktin] të [biznesit].
Fillo me hook të fortë (pyetje ose fakt surprizë).
Shtoji 1 element FOMO (ofertë, disponueshmëri e kufizuar).
Mbaro me CTA të qartë (link bio / kontakto / rezervo).
Hashtag: 3 të mëdha + 3 niche + 1 brandname."
```

### PROMPT-10: Story Instagram
```
Gjatësia: 1-2 fjali (për overlay teksti mbi foto)
Template: "Fjali e parë: Hook provokues
Fjali e dytë: Benefiti kryesor
CTA: Swipe up / Dërgona DM / Rezervo tani"
```

### PROMPT-11: Raport mujor për klient (Agjenci)
```
Input: metrics nga Dashboard (reach, engagement, leads, konvertime)
Output: raport 1-faqësh profesional
Template: "Shkruaj raport mujor [muaji] për klientin [emri].
Fillo me 3 arritjet kryesore (me numra). 
Shpjego çfarë funksionoi dhe pse.
Propozoji 3 rekomandime për muajin tjetër.
Mbaj ton profesional por jo teknik."
```

---

## Kategoria 4: CEO Dashboard Insights

### PROMPT-12: Analiza javore
```
Input: kpi_daily_snapshots (7 ditë)
Prompt: "Analize KPI-të e kësaj jave dhe:
1. Identifiko trendin kryesor (lart/poshtë/stabil)
2. Gji 1 anomali që kërkon vëmendje
3. Propozoji 1 veprim konkret për javën tjetër
Kthe në 3 paragrafë, gjuhë executivësh."
```

### PROMPT-13: Churn prediction explanation
```
Input: customer me churn_risk > 0.7
Prompt: "Klienti [emri] ka risk churn 78%. Shpjego:
- Cilat sinjale e treguan (pa heshtur X ditë, ankesë e hapur, etj.)
- Çfarë mund të bëjmë tani
- Çfarë ndodh nëse nuk veprojmë
Kthe si briefing 3 rreshta për CEO."
```

---

## Kategoria 5: Security Prompts

### PROMPT-14: Device Risk Assessment
```
Input: {ip, country, hour, failed_logins, is_admin, is_known_device}
Prompt: "Vlerëso rrezikun e kësaj hyrjeje nga 0.0 deri 1.0.
Merr parasysh: [faktorët]. 
Rekomando: approve/review/reject.
Kthe VETËM JSON: {score, level, recommendation, reasoning}"
```

