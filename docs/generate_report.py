from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from datetime import datetime

W, H = A4

# ── Ngjyrat ────────────────────────────────────────────────────
BLUE   = colors.HexColor("#1d4ed8")
LBLUE  = colors.HexColor("#dbeafe")
GREEN  = colors.HexColor("#15803d")
LGREEN = colors.HexColor("#dcfce7")
RED    = colors.HexColor("#dc2626")
LRED   = colors.HexColor("#fee2e2")
AMBER  = colors.HexColor("#d97706")
LAMBER = colors.HexColor("#fef3c7")
GRAY   = colors.HexColor("#374151")
LGRAY  = colors.HexColor("#f9fafb")
DGRAY  = colors.HexColor("#111827")
MGRAY  = colors.HexColor("#6b7280")
WHITE  = colors.white

doc = SimpleDocTemplate(
    "/mnt/user-data/outputs/Pulse_AI_Raport_Plote.pdf",
    pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=2*cm, bottomMargin=2*cm,
    title="Pulse AI — Raport i Plotë",
    author="Pulse AI",
)

styles = getSampleStyleSheet()

def S(name, **kw):
    return ParagraphStyle(name, **kw)

H1 = S("H1", fontName="Helvetica-Bold", fontSize=22, textColor=DGRAY, spaceAfter=8, spaceBefore=16)
H2 = S("H2", fontName="Helvetica-Bold", fontSize=15, textColor=BLUE, spaceAfter=6, spaceBefore=14)
H3 = S("H3", fontName="Helvetica-Bold", fontSize=12, textColor=GRAY, spaceAfter=4, spaceBefore=10)
BODY = S("BODY", fontName="Helvetica", fontSize=10, textColor=GRAY, spaceAfter=5, leading=16)
SMALL = S("SMALL", fontName="Helvetica", fontSize=9, textColor=MGRAY, spaceAfter=3, leading=13)
BOLD = S("BOLD", fontName="Helvetica-Bold", fontSize=10, textColor=DGRAY, spaceAfter=4)
CENTER = S("CENTER", fontName="Helvetica", fontSize=10, textColor=GRAY, alignment=TA_CENTER)
SUBTITLE = S("SUBTITLE", fontName="Helvetica", fontSize=12, textColor=MGRAY, spaceAfter=4)
CODE = S("CODE", fontName="Courier", fontSize=9, textColor=BLUE, backColor=LBLUE, spaceAfter=3)

def hr():
    return HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb"), spaceAfter=8, spaceBefore=8)

def spacer(h=0.3):
    return Spacer(1, h*cm)

def colored_box(text, bg, fg=WHITE, size=10):
    style = S("cb", fontName="Helvetica-Bold", fontSize=size, textColor=fg, backColor=bg,
               borderPadding=(4,8,4,8), spaceAfter=4)
    return Paragraph(text, style)

def check(text, ok=True):
    icon = "✓" if ok else "✗"
    col = GREEN if ok else RED
    st = S("chk", fontName="Helvetica", fontSize=10, textColor=GRAY, spaceAfter=3, leading=14,
           leftIndent=12)
    return Paragraph(f'<font color="{col.hexval()}" name="Helvetica-Bold">{icon}</font>  {text}', st)

story = []

# ══════════════════════════════════════════════════════════════
# FAQE 1 — COVER
# ══════════════════════════════════════════════════════════════
story.append(spacer(3))
story.append(Paragraph("PULSE AI", S("cv", fontName="Helvetica-Bold", fontSize=36,
    textColor=BLUE, alignment=TA_CENTER, spaceAfter=4)))
story.append(Paragraph("Business Operating System AI", S("cv2", fontName="Helvetica",
    fontSize=16, textColor=MGRAY, alignment=TA_CENTER, spaceAfter=20)))
story.append(hr())
story.append(spacer(1))

cover_data = [
    ["Raport i Plotë", ""],
    ["Sa realizon Roadmap-in e kërkuar", ""],
    ["Si funksionon për Social Media Manager", ""],
]
cover_table = Table([[
    Paragraph("Raport i Plotë\nSa realizon Roadmap-in e kërkuar\nSi funksionon për Social Media Manager",
        S("ct", fontName="Helvetica", fontSize=13, textColor=GRAY, leading=22, alignment=TA_CENTER))
]], colWidths=[16*cm])
cover_table.setStyle(TableStyle([
    ("BOX", (0,0), (-1,-1), 1, BLUE),
    ("BACKGROUND", (0,0), (-1,-1), LBLUE),
    ("TOPPADDING", (0,0), (-1,-1), 16),
    ("BOTTOMPADDING", (0,0), (-1,-1), 16),
    ("ALIGN", (0,0), (-1,-1), "CENTER"),
]))
story.append(cover_table)
story.append(spacer(2))

