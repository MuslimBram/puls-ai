-- supabase/migrations/0158_demo_data.sql
-- Demo data: 6 biznese shembull + leads + conversations
-- SHENIM: Ekzekuto VETËM te environment test/staging, jo production

-- ── 1. BUSINESS TYPES seed ─────────────────────────────────────
INSERT INTO public.ai_agent_configs (workspace_id, agent_name, agent_tone, language,
  business_description, auto_reply_enabled, memory_enabled, instagram_enabled, whatsapp_enabled)
SELECT
  gen_random_uuid(),
  name, 'professional_friendly', 'sq', description, true, true, true, true
FROM (VALUES
  ('Café Lirika', 'Kafe dhe restorant në Vlorë. Ofrojmë espresso 150L, cappuccino 180L, menu të plotë ditore. Hapemi 08:00-22:00 çdo ditë.'),
  ('Studio Bukurie Eva', 'Salon bukurie në Tiranë. Shërbime: gdhirje 3500L+, ngjyrosje 2500L+, manikyr 800L. Rezervimet online.'),
  ('Gym Pulse Durrës', 'Palestër moderne në Durrës. Membership: Basic 3000L/muaj, Premium 4500L/muaj. Trial 3 ditë falas.'),
  ('Klinikë Dentare Smile', 'Klinikë dentare në Shkodër. Mjekë të specializuar. Takime online 24/7. Pastrim 2500L.'),
  ('ArtizanAL E-commerce', 'Dyqan online i produkteve artizanale shqiptare. 300+ produkte. Dorëzim 24-48h. Falas mbi 5000L.'),
  ('Bliri Tours', 'Agjenci udhëtimesh në Tiranë. Tura grupore dhe individuale. Europa, Mesdhe, Egjipt. Çmimet nga 500€.')
) AS t(name, description)
ON CONFLICT DO NOTHING;

-- ── 2. PIPELINE STAGES default ─────────────────────────────────
-- (krijohen gjatë onboarding-ut të çdo workspace)

-- ── 3. APPOINTMENT TYPES shembull ─────────────────────────────
-- Shtohen gjatë onboarding-ut të biznesit specifik

-- ── 4. EMAIL CAMPAIGN template shembull ────────────────────────
INSERT INTO public.email_campaigns (workspace_id, name, subject, body_html,
  from_name, from_email, status, type)
SELECT
  gen_random_uuid(),
  'Welcome Email - Template',
  'Mirë se vini te {{business_name}}! 🎉',
  '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
  <h2 style="color:#1d4ed8">Mirë se vini, {{name}}!</h2>
  <p>Faleminderit që u bashkuat me ne. Jemi të lumtur t ju kemi si klient.</p>
  <p>Çfarë mund të bëjmë për ju:</p>
  <ul>
    <li>{{benefit_1}}</li>
    <li>{{benefit_2}}</li>
    <li>{{benefit_3}}</li>
  </ul>
  <a href="{{cta_url}}" style="background:#1d4ed8;color:#fff;padding:12px 24px;
    text-decoration:none;border-radius:8px;display:inline-block;margin-top:16px">
    {{cta_text}}
  </a>
  </div>',
  'Pulse AI', 'noreply@kohablerjeve.top', 'draft', 'trigger'
WHERE NOT EXISTS (SELECT 1 FROM public.email_campaigns WHERE name = 'Welcome Email - Template')
LIMIT 1;

-- ── 5. REMINDER RULES default ──────────────────────────────────
INSERT INTO public.reminder_rules (workspace_id, name, trigger_event, delay_days,
  channel, subject, body_template, is_active)
SELECT
  gen_random_uuid(),
  name, event, delay, 'email', subj, body, true
FROM (VALUES
  ('Mirëseardhi - Dita 1', 'purchase_made', 1,
   'Si po shkoni me {{business_name}}?',
   'Pershendetje {{name}},\n\nKaloi 1 ditë nga fillimi juaj. Si po shkoni?\nNëse keni pyetje, jemi këtu.\n\nTeam {{business_name}}'),
  ('Check-in - Dita 7', 'purchase_made', 7,
   '7 ditë me ne — faleminderit {{name}}!',
   'Pershendetje {{name}},\n\n7 ditë bashkë! Shpresojmë gjithçka po shkon mirë.\nKeni nevojë për ndihmë me ndonjë gjë?\n\nTeam {{business_name}}'),
  ('Trial po mbaron', 'trial_ending', 3,
   'Trial juaj mbaron pas 3 ditësh — {{name}}',
   'Pershendetje {{name}},\n\nTriali juaj falas mbaron pas 3 ditësh.\nPër të vazhduar pa ndërprerje, zgjidhni planin tuaj:\n{{subscription_url}}\n\nTeam Pulse AI'),
  ('Rinovimi afrohet', 'subscription_renewing', 7,
   'Abonimi juaj rinovohet pas 7 ditësh',
   'Pershendetje {{name}},\n\nAbonimin tuaj {{plan}} rinovohet automatikisht pas 7 ditësh.\nNëse doni të ndryshoni planin: {{settings_url}}\n\nTeam Pulse AI')
) AS t(name, event, delay, subj, body)
WHERE NOT EXISTS (SELECT 1 FROM public.reminder_rules LIMIT 1);

-- ── 6. AI TRAINING DATA shembull (FAQ universale) ──────────────
INSERT INTO public.ai_training_data (workspace_id, type, question, answer, priority, is_active)
SELECT
  gen_random_uuid(),
  type, question, answer, priority, true
FROM (VALUES
  ('faq', 'Kur jeni të hapur?', 'Jemi të hapur çdo ditë nga ora {{open_time}} deri {{close_time}}. Ju lutemi konfirmoni rezervimin tuaj paraprakisht.', 9),
  ('faq', 'Si mund të rezervoj?', 'Mund të rezervoni direkt nga ky chat duke treguar datën dhe orën, ose duke klikuar: {{booking_link}}', 9),
  ('faq', 'A pranoni karta krediti?', 'Po, pranojmë të gjitha kartat kryesore (Visa, Mastercard) si dhe cash dhe transfertë bankare.', 8),
  ('objection', 'Çmimi është shumë i lartë', 'E kuptoj shqetësimin tuaj. Çmimi ynë përfshin [vlera specifike]. Kemi gjithashtu opsionin [alternativa me çmim më të ulët] nëse dëshironi.', 8),
  ('objection', 'Duhet të mendoj', 'Sigurisht, merrni kohën tuaj. Nëse keni pyetje ndërkohë, jam këtu. A dëshironi t ju dërgoj informacione shtesë?', 7),
  ('policy', 'Politika e kthimit', 'Nëse nuk jeni të kënaqur, na kontaktoni brenda {{return_days}} ditësh dhe do gjejmë zgjidhje. Kënaqësia juaj është prioriteti ynë.', 8)
) AS t(type, question, answer, priority)
WHERE NOT EXISTS (SELECT 1 FROM public.ai_training_data LIMIT 1);
