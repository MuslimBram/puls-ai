/**
 * PlatformDevelopers — /platform/developers
 *
 * Public marketing page for Pulse AI's Developer / API module.
 * Status: Coming Soon.
 * Canonical developers route. /developer redirects here.
 * Reuses PublicShell. No authenticated components.
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, Code2, Webhook, Zap } from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicCTA } from "@/components/public/PublicCTA";
import { Seo } from "@/components/Seo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  { key: "api",      icon: Code2 },
  { key: "webhooks", icon: Webhook },
  { key: "sdk",      icon: Zap },
  { key: "docs",     icon: BookOpen },
] as const;

export default function PlatformDevelopers() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <Seo
        title={t("platformDevelopers.seo.title")}
        description={t("platformDevelopers.seo.desc")}
      />

      <section className="py-20 px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <Badge variant="secondary" className="mb-4">{t("platform.status.comingSoon")}</Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t("platformDevelopers.hero.title")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("platformDevelopers.hero.desc")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PublicCTA variant="coming_soon" priority="primary" size="lg" />
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-semibold">
            {t("platformDevelopers.features.heading")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map(({ key, icon: Icon }) => (
              <Card key={key}>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <CardTitle className="text-base">
                    {t(`platformDevelopers.features.${key}.title`)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(`platformDevelopers.features.${key}.desc`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              to="/public-api"
              className="text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("platformDevelopers.apiLink")} →
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 text-center bg-muted/40">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold">{t("platformDevelopers.cta.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("platformDevelopers.cta.desc")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <PublicCTA variant="coming_soon" priority="primary" size="lg" />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
