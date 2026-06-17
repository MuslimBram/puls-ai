# Industry Packs

Industry Packs are one-click vertical bundles that provision a complete starter setup for a specific business type. Each pack ships:

- a **CRM pipeline** with industry-appropriate stages
- **automation workflows** (installed inactive — review and turn on)
- **broadcast templates** (WhatsApp/email drafts)
- a **knowledge base** with FAQ + policies
- **dashboard widgets** with KPI placeholders

## Available packs

| Slug | Name | Industry |
|---|---|---|
| `restaurant` | Restaurant Starter | Restaurants & cafés |
| `clinic` | Clinic Starter | Healthcare & private practices |
| `real-estate` | Real Estate Starter | Property agencies |
| `beauty-salon` | Beauty Salon Starter | Salons & spas |
| `gym` | Gym & Fitness Starter | Gyms & fitness studios |
| `education` | Education Starter | Schools & academies |

## How it works

1. User opens **Marketplace → Industry Packs**.
2. Clicks **Preview & install** on a card → dialog lists every item the pack will create.
3. Confirms → the `install-industry-pack` edge function provisions:
   - rows in `pipeline_stages` (scoped to current workspace + user)
   - rows in `automation_workflows` (`is_active=false`)
   - rows in `whatsapp_templates` (`status='draft'`)
   - one `knowledge_sources` row + N `knowledge_chunks`
   - one `workspace_industry_packs` row with the full install log
4. The Dashboard automatically renders **Industry Pack Widgets** for installed packs.

## Database

- `public.industry_packs` — published catalog. Anyone signed in can read; admins manage.
- `public.workspace_industry_packs` — install records, RLS scoped to workspace members.

## Adding a new pack

Insert a new row in `industry_packs` with a unique `slug` and a `contents` JSON that follows this shape:

```jsonc
{
  "pipeline":   { "name": "...", "stages": [{ "name": "...", "color": "#hex" }] },
  "automations":[ { "name": "...", "trigger_type": "...", "trigger_config": {}, "actions": [] } ],
  "broadcasts": [ { "name": "...", "channel": "whatsapp|email|sms", "body": "..." } ],
  "knowledge":  [ { "title": "...", "content": "..." } ],
  "widgets":    [ { "key": "...", "title": "...", "metric": "..." } ]
}
```

The install flow is content-driven — no code changes needed for new packs.

## Uninstall

Removes the `workspace_industry_packs` row only. Generated stages, automations, templates, and KB entries remain so users do not lose their customisations.
