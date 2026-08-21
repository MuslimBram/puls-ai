/**
 * PublicDevelopers — public Developers page.
 *
 * Canonical route: /platform/developers
 * DO NOT use /developer (not canonical).
 */

import { Code2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicPageContainer, PublicSection, PublicSectionHeader } from "@/components/public/PublicPageContainer";
import { PublicCTA } from "@/components/public/PublicCTA";
import { FAQAccordion } from "@/components/public/FAQAccordion";

const DEV_FAQ_EN = [
  {
    id: "api-access",
    question: "How do I get API access?",
    answer:
      "Register for a Pulse AI account and navigate to the Developers section. API keys are available on all plans.",
  },
  {
    id: "webhooks",
    question: "Does Pulse AI support webhooks?",
    answer:
      "Yes. You can configure webhooks for events such as new leads, conversation updates, and automation completions.",
  },
  {
    id: "rate-limits",
    question: "What are the rate limits?",
    answer:
      "Rate limits vary by plan. Documentation is available once you have an API key. We offer generous limits for production use cases.",
  },
];

export default function PublicDevelopers() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <PublicPageContainer>
        {/* Hero */}
        <PublicSection className="pb-12 pt-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Code2 className="h-8 w-8 text-primary" aria-hidden="true" />
            </div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">
              {t("brand.descriptor", { defaultValue: "The AI Business Operating System" })}
            </p>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {t("developers.title", { defaultValue: "Developers" })}
            </h1>
            <p className="mb-8 text-lg text-muted-foreground leading-relaxed">
              {t("developers.description", {
                defaultValue:
                  "Build on top of Pulse AI. Our API lets you integrate your existing tools, automate workflows, and extend the platform to fit your exact needs.",
              })}
            </p>
            <PublicCTA
              priority="primary"
              size="lg"
              label={t("developers.getApiAccess", { defaultValue: "Get API Access" })}
              appDestination="/connections-hub"
            />
          </div>
        </PublicSection>

        {/* FAQ */}
        <PublicSection className="pt-0">
          <div className="mx-auto max-w-2xl">
            <PublicSectionHeader
              title={t("developers.faqTitle", { defaultValue: "Common Questions" })}
              centered
            />
            <FAQAccordion items={DEV_FAQ_EN} />
          </div>
        </PublicSection>
      </PublicPageContainer>
    </PublicShell>
  );
}
