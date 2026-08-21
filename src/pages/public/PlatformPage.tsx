/**
 * PlatformPage — reusable public platform feature page.
 *
 * Used for:
 *   /platform/ai
 *   /platform/unified-inbox
 *   /platform/crm
 *   /platform/marketing
 *   /platform/automation
 *   /platform/analytics
 *
 * Wave 1: renders a structured shell with title, description, and CTA.
 * Full content authored per-page in Wave 2+.
 */

import { useTranslation } from "react-i18next";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicPageContainer, PublicSection, PublicSectionHeader } from "@/components/public/PublicPageContainer";
import { PublicCTAPair } from "@/components/public/PublicCTA";
import { TrustBadge } from "@/components/public/TrustBadge";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface PlatformPageConfig {
  /** Page title (EN) */
  title: string;
  /** One-line subtitle */
  subtitle: string;
  /** Short description paragraph */
  description: string;
  /** Lucide icon for the hero */
  Icon: LucideIcon;
  /** Destination inside the app (validated internal path) */
  appDestination: string;
  /** Feature bullet points */
  features?: string[];
  /** Optional accent class on icon bg */
  iconClassName?: string;
}

interface PlatformPageProps {
  config: PlatformPageConfig;
}

export default function PlatformPage({ config }: PlatformPageProps) {
  const { t } = useTranslation();
  const { title, subtitle, description, Icon, appDestination, features, iconClassName } = config;

  return (
    <PublicShell>
      <PublicPageContainer>
        {/* Hero section */}
        <PublicSection className="pb-12 pt-12">
          <div className="mx-auto max-w-3xl text-center">
            {/* Icon */}
            <div className={cn(
              "mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10",
              iconClassName,
            )}>
              <Icon className="h-8 w-8 text-primary" aria-hidden="true" />
            </div>

            {/* Eyebrow */}
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">
              {t("brand.descriptor", { defaultValue: "The AI Business Operating System" })}
            </p>

            {/* Title */}
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {title}
            </h1>

            {/* Subtitle */}
            <p className="mb-3 text-xl font-medium text-muted-foreground">{subtitle}</p>

            {/* Description */}
            <p className="mb-8 text-lg text-muted-foreground leading-relaxed">{description}</p>

            {/* CTA pair */}
            <PublicCTAPair
              className="justify-center"
              appDestination={appDestination}
              secondaryHref="/"
              secondaryLabel={t("cta.learnMore")}
            />

            <div className="mt-6 flex justify-center">
              <TrustBadge />
            </div>
          </div>
        </PublicSection>

        {/* Features section */}
        {features && features.length > 0 && (
          <PublicSection className="pt-4">
            <div className="mx-auto max-w-4xl">
              <PublicSectionHeader
                eyebrow={t("platform.capabilities", { defaultValue: "Capabilities" })}
                title={t("platform.whatYouGet", { defaultValue: "What you get" })}
                centered
              />
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground shadow-sm"
                  >
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </PublicSection>
        )}
      </PublicPageContainer>
    </PublicShell>
  );
}
