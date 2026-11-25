/**
 * Përshkrimi i faqeve të anëtarëve, që t'u shpjegohet vizitorëve
 * çfarë gjejnë aty dhe pse duhet llogari (Hyr / Regjistrohu).
 */
export type MemberPageInfo = { sq: [string, string]; en: [string, string]; admin?: boolean };

export const MEMBER_PAGES: Record<string, MemberPageInfo> = {
  "/dashboard": { sq: ["Paneli kryesor", "Pamja e përgjithshme e biznesit tënd: bizneset, detyrat e ditës, njoftimet dhe hapat e radhës."], en: ["Dashboard", "An overview of your business: workspaces, today's tasks, notifications and next steps."] },
  "/inbox": { sq: ["Inbox i unifikuar", "Të gjitha bisedat me klientët nga WhatsApp, Instagram, Messenger, Telegram, email dhe chat-i i faqes në një vend."], en: ["Unified Inbox", "All customer conversations from WhatsApp, Instagram, Messenger, Telegram, email and web chat in one place."] },
  "/leads": { sq: ["Klientët e mundshëm (Leads)", "Lista e klientëve të rinj që vijnë nga kanalet e tua, me burimin dhe gjendjen e secilit."], en: ["Leads", "New prospects coming from your channels, with source and status for each."] },
  "/crm": { sq: ["CRM", "Historia e çdo klienti, pronari i marrëdhënies dhe ecuria e marrëveshjeve."], en: ["CRM", "Each customer's history, owner and deal progress."] },
  "/lidhjet": { sq: ["Lidhjet", "Rrjeti i bizneseve dhe profesionistëve: mundësi pune, bashkëpunime dhe shërbime."], en: ["Lidhjet", "The business and professional network: job opportunities, partnerships and services."] },
  "/leah": { sq: ["LEAH – asistenti AI", "Bisedë me asistentin AI që njeh biznesin tënd dhe të ndihmon me përgjigje dhe detyra."], en: ["LEAH – AI assistant", "Chat with the AI assistant that knows your business and helps with replies and tasks."] },
  "/campaigns": { sq: ["Fushatat", "Krijo dhe ndiq fushata marketingu në kanalet e tua."], en: ["Campaigns", "Create and track marketing campaigns across your channels."] },
  "/media-studio": { sq: ["Studio e përmbajtjes", "Krijo me AI postime, imazhe dhe video për rrjetet sociale, dhe ruaji në galeri."], en: ["Content Studio", "Create posts, images and videos with AI for social media and keep them in a gallery."] },
  "/sources": { sq: ["Skaneri i biznesit", "Skanon faqen, produktet dhe rrjetet sociale të biznesit që AI-ja ta njohë më mirë."], en: ["Business Scanner", "Scans your website, products and social profiles so the AI knows your business."] },
  "/analytics": { sq: ["Analitika", "Shifrat e bisedave, klientëve, shpejtësisë së përgjigjes dhe shitjeve."], en: ["Analytics", "Numbers for conversations, leads, response speed and sales."] },
  "/content-calendar": { sq: ["Kalendari i përmbajtjes", "Planifiko kur publikohet çdo postim."], en: ["Content Calendar", "Plan when each post is published."] },
  "/seo-audit": { sq: ["Analiza SEO", "Kontrollon faqen tënde në internet dhe tregon çfarë duhet përmirësuar për Google."], en: ["SEO Analysis", "Checks your website and shows what to improve for Google."] },
  "/competitor-intelligence": { sq: ["Konkurrentët", "Ndjek lëvizjet e konkurrentëve dhe sinjalet e tregut."], en: ["Competitors", "Tracks competitor moves and market signals."] },
  "/automations": { sq: ["Automatizimet", "Rregulla që dërgojnë mesazhe, kalojnë bisedat dhe kryejnë detyra vetë."], en: ["Automations", "Rules that send follow-ups, hand off conversations and run tasks automatically."] },
  "/ai-decisions": { sq: ["Këshilltari AI", "Sugjerime nga AI për postime, oferta, përgjigje dhe fushata, që i miraton ti."], en: ["AI Advisor", "AI suggestions for posts, offers, replies and campaigns that you approve."] },
  "/sales-engine": { sq: ["Motori i shitjeve", "Ndjek procesin e shitjes nga kontakti i parë deri te mbyllja."], en: ["Sales Engine", "Follows the sales process from first contact to close."] },
  "/revenue-engine": { sq: ["Motori i të ardhurave", "Pamje e të ardhurave dhe mundësive për t'i rritur."], en: ["Revenue Engine", "A view of revenue and opportunities to grow it."] },
  "/telephony": { sq: ["Telefonia", "Thirrjet telefonike dhe historia e tyre."], en: ["Telephony", "Phone calls and their history."] },
  "/broadcast": { sq: ["Mesazhe masive", "Dërgo një mesazh te shumë klientë njëherësh, me pëlqimin e tyre."], en: ["Broadcast", "Send one message to many customers at once, with their consent."] },
  "/helpdesk": { sq: ["Helpdesk", "Kërkesat për ndihmë nga klientët, me përgjegjës dhe gjendje."], en: ["Helpdesk", "Customer support requests with owner and status."] },
  "/knowledge-base": { sq: ["Baza e njohurive", "Informacioni i biznesit që AI-ja përdor për të dhënë përgjigje të sakta."], en: ["Knowledge Base", "Business information the AI uses to give accurate answers."] },
  "/ai-marketplace": { sq: ["Tregu AI", "Agjentë dhe aftësi AI të gatshme që mund t'i shtosh."], en: ["AI Marketplace", "Ready-made AI agents and skills you can add."] },
  "/ai-training": { sq: ["Qendra e trajnimit AI", "Mëso AI-në si të flasë dhe të veprojë për biznesin tënd."], en: ["AI Training Center", "Teach the AI how to talk and act for your business."] },
  "/integration-wizard": { sq: ["Udhëzuesi i lidhjeve", "Lidh hap pas hapi kanalet dhe programet e tua."], en: ["Integration Wizard", "Connect your channels and tools step by step."] },
  "/managed-businesses": { sq: ["Bizneset", "Bizneset që menaxhon ose që të janë caktuar."], en: ["Businesses", "Businesses you manage or that are assigned to you."] },
  "/connections": { sq: ["Lidhjet e kanaleve", "Gjendja e lidhjeve me WhatsApp, Meta, Telegram, email etj."], en: ["Connections", "Status of your WhatsApp, Meta, Telegram, email and other connections."] },
  "/channels": { sq: ["Kanalet", "Shto dhe menaxho kanalet e komunikimit."], en: ["Channels", "Add and manage communication channels."] },
  "/connected-accounts": { sq: ["Llogaritë e lidhura", "Llogaritë e jashtme të lidhura me Pulse AI."], en: ["Connected Accounts", "External accounts connected to Pulse AI."] },
  "/subscription": { sq: ["Abonimi dhe faturimi", "Plani yt, pagesat dhe faturat."], en: ["Billing", "Your plan, payments and invoices."] },
  "/wallet": { sq: ["Portofoli", "Bilanci, kreditet dhe lëvizjet e tyre."], en: ["Wallet", "Balance, credits and their movements."] },
  "/partner": { sq: ["Partnerët", "Programi i partnerëve: referimet dhe komisionet."], en: ["Partners", "Partner program: referrals and commissions."] },
  "/business-profile": { sq: ["Profili i biznesit", "Të dhënat e biznesit: përshkrimi, shërbimet, tonaliteti dhe gjuha."], en: ["Business Profile", "Your business details: description, services, tone and language."] },
  "/branding": { sq: ["Marka", "Logo, ngjyrat dhe pamja që shohin klientët."], en: ["Branding", "Logo, colors and the look your customers see."] },
  "/session-security": { sq: ["Siguria", "Pajisjet, seancat, verifikimi me dy hapa dhe email-i i konfirmuar."], en: ["Security", "Devices, sessions, two-step verification and email confirmation."] },
  "/help-center": { sq: ["Ndihma", "Udhëzime dhe përgjigje për pyetjet e zakonshme."], en: ["Help", "Guides and answers to common questions."] },
  "/support": { sq: ["Njoftime & mbështetje", "Njoftimet e tua dhe bisedat me ekipin e mbështetjes."], en: ["Notifications & Support", "Your notifications and conversations with support."] },
  "/onboarding": { sq: ["Fillimi", "Hapat e parë për të ngritur biznesin në Pulse AI."], en: ["Getting started", "First steps to set up your business in Pulse AI."] },
  "/businesses/new": { sq: ["Shto biznes", "Krijo një profil të ri biznesi."], en: ["Add business", "Create a new business profile."] },
  "/admin": { sq: ["Paneli i administrimit", "Përdoruesit, abonimet, partnerët dhe miratimet e platformës."], en: ["Admin Panel", "Platform users, subscriptions, partners and approvals."], admin: true },
  "/admin/lidhjet": { sq: ["Moderimi i Lidhjeve", "Kontrolli i postimeve dhe profileve në rrjetin Lidhjet."], en: ["Lidhjet Moderation", "Review of posts and profiles in the Lidhjet network."], admin: true },
  "/admin/activation": { sq: ["Aktivizimi", "Ecuria e aktivizimit të bizneseve të reja."], en: ["Activation", "Activation progress of new businesses."], admin: true },
  "/admin/integration-hub": { sq: ["Qendra e integrimeve", "Gjendja e të gjitha integrimeve të platformës."], en: ["Integration Hub", "Status of all platform integrations."], admin: true },
  "/deep-analytics": { sq: ["Analitika e thellë", "Analiza të detajuara të platformës."], en: ["Deep Analytics", "Detailed platform analytics."], admin: true },
  "/saas-health": { sq: ["Shëndeti i platformës", "Treguesit e rritjes dhe të qëndrueshmërisë së Pulse AI."], en: ["SaaS Health", "Growth and stability indicators of Pulse AI."], admin: true },
  "/system-status": { sq: ["Gjendja e sistemit", "A punojnë shërbimet dhe funksionet e platformës."], en: ["System Status", "Whether platform services and functions are running."], admin: true },
  "/leah/providers": { sq: ["Ofruesit e LEAH", "Modelet AI që përdor LEAH."], en: ["LEAH Providers", "The AI models LEAH uses."], admin: true },
};

export function memberPageInfo(pathname: string): MemberPageInfo | null {
  const clean = pathname.replace(/^\/(en|sq)(?=\/)/, "").replace(/\/+$/, "") || "/";
  if (MEMBER_PAGES[clean]) return MEMBER_PAGES[clean];
  const parent = Object.keys(MEMBER_PAGES)
    .filter((k) => clean.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return parent ? MEMBER_PAGES[parent] : null;
}
