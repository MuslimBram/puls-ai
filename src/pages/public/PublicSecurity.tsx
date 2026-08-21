/**
 * PublicSecurity — public security overview page.
 *
 * Uses the centralized SECURITY_CLAIM from publicSecurityClaim.ts.
 * Never claims certifications not held.
 * Route: /security
 */

import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicPageContainer, PublicSection, PublicSectionHeader } from "@/components/public/PublicPageContainer";
import { PublicCTAPair } from "@/components/public/PublicCTA";
import { SECURITY_CLAIM } from "@/lib/publicSecurityClaim";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PublicSecurity() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <PublicPageContainer>
        {/* Hero */}
        <PublicSection className="pb-12 pt-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
            </div>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {t("security.title", { defaultValue: SECURITY_CLAIM.headline })}
            </h1>
            <p className="mb-8 text-lg text-muted-foreground leading-relaxed">
              {t("security.summary", { defaultValue: SECURITY_CLAIM.summary })}
            </p>
            <PublicCTAPair appDestination="/dashboard" />
          </div>
        </PublicSection>

        {/* Security points */}
        <PublicSection className="pt-4">
          <div className="mx-auto max-w-3xl">
            <PublicSectionHeader
              eyebrow={t("security.eyebrow", { defaultValue: "Our Controls" })}
              title={t("security.pointsTitle", { defaultValue: "How we protect your business" })}
              centered
            />
            <ul className="grid gap-4 sm:grid-cols-2">
              {SECURITY_CLAIM.points.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-5 shadow-sm"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </PublicSection>

        {/* Disclaimer */}
        <PublicSection className="pt-0 pb-12">
          <div className="mx-auto max-w-3xl">
            <Alert>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
                {SECURITY_CLAIM.disclaimer}
              </AlertDescription>
            </Alert>
          </div>
        </PublicSection>
      </PublicPageContainer>
    </PublicShell>
  );
}
