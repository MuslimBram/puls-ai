import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const onboardingHook = readFileSync(resolve(process.cwd(), "src/hooks/useOnboardingProgress.ts"), "utf8");
const knowledgePage = readFileSync(resolve(process.cwd(), "src/pages/KnowledgeBase.tsx"), "utf8");
const knowledgeHook = readFileSync(resolve(process.cwd(), "src/hooks/useKnowledgeBase.ts"), "utf8");

describe("Onboarding knowledge product truth", () => {
  it("describes the implemented Knowledge Base source flow instead of documents only", () => {
    expect(onboardingHook).toContain('key: "upload_knowledge", label: "Add Knowledge Source"');
    expect(onboardingHook).toContain("Add a website or document to your AI knowledge base");
    expect(onboardingHook).not.toContain('label: "Upload Knowledge Base"');
  });

  it("keeps completion evidence tied to real knowledge_sources rows", () => {
    expect(onboardingHook).toContain('supabase.from("knowledge_sources").select("id")');
    expect(onboardingHook).toContain("upload_knowledge: (knowledge.data ?? []).length > 0");
  });

  it("routes users to real website ingestion and document upload capabilities", () => {
    expect(knowledgePage).toContain("Crawl Website");
    expect(knowledgePage).toContain("Upload Document");
    expect(knowledgeHook).toContain('supabase.functions.invoke("ingest-website"');
    expect(knowledgeHook).toContain('supabase.functions.invoke("ingest-document"');
  });
});
