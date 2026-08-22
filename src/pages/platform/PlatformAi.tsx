/**
 * PlatformAi — /platform/ai
 *
 * Public marketing page for Pulse AI's AI & Intelligence module.
 * Reuses PublicShell. No authenticated components.
 */

import { useTranslation } from "react-i18next";
import { BrainCircuit, GitBranch, MessageSquare, Users } from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicCTA } from "@/components/public/PublicCTA";
import { Seo } from "@/components/Seo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CAPABILITIES = [
  { key: "intentDetection", icon: BrainCircuit },
  { key: "smartRouting",    icon: GitBranch },
  { key: "multiChannel",    icon: MessageSquare },
  { key: "humanHandoff",    icon: Users },
] as const;

export default function PlatformAi() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <Seo
        title={t("platformAi.seo.title")}
        description={t("platformAi.seo.desc")}
      />

      <section className="py-20 px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <Badge className="mb-4">{t("platform.status.live")}</Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t("platformAi.hero.title")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("platformAi.hero.desc")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PublicCTA priority="primary" size="lg" appDestination="/dashboard" />
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-semibold">
            {t("platformAi.capabilities.heading")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {CAPABILITIES.map(({ key, icon: Icon }) => (
              <Card key={key}>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <CardTitle className="text-base">
                    {t(`platformAi.capabilities.${key}.title`)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(`platformAi.capabilities.${key}.desc`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 text-center bg-muted/40">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold">{t("platformAi.cta.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("platformAi.cta.desc")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <PublicCTA priority="primary" size="lg" appDestination="/dashboard" />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
