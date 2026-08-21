/**
 * PublicPricing — neutral public pricing shell.
 *
 * Wave 1: neutral state only.
 * NO hardcoded prices.
 * NO stale migration prices.
 * NO invented numbers.
 *
 * Canonical numeric pricing source: public.pricing_settings (DB).
 * Numeric pricing is NOT shown until verified.
 *
 * Route: /pricing (public shell)
 * Authenticated users → see subscription management at /subscription
 */

import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicPageContainer, PublicSection, PublicSectionHeader } from "@/components/public/PublicPageContainer";
import { PublicCTA } from "@/components/public/PublicCTA";
import { FAQAccordion, type FAQItem } from "@/components/public/FAQAccordion";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

const PRICING_FAQ_EN: FAQItem[] = [
  {
    id: "free-trial",
    question: "Is there a free trial?",
    answer:
      "Yes. You can start with a trial period to explore Pulse AI before committing. No credit card required to start.",
  },
  {
    id: "cancel",
    question: "Can I cancel at any time?",
    answer:
      "Yes. You can cancel your subscription at any time from your account settings. There are no long-term contracts.",
  },
  {
    id: "billing",
    question: "How does billing work?",
    answer:
      "Pulse AI offers monthly and annual billing options. Full pricing details are available after registration.",
  },
  {
    id: "enterprise",
    question: "Do you offer custom enterprise pricing?",
    answer:
      "Yes. For teams with specific requirements or scale, contact us to discuss a custom arrangement.",
  },
];

const PRICING_FAQ_SQ: FAQItem[] = [
  {
    id: "free-trial",
    question: "A ka periudhë prove falas?",
    answer:
      "Po. Mund të filloni me një periudhë prove për të eksploruar Pulse AI para se të angazhoheni. Nuk kërkohet kartë krediti për të filluar.",
  },
  {
    id: "cancel",
    question: "A mund të anuloj në çdo kohë?",
    answer:
      "Po. Mund të anuloni abonimin tuaj në çdo kohë nga cilësimet e llogarisë. Nuk ka kontrata afatgjata.",
  },
  {
    id: "billing",
    question: "Si funksionon faturimi?",
    answer:
      "Pulse AI ofron opsione faturimi mujor dhe vjetor. Detajet e plota të çmimeve janë të disponueshme pas regjistrimit.",
  },
  {
    id: "enterprise",
    question: "A ofroni çmime të personalizuara për ndërmarrjet?",
    answer:
      "Po. Për ekipet me kërkesa ose shkallë specifike, na kontaktoni për të diskutuar një marrëveshje të personalizuar.",
  },
];

export default function PublicPricing() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const faqItems = i18n.language === "sq" ? PRICING_FAQ_SQ : PRICING_FAQ_EN;

  return (
    <PublicShell>
      <PublicPageContainer>
        {/* Hero */}
        <PublicSection className="pb-12 pt-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" aria-hidden="true" />
            </div>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {t("pricing.title", { defaultValue: "Simple, Transparent Pricing" })}
            </h1>
            <p className="mb-8 text-lg text-muted-foreground leading-relaxed">
              {t("pricing.subtitle", {
                defaultValue:
                  "Start free, scale as you grow. Full pricing details are available inside your account.",
              })}
            </p>

            {/* Auth-aware CTA */}
            {user ? (
              <div className="flex flex-wrap justify-center gap-3">
                <PublicCTA
                  priority="primary"
                  size="lg"
                  label={t("pricing.viewPlans", { defaultValue: "View My Plans" })}
                  appDestination="/subscription"
                />
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-3">
                <PublicCTA
                  priority="primary"
                  size="lg"
                  label={t("cta.getStarted")}
                  appDestination="/subscription"
                />
                <PublicCTA
                  priority="secondary"
                  size="lg"
                  label={t("auth.signIn")}
                  appDestination="/subscription"
                />
              </div>
            )}
          </div>
        </PublicSection>

        {/* Neutral pricing notice */}
        <div className="mx-auto max-w-2xl rounded-xl border border-border/60 bg-muted/40 p-6 text-center text-sm text-muted-foreground mb-12">
          {t("pricing.neutralNotice", {
            defaultValue:
              "Detailed plan pricing is displayed inside your account dashboard after sign-up, drawn live from our pricing settings.",
          })}
          {!user && (
            <p className="mt-2">
              {t("pricing.signUpToSee", { defaultValue: "Already have an account?" })}{" "}
              <Link to="/login?returnTo=/subscription" className="text-primary underline-offset-4 hover:underline">
                {t("auth.signIn")}
              </Link>
            </p>
          )}
        </div>

        {/* FAQ */}
        <PublicSection className="pt-0 pb-16">
          <div className="mx-auto max-w-2xl">
            <PublicSectionHeader
              title={t("pricing.faqTitle", { defaultValue: "Pricing FAQ" })}
              centered
            />
            <FAQAccordion items={faqItems} />
          </div>
        </PublicSection>
      </PublicPageContainer>
    </PublicShell>
  );
}
