/**
 * PlatformHub — /platform
 *
 * Public landing page for the Pulse AI Platform module catalogue.
 * Reuses PublicShell. No authenticated components.
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BrainCircuit,
  ChartColumn,
  Code2,
  GitBranch,
  Handshake,
  MessageSquare,
  Users,
  Workflow,
  Network,
} from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicCTA } from "@/components/public/PublicCTA";
import { Seo } from "@/components/Seo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PLATFORM_MODULES = [
  {
    slug: "ai",
    icon: BrainCircuit,
    statusKey: "platform.status.live" as const,
    status: "live" as const,
  },
  {
    slug: "unified-inbox",
    icon: MessageSquare,
    statusKey: "platform.status.live" as const,
    status: "live" as const,
  },
  {
    slug: "crm",
    icon: Users,
    statusKey: "platform.status.live" as const,
    status: "live" as const,
  },
  {
    slug: "marketing",
    icon: GitBranch,
    statusKey: "platform.status.live" as const,
    status: "live" as const,
  },
  {
    slug: "automation",
    icon: Workflow,
    statusKey: "platform.status.live" as const,
    status: "live" as const,
  },
  {
    slug: "analytics",
    icon: ChartColumn,
    statusKey: "platform.status.live" as const,
    status: "live" as const,
  },
  {
    slug: "developers",
    icon: Code2,
    statusKey: "platform.status.comingSoon" as const,
    status: "coming_soon" as const,
  },
  {
    slug: "partners",
    icon: Handshake,
    statusKey: "platform.status.comingSoon" as const,
    status: "coming_soon" as const,
  },
  {
    slug: "lidhjet",
    icon: Network,
    statusKey: "platform.status.comingSoon" as const,
    status: "coming_soon" as const,
  },
] as const;

const statusBadgeVariant = {
  live: "default",
  coming_soon: "secondary",
  beta: "outline",
} as const;

export default function PlatformHub() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <Seo
        title={t("platformHub.seo.title")}
        description={t("platformHub.seo.desc")}
      />

      {/* Hero */}
      <section className="py-20 px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t("platformHub.hero.title")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("platformHub.hero.desc")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PublicCTA priority="primary" size="lg" appDestination="/dashboard" />
          </div>
        </div>
      </section>

      {/* Module grid */}
      <section className="py-16 px-4">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-10 text-center text-2xl font-semibold">
            {t("platformHub.modules.heading")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORM_MODULES.map(({ slug, icon: Icon, statusKey, status }) => (
              <Card
                key={slug}
                className="group relative transition-shadow hover:shadow-md"
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    <CardTitle className="text-base">
                      {t(`platformHub.modules.${slug}.title`)}
                    </CardTitle>
                  </div>
                  <Badge variant={statusBadgeVariant[status]}>
                    {t(statusKey)}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(`platformHub.modules.${slug}.desc`)}
                  </p>
                  <Link
                    to={`/platform/${slug}`}
                    className="mt-4 inline-block text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("platformHub.modules.learnMoreLabel", {
                      module: t(`platformHub.modules.${slug}.title`),
                    })}
                  >
                    {t("platformHub.modules.learnMore")} →
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 px-4 text-center bg-muted/40">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold">{t("platformHub.cta.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("platformHub.cta.desc")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <PublicCTA priority="primary" size="lg" appDestination="/dashboard" />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
