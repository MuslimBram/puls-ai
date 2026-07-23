-- supabase/migrations/0163_demo_workspaces.sql
-- Demo workspaces: kohablerjeve.top, support.mso.re, muslimi-digital.in, smileshop.al

DO $$
DECLARE
  ws1 uuid := gen_random_uuid();
  ws2 uuid := gen_random_uuid();
  ws3 uuid := gen_random_uuid();
  ws4 uuid := gen_random_uuid();
BEGIN

-- ── DEMO WORKSPACES ──────────────────────────────────────────
INSERT INTO public.workspaces(id,name,slug,plan,status) VALUES
  (ws1,'Kohablerjeve Digital','kohablerjeve','pro','active'),
  (ws2,'MSO Support','mso-support','growth','active'),
  (ws3,'Muslimi Digital','muslimi-digital','pro','active'),
  (ws4,'SmileShop AL','smileshop-al','growth','active')
ON CONFLICT DO NOTHING;

-- ── AI AGENT CONFIGS ─────────────────────────────────────────
INSERT INTO public.ai_agent_configs(workspace_id,agent_name,agent_tone,language,business_description,auto_reply_enabled,memory_enabled,instagram_enabled,whatsapp_enabled)
VALUES
(ws1,'Pulse Assistant','professional_friendly','sq','Shërbime AI dhe automatizim biznesi. Ofrojmë Pulse AI BOS, zgjidhje dixhitale dhe konsulencë teknologjike. Zyra: Tiranë, Shqipëri.',true,true,true,true),
(ws2,'MSO Support Bot','formal','sq','Mbështetje teknike profesionale. Email: support@mso.re. Ofroj ndihmë për Pulse AI, hosting, domaine dhe shërbime dixhitale. Koha e përgjigjes: 24 orë.',true,true,true,false),
(ws3,'Marketing AI','casual','sq','Marketing dixhital, social media menaxhim, SEO dhe AI automatizim. Specializuar për tregjet shqiptare dhe rajonale.',true,true,true,true),
(ws4,'SmileShop Assistant','enthusiastic','sq','Dyqan online produktesh dentare dhe bukurie. 500+ produkte. Dorëzim 24-48h në gjithë Shqipërinë. Falas mbi 5000 lekë.',true,true,false,true)
ON CONFLICT DO NOTHING;

-- ── PIPELINE STAGES ──────────────────────────────────────────
INSERT INTO public.pipeline_stages(workspace_id,name,order_index,color)
VALUES
(ws1,'Lead i Ri',0,'#6b7280'),(ws1,'Kontaktuar',1,'#3b82f6'),
(ws1,'Demo Planifikuar',2,'#8b5cf6'),(ws1,'Propozim Dërguar',3,'#f59e0b'),
(ws1,'Negocim',4,'#f97316'),(ws1,'Fituar',5,'#22c55e'),(ws1,'Humbur',6,'#ef4444')
ON CONFLICT DO NOTHING;

-- ── AI TRAINING DATA ─────────────────────────────────────────
INSERT INTO public.ai_training_data(workspace_id,type,question,answer,priority,is_active)
VALUES
(ws1,'faq','Sa kushton Pulse AI?','Pulse AI ka 5 paketa: Free (pa pagesë), Starter $29/m, Growth $99/m, Pro $299/m dhe Enterprise $499/m. Të gjitha përfshijnë provë 7-ditore falas.',9,true),
(ws1,'faq','Si funksionon AI?','AI ynë mëson nga postimet dhe produktet tuaja brenda 15 minutave. Pastaj përgjigjet automatikisht 24/7 në WhatsApp, Instagram dhe Facebook.',9,true),
(ws1,'faq','A ka integrim me Odoo?','Po! Nga paketa Growth e lart, Pulse AI integrohet me Odoo ERP për CRM, fatura, inventar dhe HR.',8,true),
(ws2,'faq','Si mund të hap një ticket?','Dërgoni email te support@mso.re ose shkruani këtu. I marrim mesazhet brenda 30 minutave. Gjatë orarit 09:00-17:00, çdo ditë pune.',9,true),
(ws3,'faq','Çfarë shërbimesh ofroni?','Social media menaxhim, SEO, Google Ads, Meta Ads, content creation, email marketing dhe AI chatbot. Paketë mujore nga 15,000 lekë.',9,true),
(ws4,'faq','Kur bëhet dorëzimi?','Dorëzim standard: 24-48 orë. Tiranë: mundësisht same-day. Porosi mbi 5,000 lekë = transport falas. Gjurmo porosinë me SMS automatik.',9,true)
ON CONFLICT DO NOTHING;

-- ── INTEGRATION STATUS ────────────────────────────────────────
INSERT INTO public.integration_status(workspace_id,integrations,onboarding_step,onboarding_done,ai_setup_done)
VALUES
(ws1,'{"instagram":{"status":"connected","username":"kohablerjeve"},"whatsapp":{"status":"connected"},"stripe":{"status":"connected"},"meta_ads":{"status":"connected"}}'::jsonb,6,true,true),
(ws2,'{"instagram":{"status":"connected","username":"mso.re"},"email":{"status":"connected","provider":"resend"}}'::jsonb,4,false,true),
(ws3,'{"instagram":{"status":"connected","username":"muslimi.digital"},"whatsapp":{"status":"connected"},"google_ads":{"status":"connected"},"meta_ads":{"status":"connected"}}'::jsonb,6,true,true),
(ws4,'{"whatsapp":{"status":"connected"},"stripe":{"status":"connected"},"shopify":{"status":"pending"}}'::jsonb,5,false,true)
ON CONFLICT DO NOTHING;

-- ── DEMO LEADS ───────────────────────────────────────────────
INSERT INTO public.public_leads(name,email,phone,business_name,message,ai_score,ai_intent,status,source,target_workspace_id)
VALUES
('Artan Morina','artan@biznesim.al','+355697123456','Auto Parts SH.P.K.','Dua të automatizoj support-in e klientëve. 50+ mesazhe/ditë.',0.82,'hot','qualified','landing',ws1),
('Blerinda Hoxha','blerinda@studio.al','+355684567890','Studio Foto Blerinda','Interesohem për paketën Growth. Keni provë falas?',0.71,'warm','new','instagram',ws1),
('Gentian Shehu','gentian@restaurant.al',NULL,'Restorant Gjirokastra','Sa kushton per nje restorant me 3 punonjes?',0.65,'warm','new','whatsapp',ws3),
('Viola Koci','viola@clinic.al','+355693456789','Klinika Dentare Viola','Dua sistem rezervimesh automatik dhe reminder-a.',0.88,'hot','qualified','website',ws4)
ON CONFLICT DO NOTHING;

END;$$;
