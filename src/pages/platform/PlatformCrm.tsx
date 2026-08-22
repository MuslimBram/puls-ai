/**
 * PlatformCrm — /platform/crm
 *
 * Public marketing page for Pulse AI's CRM & Sales module.
 * Reuses PublicShell. No authenticated components.
 */

import { useTranslation } from "react-i18next";
import { CheckCircle2, Users, Workflow, Zap } from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicCTA } from "@/components/public/PublicCTA";
import { Seo } from "@/components/Seo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  { key: "contacts",      icon: Users },
  { key: "pipeline",      icon: Zap },
  { key: "qualification", icon: CheckCircle2 },
  { key: "followUp",      icon: Workflow },
] as const;

export default function PlatformCrm() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <Seo
        title={t("platformCrm.seo.title")}
        description={t("platformCrm.seo.desc")}
      />

      <section className="py-20 px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <Badge className="mb-4">{t("platform.status.live")}</Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t("platformCrm.hero.title")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("platformCrm.hero.desc")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PublicCTA priority="primary" size="lg" appDestination="/crm" />
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-semibold">
            {t("platformCrm.features.heading")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map(({ key, icon: Icon }) => (
              <Card key={key}>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <CardTitle className="text-base">
                    {t(`platformCrm.features.${key}.title`)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(`platformCrm.features.${key}.desc`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 text-center bg-muted/40">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold">{t("platformCrm.cta.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("platformCrm.cta.desc")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <PublicCTA priority="primary" size="lg" appDestination="/crm" />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