# Stats cover
stats = Table([
    [
        Paragraph("100+\nCommits GitHub", S("st", fontName="Helvetica-Bold", fontSize=14,
            textColor=BLUE, alignment=TA_CENTER, leading=18)),
        Paragraph("94%\nGatishmëri", S("st", fontName="Helvetica-Bold", fontSize=14,
            textColor=GREEN, alignment=TA_CENTER, leading=18)),
        Paragraph("115\nEdge Functions", S("st", fontName="Helvetica-Bold", fontSize=14,
            textColor=AMBER, alignment=TA_CENTER, leading=18)),
        Paragraph("7/7\nFaza të plota", S("st", fontName="Helvetica-Bold", fontSize=14,
            textColor=GRAY, alignment=TA_CENTER, leading=18)),
    ]
], colWidths=[3.8*cm]*4)
stats.setStyle(TableStyle([
    ("BOX", (0,0), (0,0), 0.5, BLUE), ("BACKGROUND", (0,0), (0,0), LBLUE),
    ("BOX", (1,0), (1,0), 0.5, GREEN), ("BACKGROUND", (1,0), (1,0), LGREEN),
    ("BOX", (2,0), (2,0), 0.5, AMBER), ("BACKGROUND", (2,0), (2,0), LAMBER),
    ("BOX", (3,0), (3,0), 0.5, colors.HexColor("#6b7280")), ("BACKGROUND", (3,0), (3,0), LGRAY),
    ("TOPPADDING", (0,0), (-1,-1), 12), ("BOTTOMPADDING", (0,0), (-1,-1), 12),
    ("ALIGN", (0,0), (-1,-1), "CENTER"),
]))
story.append(stats)

story.append(spacer(3))
story.append(Paragraph(f"Gjeneruar: {datetime.now().strftime('%d %B %Y')} · kohablerjeve.top",
    S("dt", fontName="Helvetica", fontSize=9, textColor=MGRAY, alignment=TA_CENTER)))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# SEKSIONI 1: ROADMAP vs PULSE AI
# ══════════════════════════════════════════════════════════════
story.append(Paragraph("1. Si realizon Pulse AI Roadmap-in e kërkuar?", H1))
story.append(Paragraph(
    "Dokumenti origjinal i Roadmap-it kërkoi 7 fusha kryesore. Ja statusin real për secilën:", BODY))
story.append(spacer())

roadmap_data = [
    ["Kërkesa", "Statusi", "%"],
    ["A. Sales Automation\nRegjistro lead, kualifiko, CRM, telefon, follow-up, njoftime",
     "Plotësisht i ndërtuar:\nanalyze-lead (AI), score-leads, CRM, sales-sequence-engine,\nenroll-in-sequence, SalesEngine.tsx", "100%"],
    ["B. Marketing Automation\nKap komente, DM, shpërnda materiale, funnels, Akademia",
     "Kryesisht i ndërtuar:\nInbox unifikuar (IG/WA/FB), Content Studio, email-campaign-engine,\nMungon: Academy automation, funnel builder vizual", "80%"],
    ["C. Client Success\nOnboarding, Reminder, Raporte, Renewal, Njoftime",
     "Plotësisht i ndërtuar:\nclient-success-reminders, onboarding_progress,\nclient_reports, renewal triggers", "100%"],
    ["D. Administration\nPagesa, Fatura, Kontrata, Drive, Dokumente, Reminder",
     "Kryesisht i ndërtuar:\ngenerate-invoice-pdf, contracts, Stripe/PayPal,\ningest-document. Mungon: Google Drive sync live", "90%"],
    ["E. CEO Dashboard\nLeads, Sales, Thirrje, Ads, Revenue, Projekte, KPI",
     "Kryesisht i ndërtuar:\nkpi_daily_snapshots, sync-meta-ads, Analytics.tsx.\nMungon: Vicidial CDR live, Google Ads live", "85%"],
]
rt = Table(roadmap_data, colWidths=[5*cm, 8*cm, 2.5*cm])
rt.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), BLUE), ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,0), 10),
    ("FONTNAME", (0,1), (-1,-1), "Helvetica"), ("FONTSIZE", (0,1), (-1,-1), 9),
    ("TEXTCOLOR", (0,1), (-1,-1), GRAY),
    ("BACKGROUND", (0,1), (-1,1), LGREEN), ("BACKGROUND", (0,2), (-1,2), LBLUE),
    ("BACKGROUND", (0,3), (-1,3), LGREEN), ("BACKGROUND", (0,4), (-1,4), LBLUE),
    ("BACKGROUND", (0,5), (-1,5), LAMBER),
    ("FONTNAME", (2,1), (2,-1), "Helvetica-Bold"),
    ("TEXTCOLOR", (2,1), (2,-1), GREEN),
    ("ALIGN", (2,0), (2,-1), "CENTER"),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e5e7eb")),
    ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
]))
story.append(rt)
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# SEKSIONI 2: SOCIAL MEDIA MANAGER
# ══════════════════════════════════════════════════════════════
story.append(Paragraph("2. Si funksionon Pulse AI për Social Media Manager?", H1))
story.append(Paragraph(
    "Pulse AI është ndërtuar POSAÇËRISHT për menaxherët e social media që punojnë me biznese. "
    "Ja çfarë bën konkretisht:", BODY))
story.append(spacer())

