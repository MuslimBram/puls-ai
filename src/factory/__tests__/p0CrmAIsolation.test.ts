import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/20260829020000_p0_5_crm_a_workspace_isolation.sql");
const verification = read("scripts/verify-p0-5-crm-a.sh");
const crm = read("src/hooks/useCRM.ts");
const contactTimeline = read("src/hooks/useContactTimeline.ts");
const customerIntelligence = read("src/hooks/useCustomerIntelligence.ts");
const deepAnalytics = read("src/hooks/useDeepAnalytics.ts");
const leads = read("src/hooks/useLeads.ts");
const aiMemory = read("src/hooks/useAIConversationMemory.ts");

describe("P0.5 CRM-A workspace isolation", () => {
  it("backfills only unambiguous pipeline stages and rejects unresolved identities", () => {
    expect(migration).toContain("having count(*) = 1");
    expect(migration).toContain("ambiguous legacy rows remain");
    for (const table of [
      "pipeline_stages", "deals", "contact_segments",
      "contact_tags", "enriched_contacts", "lead_scores",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} alter column workspace_id set not null`,
      );
    }
    expect(migration).not.toContain("enterprise_leads");
  });

  it("enforces same-workspace CRM relationships at the database layer", () => {
    expect(migration).toContain("foreign key (stage_id, workspace_id)");
    expect(migration).toContain("references public.pipeline_stages(id, workspace_id)");
    expect(migration).toContain("on delete set null (stage_id)");
    expect(migration).toContain("foreign key (lead_id, workspace_id)");
    expect(migration).toContain("references public.leads(id, workspace_id)");
    expect(migration).toContain("on delete set null (lead_id)");
    expect(migration).toContain("lead_scores_lead_workspace_fkey");
    expect(migration).toContain("contact_consent_lead_workspace_fkey");
    expect(migration).toContain("p0_enforce_workspace_identity_immutable");
    expect(migration).toContain("p0_crm_deals_workspace_immutable");
  });

  it("uses caller-bound workspace roles and parent-derived child authorization", () => {
    expect(migration).toContain(
      "public.has_workspace_role(workspace_id, array['owner','admin','member'])",
    );
    expect(migration).toContain("d.id = deal_notes.deal_id");
    expect(migration).toContain("d.id = deal_tasks.deal_id");
    expect(migration).toContain("d.id = deal_activities.deal_id");
    expect(migration).not.toMatch(/create policy[\s\S]*?has_role\([^;]*admin/i);
    expect(migration).not.toMatch(/create policy[\s\S]*?is_workspace_(?:member|owner)\(/i);
    expect(migration).toMatch(
      /create policy "p0 crm members update deals"[\s\S]*?using[\s\S]*?with check/i,
    );
    expect(migration).toMatch(
      /create policy "p0 crm authors or admins update deal tasks"[\s\S]*?using[\s\S]*?with check/i,
    );
  });

  it("removes anonymous and dangerous browser grants", () => {
    for (const table of [
      "pipeline_stages", "deals", "contact_segments", "contact_tags",
      "enriched_contacts", "lead_scores", "contact_consent",
      "deal_notes", "deal_tasks", "deal_activities",
    ]) {
      expect(migration).toContain(
        `revoke all on table public.${table} from public, anon, authenticated`,
      );
    }
    expect(migration).toContain(
      "grant select on table public.contact_consent to authenticated",
    );
    expect(migration).toContain(
      "grant select on table public.lead_scores to authenticated",
    );
    expect(migration).not.toMatch(/grant\s+[^;]*truncate[^;]*to authenticated/i);
  });

  it("makes active CRM browser callers workspace-scoped", () => {
    expect(crm).toContain('import { useWorkspace } from "@/contexts/WorkspaceContext"');
    expect(crm).toContain('queryKey: ["pipeline-stages", workspace?.id]');
    expect(crm).toContain("workspace_id: workspace.id");
    expect(crm).toContain('.eq("workspace_id", workspace!.id)');

    expect(contactTimeline).toContain('queryKey: ["contact-tags", workspace?.id, contactIdentifier]');
    expect(contactTimeline).toContain('queryKey: ["contact-timeline", workspace?.id, contactIdentifier]');
    expect(contactTimeline).toContain("workspace_id: workspace.id");

    expect(customerIntelligence).toContain(
      'queryKey: ["customer-intelligence", workspace?.id, contactIdentifier, contactName]',
    );
    expect(customerIntelligence).toContain('.eq("workspace_id", workspace.id)');

    expect(deepAnalytics).toContain(
      'queryKey: ["deep-analytics-deals", workspace?.id, dateRange]',
    );
    expect(deepAnalytics).toContain('.eq("workspace_id", workspace!.id)');

    expect(leads).toContain('queryKey: ["leads", workspace?.id, filters, page]');
    expect(leads).toContain('.eq("workspace_id", workspace!.id)');

    expect(aiMemory).toContain('queryKey: ["lead-score", workspace?.id, leadId]');
    expect(aiMemory).toContain('.eq("workspace_id", workspace!.id)');
  });

  it("executes positive and negative tenant checks in PostgreSQL", () => {
    expect(verification).toContain(
      "20260829020000_p0_5_crm_a_workspace_isolation.sql",
    );
    expect(verification).toContain("cross-workspace deal insert was allowed");
    expect(verification).toContain("cross-workspace stage link was allowed");
    expect(verification).toContain("cross-workspace lead link was allowed");
    expect(verification).toContain("member pipeline administration was allowed");
    expect(verification).toContain("cross-workspace deal note was allowed");
    expect(verification).toContain("browser consent mutation was allowed");
    expect(verification).toContain(
      "multi-workspace member moved a deal across tenants",
    );
  });
});
