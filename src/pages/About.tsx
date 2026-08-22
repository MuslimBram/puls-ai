import { PublicShell } from "@/components/public/PublicShell";
import { PublicCTA } from "@/components/public/PublicCTA";
import {
  PublicPageContainer,
  PublicSection,
  PublicSectionHeader,
} from "@/components/public/PublicPageContainer";
import { Seo } from "@/components/Seo";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

export default function About() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <Seo
        title={`${t("nav.company.about")} — Pulse AI`}
        description={t("brand.positioning")}
      />

      <PublicPageContainer>
        <PublicSection className="pt-10">
          <PublicSectionHeader
            eyebrow={t("nav.company.about")}
            title={t("homepage.hero.title")}
            description={t("homepage.hero.description")}
          />

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="space-y-2 p-6">
                <h3 className="font-semibold text-foreground">{t("homepage.pillars.title")}</h3>
                <p className="text-sm text-muted-foreground">{t("homepage.pillars.description")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 p-6">
                <h3 className="font-semibold text-foreground">{t("homepage.flowSection.title")}</h3>
                <p className="text-sm text-muted-foreground">{t("homepage.flowSection.description")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 p-6">
                <h3 className="font-semibold text-foreground">{t("trust.dataControl")}</h3>
                <p className="text-sm text-muted-foreground">{t("trust.dataControlDesc")}</p>
              </CardContent>
            </Card>
          </div>
        </PublicSection>

        <PublicSection className="border-t border-border">
          <PublicSectionHeader
            eyebrow={t("homepage.finalCta.eyebrow")}
            title={t("homepage.finalCta.title")}
            description={t("homepage.finalCta.description")}
          />

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>{t("homepage.finalCta.pointOne")}</p>
            <p>{t("homepage.finalCta.pointTwo")}</p>
            <p>{t("homepage.finalCta.pointThree")}</p>
          </div>

          <div className="mt-6">
            <PublicCTA
              size="lg"
              className="min-w-[200px]"
              appDestination="/dashboard"
              label={t("homepage.finalCta.primaryCta")}
            />
          </div>
        </PublicSection>
      </PublicPageContainer>
    </PublicShell>
  );
}