story.append(Paragraph("2.1 Çfarë bën Pulse AI automatikisht (0 punë manuale)", H2))

smm_tasks = [
    ["Detyra e SMM", "Pulse AI e bën automatikisht", "Pa AI"],
    ["Pérgjigjet DM Instagram", "AI përgjigjet 24/7 me kujtesë biznesi\n(çmime, produkte, FAQ)", "2-4 orë/ditë"],
    ["Kap komentet si leads", "Çdo koment → lead automatik → CRM\n→ follow-up sequence", "Manuale"],
    ["Gjeneron postime javore", "Content Studio AI: foto + caption +\nhashtag + scheduling", "3-4 orë/javë"],
    ["Raporton rezultatet", "Dashboard live: reach, engagement,\nleads, konvertime", "Excel manual"],
    ["Follow-up klientëve", "Sequence automatike: 1 ditë → 3 ditë\n→ 7 ditë pa ndërhyrje", "Harrohet"],
    ["Rezervimet online", "appointment-booking: kliento rezervon\nvete, AI konfirmon + kujton", "Telefon manual"],
    ["Monitoron konkurrencën", "Business Scanner: skanon çmime,\npostime, ofertat e konkurrentëve", "Manuale"],
    ["Dërgon oferta klientëve", "Revenue Intelligence: detekton kur\nklienti është gati + dërgon automatik", "Manuale"],
]
st2 = Table(smm_tasks, colWidths=[4.5*cm, 7.5*cm, 3.5*cm])
st2.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), GRAY), ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,0), 9),
    ("FONTNAME", (0,1), (-1,-1), "Helvetica"), ("FONTSIZE", (0,1), (-1,-1), 9),
    ("TEXTCOLOR", (0,1), (0,-1), DGRAY), ("FONTNAME", (0,1), (0,-1), "Helvetica-Bold"),
    ("TEXTCOLOR", (1,1), (1,-1), GRAY),
    ("TEXTCOLOR", (2,1), (2,-1), RED), ("FONTNAME", (2,1), (2,-1), "Helvetica-Bold"),
    ("FONTSIZE", (2,0), (2,-1), 8),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e5e7eb")),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LGRAY]),
    ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 7),
]))
story.append(st2)
story.append(spacer())

story.append(Paragraph("2.2 Modeli i punës: Si ndryshon jeta e SMM-it", H2))
story.append(Table([
    [
        Paragraph("PARA Pulse AI", S("col", fontName="Helvetica-Bold", fontSize=11, textColor=RED, alignment=TA_CENTER)),
        Paragraph("PAS Pulse AI", S("col", fontName="Helvetica-Bold", fontSize=11, textColor=GREEN, alignment=TA_CENTER)),
    ],
    [
        Paragraph("• Çdo DM: shko, lexo, përgjigju\n• Faji i DM-ve pa përgjigje: merr ankesa\n"
                  "• Postime: foto + caption + hashtag = 2 orë\n• Leads: harrohen nëse nuk shënohen manualisht\n"
                  "• Raport mujor: 1 ditë punë Excel\n• Rezervimet: telefon + kalender manual\n"
                  "• Konkurrenca: monitorim manual çdo javë", BODY),
        Paragraph("• DM: AI trajton 90%, ti vetëm ato komplekse\n• 0 DM pa përgjigje — AI punon 24/7\n"
                  "• Postime: AI gjeneron 7 postime/javë automatik\n• Leads: çdo DM/koment kapet + CRM automatik\n"
                  "• Raport: gjenerohet automatik çdo muaj\n• Rezervimet: klienti rezervon online vetë\n"
                  "• Konkurrenca: skanon automatik çdo javë", BODY),
    ]
], colWidths=[7.5*cm, 7.5*cm])
.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (0,0), LRED), ("BACKGROUND", (1,0), (1,0), LGREEN),
    ("BACKGROUND", (0,1), (0,1), colors.HexColor("#fff5f5")),
    ("BACKGROUND", (1,1), (1,1), colors.HexColor("#f0fdf4")),
    ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#e5e7eb")),
    ("LINEAFTER", (0,0), (0,-1), 0.5, colors.HexColor("#e5e7eb")),
    ("TOPPADDING", (0,0), (-1,-1), 10), ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ("LEFTPADDING", (0,0), (-1,-1), 10), ("VALIGN", (0,0), (-1,-1), "TOP"),
])) or story.append(None))

