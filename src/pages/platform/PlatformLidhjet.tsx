/**
 * PlatformLidhjet — /platform/lidhjet
 *
 * Public marketing page for Lidhjet — community connections for
 * Albanian-speaking businesses on Pulse AI.
 * Status: Coming Soon.
 * Reuses PublicShell. No authenticated components.
 */

import { useTranslation } from "react-i18next";
import { MessageSquare, Network, Users } from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicCTA } from "@/components/public/PublicCTA";
import { Seo } from "@/components/Seo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  { key: "feed",          icon: MessageSquare },
  { key: "interests",     icon: Network },
  { key: "collaboration", icon: Users },
] as const;

export default function PlatformLidhjet() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <Seo
        title={t("platformLidhjet.seo.title")}
        description={t("platformLidhjet.seo.desc")}
      />

      <section className="py-20 px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <Badge variant="secondary" className="mb-4">{t("platform.status.comingSoon")}</Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t("platformLidhjet.hero.title")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("platformLidhjet.hero.desc")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PublicCTA variant="coming_soon" priority="primary" size="lg" />
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-semibold">
            {t("platformLidhjet.features.heading")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon }) => (
              <Card key={key}>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <CardTitle className="text-base">
                    {t(`platformLidhjet.features.${key}.title`)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(`platformLidhjet.features.${key}.desc`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 text-center bg-muted/40">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold">{t("platformLidhjet.cta.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("platformLidhjet.cta.desc")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <PublicCTA variant="coming_soon" priority="primary" size="lg" />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
