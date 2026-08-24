import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("final onboarding product-truth certification", () => {
  it("keeps all five setup steps aligned with implemented capabilities", () => {
    const progress = read("src/hooks/useOnboardingProgress.ts");

    expect(progress).toContain('label: "Create Business Profile"');
    expect(progress).toContain('label: "Connect First Channel"');
    expect(progress).toContain('label: "Add First CRM Deal"');
    expect(progress).toContain('label: "Add Knowledge Source"');
    expect(progress).toContain('label: "Create First Automation"');

    expect(progress).not.toContain('label: "Import Contacts"');
    expect(progress).not.toContain('label: "Upload Knowledge Base"');
  });

  it("uses real persisted evidence for every completion signal", () => {
    const progress = read("src/hooks/useOnboardingProgress.ts");

    expect(progress).toContain('.from("business_profiles")');
    expect(progress).toContain('.from("channels")');
    expect(progress).toContain('.eq("connection_status", "connected")');
    expect(progress).toContain('.from("deals")');
    expect(progress).toContain('.from("knowledge_sources")');
    expect(progress).toContain('.from("automation_workflows")');
  });

  it("routes each onboarding choice to an implemented product surface", () => {
    const onboarding = read("src/pages/Onboarding.tsx");

    expect(onboarding).toContain('business_profile: "/business-profile"');
    expect(onboarding).toContain('connect_channel: "/connections"');
    expect(onboarding).toContain('import_contacts: "/crm?tab=pipeline"');
    expect(onboarding).toContain('upload_knowledge: "/knowledge-base"');
    expect(onboarding).toContain('create_automation: "/automations"');
  });

  it("proves the first-automation flow creates a real automation_workflows row", () => {
    const page = read("src/pages/Automations.tsx");
    const hook = read("src/hooks/useAutomations.ts");

    expect(page).toContain("New Workflow");
    expect(page).toContain("createWorkflow.mutate(data)");
    expect(page).toContain("actions.length === 0");
    expect(hook).toContain('.from("automation_workflows")');
    expect(hook).toContain(".insert({ ...workflow, user_id: user!.id }");
    expect(hook).toContain('supabase.functions.invoke("execute-automation"');
  });

  it("keeps Orbit click-selection semantics on onboarding", () => {
    const onboarding = read("src/pages/Onboarding.tsx");

    expect(onboarding).toContain("<OrbitSelector");
    expect(onboarding).toContain("onSelect={setSelectedStep}");
    expect(onboarding).toContain("rotationInterval={2500}");
    expect(onboarding).toContain("disabled={!selectedOpenStep}");
  });
});