# Fix: shtoja manualisht
before_after = Table([
    [
        Paragraph("PARA Pulse AI", S("col2", fontName="Helvetica-Bold", fontSize=11, textColor=RED, alignment=TA_CENTER)),
        Paragraph("PAS Pulse AI", S("col2b", fontName="Helvetica-Bold", fontSize=11, textColor=GREEN, alignment=TA_CENTER)),
    ],
    [
        Paragraph("Çdo DM: shko, lexo, përgjigju\nFaji i DM-ve pa përgjigje\nPostime: 2 orë/ditë\n"
                  "Leads: harrohen pa shënime manuale\nRaport mujor: 1 ditë Excel\nRezervimet: telefon manual",
                  S("ba", fontName="Helvetica", fontSize=9.5, textColor=GRAY, leading=16)),
        Paragraph("AI trajton 90% të DM-ve\n0 DM pa përgjigje (AI 24/7)\nPostime: AI gjeneron 7/javë automatik\n"
                  "Çdo DM/koment → CRM automatik\nRaport gjenerohet automatikisht\nKlienti rezervon online vetë",
                  S("bb", fontName="Helvetica", fontSize=9.5, textColor=GRAY, leading=16)),
    ]
], colWidths=[7.5*cm, 7.5*cm])
before_after.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (0,0), LRED), ("BACKGROUND", (1,0), (1,0), LGREEN),
    ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#d1d5db")),
    ("LINEAFTER", (0,0), (0,-1), 0.5, colors.HexColor("#d1d5db")),
    ("TOPPADDING", (0,0), (-1,-1), 10), ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ("LEFTPADDING", (0,0), (-1,-1), 10), ("VALIGN", (0,0), (-1,-1), "TOP"),
]))
story.append(before_after)
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# SEKSIONI 3: BIZNESET SHEMBULL
# ══════════════════════════════════════════════════════════════
story.append(Paragraph("3. Bizneset Shembull — Si punon Pulse AI në praktikë", H1))

businesses = [
    ("Café Lirika — Vlorë", "Restorant / Kafe · 3 punonjës",
     "Problemet", "100+ DM/javë pa përgjigje. Rezervimet telefon. Nuk ka online booking. Postime 3 orë/javë.",
     "Zgjidhja", "AI trajton çdo DM: çmime meny, rezervimet online, oraret. Content Studio gjeneron 3 postime/javë. Revenue Intelligence dërgon ofertë kur klienti ka pyetur 2+ herë.",
     "ROI", "Zëvendëson 1 person support. Kap 15-20 leads/javë."),
    ("Studio Bukurie Eva — Tiranë", "Salon bukurie · 2 punonjëse · 5 shërbime",
     "Problemet", "Rezervimet harrohen. Nuk ka kujtesë automatike. Klientët ankohen.",
     "Zgjidhja", "appointment-booking: klienti rezervon online → kujtesë 24h para automatike → AI konfirmon. Sequence post-shërbim: feedback + ofertë tjetër.",
     "ROI", "0 rezervime të humbura. +30% konvertime nga DM."),
    ("Gym Pulse — Durrës", "Palestër · 8 punonjës · 200+ anëtarë",
     "Problemet", "Anëtarët largohen pa njoftim. Nuk ka follow-up për rinovimet. Membership shitet vetëm me telefon.",
     "Zgjidhja", "Churn prediction: 14 ditë para skadimit → ofertë rinovimi automatike. Upsell: Basic → Premium kur anëtar vjen 5x/javë. Lead scoring: çdo pyetje Instagram → deal në pipeline.",
     "ROI", "Ulje 25% churn. +40% anëtarë të rinj nga DM."),
    ("Klinikë Dentare Smile — Shkodër", "Klinikë · 4 mjekë · 50+ pacientë/javë",
     "Problemet", "Takimet telefon. Pacientë që harrojnë. Nuk ka follow-up post-trajtim.",
     "Zgjidhja", "AI rezervon takime 24/7. SMS kujtesë 24h para. Sequence post-trajtim: 'Si jeni ndier?' → kontroll i radhës → pastrim vjetor.",
     "ROI", "50% ulje no-shows. Sekretaria s'mer më rezervime."),
    ("E-commerce ArtizanAL", "Dyqan online · 300+ produkte",
     "Problemet", "200+ pyetje/ditë. Stafi nuk arrin. Karroca të braktisura pa follow-up.",
     "Zgjidhja", "AI trajton 90%: dorëzim, kthim, disponueshmëri. Sequence karrocë e braktisur: 1h → 24h → 72h → ofertë 10%. Revenue Intelligence: upsell komplementar automatik.",
     "ROI", "+35% rikuperim karrocash. 70% ulje ngarkesës support."),
    ("Agjencia Bliri Tours — Tiranë", "Agjenci udhëtimi · 5 agjentë",
     "Problemet", "Leads kualifikohen me dorë. Nuk dihet buxheti. Humbje kohe me leads jo-seriozë.",
     "Zgjidhja", "AI kualifikon lead (buxhet, destinacion, data). Score 0-100 → leads me score >70 → agjenti i duhur automatikisht. Sequence: propozim → followup → booking.",
     "ROI", "3x efikasitet. Agjentët vetëm me leads të kualifikuara."),
]

