import { PublicLeadForm } from "@/components/leads/PublicLeadForm";
import { PublicShell } from "@/components/public/PublicShell";
import {
  PublicPageContainer,
  PublicSection,
  PublicSectionHeader,
} from "@/components/public/PublicPageContainer";
import { Seo } from "@/components/Seo";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

export default function Contact() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <Seo
        title={`${t("nav.company.contact")} — Pulse AI`}
        description={t("homepage.leadForm.subtitle")}
      />

      <PublicPageContainer>
        <PublicSection className="pt-10">
          <PublicSectionHeader
            eyebrow={t("nav.company.contact")}
            title={t("homepage.leadForm.title")}
            description={t("homepage.leadForm.subtitle")}
          />

          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardContent className="space-y-4 p-6">
                <h2 className="text-xl font-semibold text-foreground">
                  {t("homepage.finalCta.title")}
                </h2>
                <p className="text-sm text-muted-foreground">{t("homepage.finalCta.pointTwo")}</p>
                <p className="text-sm text-muted-foreground">
                  <a className="underline underline-offset-4" href="mailto:info@mso.re">
                    info@mso.re
                  </a>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <PublicLeadForm
                  source="contact"
                  showPlanSelect={false}
                  title={t("homepage.leadForm.title")}
                  subtitle={t("homepage.leadForm.subtitle")}
                />
              </CardContent>
            </Card>
          </div>
        </PublicSection>
      </PublicPageContainer>
    </PublicShell>
  );
}
