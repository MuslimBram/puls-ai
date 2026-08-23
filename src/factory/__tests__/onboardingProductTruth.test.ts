import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const onboardingHook = readFileSync("src/hooks/useOnboardingProgress.ts", "utf8");
const onboardingPage = readFileSync("src/pages/Onboarding.tsx", "utf8");

describe("onboarding CRM product truth", () => {
  it("does not advertise contact import when no import flow exists", () => {
    expect(onboardingHook).not.toContain('label: "Import Contacts"');
    expect(onboardingHook).toContain('label: "Add First CRM Deal"');
    expect(onboardingHook).toContain('description: "Create your first deal in the CRM pipeline"');
  });

  it("routes the legacy CRM onboarding key to the implemented pipeline", () => {
    expect(onboardingPage).toContain('import_contacts: "/crm?tab=pipeline"');
    expect(onboardingPage).not.toContain('import_contacts: "/crm?tab=contacts"');
  });

  it("marks the CRM step complete from real deals rather than unrelated leads", () => {
    expect(onboardingHook).toContain('supabase.from("deals")');
    expect(onboardingHook).toContain('import_contacts: (deals.data ?? []).length > 0');
  });
});