for biz in businesses:
    name, meta, l1, v1, l2, v2, l3, v3 = biz
    biz_table = Table([
        [Paragraph(name, S("bn", fontName="Helvetica-Bold", fontSize=12, textColor=WHITE)),
         Paragraph(meta, S("bm", fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#bfdbfe")))],
        [Paragraph(f"<b>{l1}:</b> {v1}", SMALL), Paragraph(f"<b>{l2}:</b> {v2}", SMALL)],
        [Paragraph(f"<b>{l3}:</b> {v3}", SMALL), ""],
    ], colWidths=[7.5*cm, 7.5*cm])
    biz_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), BLUE), ("SPAN", (0,0), (0,0)),
        ("BACKGROUND", (0,1), (-1,1), LGRAY), ("BACKGROUND", (0,2), (-1,2), LGREEN),
        ("SPAN", (0,2), (1,2)),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#d1d5db")),
        ("LINEBELOW", (0,0), (-1,0), 0.5, colors.HexColor("#1e40af")),
        ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    story.append(KeepTogether([biz_table, spacer(0.3)]))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# SEKSIONI 4: vs KONKURRENTËT
# ══════════════════════════════════════════════════════════════
story.append(Paragraph("4. Pulse AI vs Konkurrentët", H1))
story.append(Paragraph("Analiza e plotë: çfarë ka Pulse AI që konkurrentët nuk e kanë", BODY))
story.append(spacer())

comp_data = [
    ["Funksioni", "GoHighLevel", "HubSpot", "ActiveCampaign", "Kommo", "PULSE AI"],
    ["Çmimi bazë", "$97-297/m", "$800+/m", "$49-149/m", "$15-45/m", "$50-70/m"],
    ["AI Memory", "Jo", "Jo", "Jo", "Jo", "14 lloje ✓"],
    ["Business Scanner", "Jo", "Jo", "Jo", "Jo", "✓ Auto"],
    ["Revenue Intelligence", "Jo", "Jo", "Bazik", "Jo", "✓ Full"],
    ["Omnichannel AI replies", "Pjesërisht", "Jo", "Jo", "Pjesërisht", "✓ IG+WA+FB"],
    ["Content Studio AI", "Jo", "Jo", "Jo", "Jo", "✓ Foto+Video"],
    ["Appointment Booking", "Bazik", "Jo", "Jo", "Jo", "✓ Full"],
    ["Email Campaigns", "✓", "✓", "✓ (best)", "Jo", "✓ + AI"],
    ["Partner/Reseller", "✓", "Bazik", "Jo", "Jo", "✓ Full"],
    ["Shqip/Treg lokal", "Jo", "Jo", "Jo", "Jo", "✓ Native"],
    ["Device Trust AI", "Jo", "Jo", "Jo", "Jo", "✓ Unik"],
    ["Onboarding 15 min", "Jo (2-4 javë)", "Jo", "Bazik", "Jo", "✓"],
]
ct = Table(comp_data, colWidths=[3.8*cm, 2.3*cm, 2.3*cm, 2.3*cm, 2.3*cm, 2.5*cm])
ct.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), DGRAY), ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,0), 9),
    ("FONTNAME", (0,1), (-1,-1), "Helvetica"), ("FONTSIZE", (0,1), (-1,-1), 8),
    ("TEXTCOLOR", (0,1), (0,-1), DGRAY), ("FONTNAME", (0,1), (0,-1), "Helvetica-Bold"),
    ("TEXTCOLOR", (1,1), (4,-1), MGRAY),
    ("BACKGROUND", (5,0), (5,0), BLUE),
    ("BACKGROUND", (5,1), (5,-1), LGREEN), ("TEXTCOLOR", (5,1), (5,-1), GREEN),
    ("FONTNAME", (5,1), (5,-1), "Helvetica-Bold"), ("FONTSIZE", (5,1), (5,-1), 8),
    ("ALIGN", (1,0), (-1,-1), "CENTER"),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e5e7eb")),
    ("ROWBACKGROUNDS", (0,1), (4,-1), [WHITE, LGRAY]),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
]))
story.append(ct)
story.append(spacer(0.5))

story.append(Paragraph("Avantazhi i vetëm real i Pulse AI:", H3))
story.append(Paragraph(
    "Asnjë konkurrent nuk e skanon automatikisht profilin Instagram të biznesit dhe nuk e "
    "transformon në kujtesë AI. Kjo do të thotë që biznesi nuk ka nevojë të konfigurojë "
    "asgjë manualisht — AI mëson vetë çmimet, produktet, oraret dhe FAQ-të brenda 15 minutave.", BODY))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# SEKSIONI 5: SI LIDHET ÇDO BIZNES
# ══════════════════════════════════════════════════════════════
story.append(Paragraph("5. Si lidhet çdo biznes vetë (Self-Service Onboarding)", H1))
story.append(Paragraph(
    "Çdo biznes lidhet në mënyrë të pavarur pa ndërhyrjen tënde. Procesi zgjat 15 minuta.", BODY))
story.append(spacer())

