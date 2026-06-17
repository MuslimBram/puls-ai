# Faza 8 #6 — Industry Packs Marketplace (Full End-to-End)

## Scope
6 industry packs të vërteta, secili me 5 komponentë + install flow funksional, backend, UI, testim dhe dokumentim.

**Packs:** Restaurant · Clinic · Real Estate · Beauty Salon · Gym · Education

**Çdo pack përmban:**
1. CRM Pipeline (stages të personalizuara)
2. Automations Starter (3–5 workflows)
3. Broadcast Templates (4–6 mesazhe gati)
4. Knowledge Base Starter (FAQ + policies)
5. Dashboard Widgets (KPI të industrisë)

## 1) Database

**Migration e re:**
- `industry_packs` — katalogu master (slug, name, industry, icon, description, version, contents JSONB, is_published)
- `workspace_industry_packs` — instalimet për workspace (workspace_id, pack_id, installed_by, status, install_log JSONB)
- RLS + GRANTs standarde
- Seed: 6 rreshta në `industry_packs` me `contents` JSON që përshkruan secilin komponent

`contents` JSON shape:
```json
{
  "pipeline": { "name": "...", "stages": [...] },
  "automations": [ { "name": "...", "trigger": {...}, "actions": [...] } ],
  "broadcasts": [ { "name": "...", "channel": "...", "body": "..." } ],
  "knowledge": [ { "title": "...", "content": "..." } ],
  "widgets": [ { "key": "...", "title": "...", "metric": "..." } ]
}
```

## 2) Backend — Edge Function `install-industry-pack`

Input: `{ pack_slug, workspace_id, business_id? }`

Hapat (transaksional, rollback nëse dështon ndonjë):
1. Verifiko membership në workspace
2. Verifiko nuk është instaluar tashmë
3. Krijo `pipeline_stages` nga `contents.pipeline.stages`
4. Krijo `automation_workflows` nga `contents.automations`
5. Krijo `whatsapp_templates` / broadcast drafts nga `contents.broadcasts`
6. Krijo `knowledge_sources` + `knowledge_chunks` nga `contents.knowledge`
7. Ruaj `widgets` në `workspace_industry_packs.install_log`
8. Insert `workspace_industry_packs` me status `installed`
9. Audit log + toast success

## 3) Frontend

- **`src/config/industryPacks.ts`** — definicionet e 6 packs (single source) që seedohen në DB
- **`src/hooks/useIndustryPacks.ts`** — list, install, uninstall, getInstalled
- **`src/pages/Marketplace.tsx`** — tab i ri "Industry Packs" me grid 6 cards
- **`src/components/marketplace/IndustryPackCard.tsx`** — card me icon, contents summary, Install button
- **`src/components/marketplace/IndustryPackInstallDialog.tsx`** — preview i plotë i çfarë instalohet + zgjedhja e business_id + butoni Install
- **`src/components/dashboard/IndustryPackWidgets.tsx`** — render i widgets të instaluar në Dashboard

## 4) Install Flow UX

1. User klikon Install në card → hapet dialog
2. Dialog tregon listën e plotë (X pipeline stages, Y automations, Z templates, etj.)
3. Zgjedh business (nëse ka >1) ose default
4. Konfirmon → progress bar (5 hapa)
5. Success → toast + redirect në CRM/Automations sipas zgjedhjes

## 5) Testim
- Test script në `src/test/` që mock-on install dhe verifikon krijimin
- Manual via Playwright: hap Marketplace → Install Restaurant → verifiko pipeline_stages, automation_workflows, knowledge_sources u krijuan

## 6) Dokumentim
- `docs/industry-packs.md` — çfarë përmban secili pack, si të instalohet, si të krijohet pack i ri
- README link

## Approach
Do ta dorëzoj në 3 batches sekuenciale për të mbajtur cilësinë:
- **Batch A:** Migration + seed + types + config catalog (6 packs të definuar)
- **Batch B:** Edge function `install-industry-pack` + hook + Marketplace tab UI + install dialog
- **Batch C:** Dashboard widgets + Playwright test + docs

Pas Batch A do të prisja konfirmimin tuaj që struktura është OK, pastaj vazhdoj me B dhe C pa ndërprerje.

## A pranon këtë plan?
Nëse po, fillim me Batch A (migration + 6 packs definuar plotësisht).