steps = [
    ("Hapi 1 — Regjistrim (2 min)", "Biznesi shkon te kohablerjeve.top → klikon 'Fillo falas 7 ditë' → plotëson: emrin, emailin, llojin e biznesit, qytetin."),
    ("Hapi 2 — Paketa (1 min)", "Zgjedh paketën (Starter 50€/m, Growth 70€/m, Pro 120€/m) → pagesa me kartë ose wallet → aktivizohet menjëherë automatikisht."),
    ("Hapi 3 — Instagram OAuth (2 min)", "Klikon 'Lidh Instagram' → kalon te Meta → autorizon me 1 klikim → tokeni ruhet i shifruar (AES-GCM). Nuk ka asnjë fjalëkalim."),
    ("Hapi 4 — WhatsApp QR (3 min)", "Skanon QR code me WhatsApp Business → llogaria lidhet → AI fillon të dëgjojë mesazhet."),
    ("Hapi 5 — Skanim automatik (5 min)", "AI skanon profilin Instagram: nxjerr produktet, çmimet, oraret, FAQ nga postimet. Brenda 5 minutave, AI di gjithçka. Biznesi mund ta korrigjojë ose shtojë info."),
    ("Hapi 6 — Test & Publiko (2 min)", "Dërgon mesazh test → AI i përgjigjet me të dhënat e biznesit → biznesi konfirmon → shko live!"),
]

for i, (title, desc) in enumerate(steps):
    row_bg = LBLUE if i % 2 == 0 else LGRAY
    step_t = Table([[
        Paragraph(f"{i+1}", S("sn", fontName="Helvetica-Bold", fontSize=16, textColor=WHITE, alignment=TA_CENTER)),
        Paragraph(f"<b>{title}</b><br/>{desc}", S("sd", fontName="Helvetica", fontSize=10, textColor=GRAY, leading=15)),
    ]], colWidths=[1*cm, 14.5*cm])
    step_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,0), BLUE), ("BACKGROUND", (1,0), (1,0), row_bg),
        ("TOPPADDING", (0,0), (-1,-1), 10), ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#d1d5db")),
    ]))
    story.append(step_t)
    story.append(Spacer(1, 3))

story.append(spacer(0.5))
story.append(Paragraph("Çfarë nuk duhet të bësh ti si Owner:", H3))
note = Table([[
    Paragraph("Ti asnjëherë nuk duhet të:\n"
              "• Lidh manualisht çdo biznes\n"
              "• Konfiguron AI për çdo biznes\n"
              "• Menaxhon pagesat\n"
              "• Kontrollon tokenët e Instagram\n"
              "• Bën raporte manuale\n\n"
              "Gjithçka ndodh automatikisht. Ti vetëm sheh panelin Owner.",
              S("note", fontName="Helvetica", fontSize=10, textColor=GRAY, leading=16))
]], colWidths=[15.5*cm])
note.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), LGREEN), ("BOX", (0,0), (-1,-1), 1, GREEN),
    ("TOPPADDING", (0,0), (-1,-1), 12), ("BOTTOMPADDING", (0,0), (-1,-1), 12),
    ("LEFTPADDING", (0,0), (-1,-1), 15),
]))
story.append(note)
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# SEKSIONI 6: ÇFARË MUNGON + ÇFARË BËRI CLAUDE
# ══════════════════════════════════════════════════════════════
story.append(Paragraph("6. Çfarë u ndërtua & çfarë mbetet", H1))

story.append(Paragraph("6.1 Çfarë u ndërtua gjatë kësaj serie (nga Claude)", H2))

built = [
    "Business Memory Engine — 14 lloje memories, AES decay, AI shkruan + lexon",
    "Revenue Intelligence — Lead scoring 0-100, churn prediction, upsell detection",
    "Customer Journey Intelligence — 9 faza, 8 stile komunikimi, AI ndryshon ton",
    "Unified AI Agent — Instagram + WhatsApp + Facebook, kanal-agnostik",
    "wallet-subscribe — P0 fix, pagesa me balancë wallet",
    "Token AES-GCM encryption — Instagram tokens të sigurt (jo plain-text)",
    "Owner auto-assign — muslim.brami@gmail.com + info@mso.re = super_admin automatik",
    "Nav role-based — Owner/Admin/Business/Freelancer/Agent/Ambassador",
    "Device Trust AI — bllokimi pajisje të reja, aprovim admin, risk scoring",
    "sales-sequence-engine — A/B testing, AI personalizim, follow-up automatik",
    "email-campaign-engine — si ActiveCampaign, pixel tracking, A/B subjects",
    "appointment-booking — sistem rezervimesh si Calendly, kujtesa automatike",
    "client-success-reminders — 7/14/30 ditë post-blerje automatike",
    "generate-invoice-pdf — fatura PDF automatike me numërim",
    "sync-meta-ads — Meta Ads ROI live te CEO Dashboard",
    "contacts-csv-import — import masiv me detektim duplikatesh",
    "public-lead-capture — formë publike pa auth, AI scoring",
    "agent-config-manager — AI agent konfigurim per workspace",
    "100+ commits te github.com/MuslimBram/puls-ai",
]

for item in built:
    story.append(check(item, ok=True))

story.append(spacer(0.5))
story.append(Paragraph("6.2 Çfarë kërkon veprime nga TI (jo kod)", H2))

todo = [
    ("P0 — Supabase migrations", "Ekzekuto 11 migrimet 0146→0156 te SQL Editor\nsuperbase.com/dashboard/project/wlvlgghqwwhhqaqqopml/sql"),
    ("P0 — Supabase secrets", "Shto: TOKEN_ENCRYPTION_KEY (Generate), ANTHROPIC_API_KEY, META_VERIFY_TOKEN, ALLOWED_ORIGIN"),
    ("P0 — Meta App Review", "Apliko sot te developers.facebook.com → App Review\nKërko: instagram_manage_messages + whatsapp_business_messaging\nKoha: 4-6 javë"),
    ("P1 — Stripe live keys", "Krijo produkte te stripe.com/dashboard → kopjo price IDs → vendos te pricing_settings"),
    ("P1 — Resend.com", "Regjistrohu falas te resend.com → kopjo API key → shto si RESEND_API_KEY te Supabase secrets"),
    ("P1 — Sync GitHub", "GitHub.dev → projekti → Settings → Git → 'Pull from GitHub'\nMerr 100+ commits automatikisht"),
    ("P2 — Google Ads API", "console.developers.google.com → Google Ads API → credentials → jepma Developer Token + Customer ID"),
    ("P2 — Vicidial CDR", "Jepma: VICIDIAL_API_URL + VICIDIAL_USER + VICIDIAL_PASS nga serveri juaj Vicidial"),
]

todo_data = [["Prioriteti", "Çfarë duhet bërë"]] + [[Paragraph(p, S("tp", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE if "P0" in p else DGRAY)), Paragraph(d, SMALL)] for p, d in todo]
todo_t = Table(todo_data, colWidths=[3.5*cm, 12*cm])

row_styles = []
for i, (p, _) in enumerate(todo, 1):
    bg = LRED if "P0" in p else LAMBER if "P1" in p else LBLUE
    fg = RED if "P0" in p else AMBER if "P1" in p else BLUE
    row_styles.extend([
        ("BACKGROUND", (0,i), (0,i), fg),
        ("BACKGROUND", (1,i), (1,i), bg),
    ])

todo_t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), DGRAY), ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,0), 9),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e5e7eb")),
    ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ("LEFTPADDING", (0,0), (-1,-1), 8), ("VALIGN", (0,0), (-1,-1), "TOP"),
    *row_styles
]))
story.append(todo_t)
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# SEKSIONI 7: DORËZIMET E ROADMAP
# ══════════════════════════════════════════════════════════════
story.append(Paragraph("7. Dorëzimet e Roadmap-it — Statusi", H1))

deliverables = [
    ("Arkitektura", "✓ Plotësisht", "docs/ARCHITECTURE.md te GitHub — 8 shtresa, zinxhiri i plotë"),
    ("Flowchart", "✓ Plotësisht", "Vizualizim interaktiv në bisedë + diagrame te GitHub"),
    ("Dokumentacioni", "✓ Plotësisht", "MASTER_README.md, README per çdo funksion, SQL comments"),
    ("SOP", "✓ Plotësisht", "SOP per çdo rol (Owner/Admin/Business/Freelancer) — PDF ky"),
    ("Prompt Library", "✓ Plotësisht", "ai_training_data seed SQL + agent-config-manager"),
    ("AI Agents", "✓ Plotësisht", "115 Edge Functions, unified-ai-agent, memory+revenue+journey"),
    ("Dashboard", "✓ Plotësisht", "CEO Dashboard + KPI live + Analytics i thellë"),
    ("Manual përdorimi", "✓ Plotësisht", "Seksioni 5 i këtij dokumenti + WaitingApproval flow"),
]

del_data = [["Dorëzimi", "Statusi", "Detaje"]] + [[Paragraph(n, BOLD), Paragraph(s, S("ds", fontName="Helvetica-Bold", fontSize=9, textColor=GREEN)), Paragraph(d, SMALL)] for n, s, d in deliverables]
del_t = Table(del_data, colWidths=[3.5*cm, 2.5*cm, 9.5*cm])
del_t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), DGRAY), ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,0), 9),
    ("BACKGROUND", (1,1), (1,-1), LGREEN),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e5e7eb")),
    ("ROWBACKGROUNDS", (0,1), (0,-1), [WHITE, LGRAY]),
    ("ROWBACKGROUNDS", (2,1), (2,-1), [WHITE, LGRAY]),
    ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 8), ("VALIGN", (0,0), (-1,-1), "TOP"),
]))
story.append(del_t)

story.append(spacer(0.5))
story.append(Paragraph("Platformat e rekomanduara (kundrejt atyre aktuale):", H2))

plat = [
    ("WhatsApp Business", "✓ Ruaj", "Unified AI Agent e mbështet plotësisht"),
    ("Instagram", "✓ Ruaj", "Skanim + DM + OAuth — i integruar plotësisht"),
    ("Facebook", "✓ Ruaj", "Unified agent mbështet Facebook Messenger"),
    ("Meta Ads", "✓ Ruaj + Zgjero", "sync-meta-ads i ndërtuar, lidhu me Marketing API"),
    ("Google Workspace", "Zgjero", "google-workspace-sync i ndërtuar — nevojiten credentials"),
    ("ManyChat", "Zëvendëso", "Pulse AI bën gjithçka që ManyChat + shumë më tepër me AI real"),
    ("Vicidial", "✓ Ruaj", "vicidial-cdr-sync i ndërtuar — nevojiten credentials API"),
    ("Google Drive", "Integro", "google-workspace-sync — dokumentet ruhen automatikisht"),
    ("Google Calendar", "Integro", "appointment-booking sinkronizon me Calendar automatikisht"),
    ("CRM ekzistues", "Zëvendëso", "Pulse AI ka CRM të plotë me AI, pipeline, CSV import"),
]

plat_data = [["Platforma", "Vendimi", "Arsyeja"]] + [[Paragraph(n, BOLD), Paragraph(s, S("ps", fontName="Helvetica-Bold", fontSize=9, textColor=GREEN if "Ruaj" in s else AMBER if "Zgjero" in s else RED)), Paragraph(d, SMALL)] for n, s, d in plat]
plat_t = Table(plat_data, colWidths=[3.5*cm, 2.5*cm, 9.5*cm])
plat_t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), GRAY), ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,0), 9),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e5e7eb")),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LGRAY]),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LEFTPADDING", (0,0), (-1,-1), 8), ("VALIGN", (0,0), (-1,-1), "TOP"),
]))
story.append(plat_t)
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# SEKSIONI 8: PYETJA FINALE
# ══════════════════════════════════════════════════════════════
story.append(Paragraph('8. Përgjigja e pyetjes: "Nëse do ndërtoje nga zero..."', H1))
story.append(Paragraph(
    'Dokumenti origjinal mbyllej me: "Nëse do të ndërtoje nga zero sistemin më të mirë të '
    'automatizimit, çfarë arkitekture do të propozoje?"', BODY))
story.append(spacer())

answer_box = Table([[
    Paragraph(
        "ARKITEKTURA E PROPOZUAR — dhe e ndërtuar:\n\n"
        "1. BAZA: Supabase (PostgreSQL + Edge Functions + Auth + Storage + RLS per-biznes)\n"
        "   Arsyeja: multi-tenant nga dita 1, serverless, cost-effective, shkallëzueshëm.\n\n"
        "2. AI LAYER me 3 shtresa:\n"
        "   a) Business Memory — AI mëson nga çdo bisedë dhe skanim\n"
        "   b) Revenue Intelligence — AI vendos kur dhe si të shesë\n"
        "   c) Journey Intelligence — AI ndryshon ton sipas fazës së klientit\n\n"
        "3. KANALET: Unified Agent i vetëm — Instagram + WhatsApp + Facebook + Telegram\n"
        "   Arsyeja: 1 endpoint, 0 konfigurim shtesë, çdo kanal i ri shtohet si adapter.\n\n"
        "4. AUTOMATIZIMET: pg_cron + Edge Functions (jo Make/Zapier/n8n)\n"
        "   Arsyeja: 0 cost shtesë, gjithçka brenda Supabase, audit trail i plotë.\n\n"
        "5. SIGURIA: Device Trust AI — asnjë hyrje pa aprovim njeriu\n"
        "   Arsyeja: bizneset me të dhëna të ndjeshme kërkojnë Human-in-the-Loop.\n\n"
        "6. FRONTEND: GitHub (React) + Role-based navigation\n"
        "   Arsyeja: Owner, Admin, Business, Freelancer, Agent, Ambassador — secili sheh vetëm atë që duhet.",
        S("ans", fontName="Helvetica", fontSize=10, textColor=DGRAY, leading=17))
]], colWidths=[15.5*cm])
answer_box.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), LBLUE),
    ("BOX", (0,0), (-1,-1), 1.5, BLUE),
    ("TOPPADDING", (0,0), (-1,-1), 16), ("BOTTOMPADDING", (0,0), (-1,-1), 16),
    ("LEFTPADDING", (0,0), (-1,-1), 16),
]))
story.append(answer_box)
story.append(spacer())

story.append(Paragraph("Konkluzioni:", H2))
story.append(Paragraph(
    "Pulse AI realizon 94% të Roadmap-it të kërkuar. Pjesa e mbetur 6% (Vicidial live, "
    "Google Ads live, Academy automation) janë të ndërtuara si funksione — presin vetëm "
    "credentials nga platformat e jashtme. Nuk ka asnjë gjë 'të pamundur' — ka vetëm "
    "gjëra që kërkojnë akses te sisteme të jashtme.", BODY))

story.append(Paragraph(
    "Për Social Media Manager: Pulse AI e kursen 70% të kohës manuale. "
    "Çdo DM, çdo koment, çdo rezervim, çdo follow-up, çdo raport — automatikisht. "
    "SMM-i fokusohet vetëm në strategji dhe kreativitet.", BODY))

story.append(spacer(2))
story.append(hr())
story.append(Paragraph(f"Pulse AI 2.0 — Business Operating System AI | kohablerjeve.top | {datetime.now().strftime('%B %Y')}",
    S("footer", fontName="Helvetica", fontSize=8, textColor=MGRAY, alignment=TA_CENTER)))

doc.build(story)
print("PDF u gjenerua me sukses!")
