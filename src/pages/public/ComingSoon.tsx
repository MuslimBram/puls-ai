/**
 * ComingSoon — generic Coming Soon page for held-back routes.
 *
 * Accepts a title and optional description.
 * Shows a Notify Me CTA using the COMING_SOON variant.
 */

import { useTranslation } from "react-i18next";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicPageContainer } from "@/components/public/PublicPageContainer";
import { PublicCTA } from "@/components/public/PublicCTA";
import { Clock } from "lucide-react";

interface ComingSoonProps {
  title?: string;
  description?: string;
}

export default function ComingSoon({ title, description }: ComingSoonProps) {
  const { t } = useTranslation();

  const displayTitle = title ?? t("comingSoon.title", { defaultValue: "Coming Soon" });
  const displayDesc =
    description ??
    t("comingSoon.description", {
      defaultValue:
        "We're working hard to bring this to you. Sign up to be notified when it launches.",
    });

  return (
    <PublicShell>
      <PublicPageContainer>
        <div className="flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>

          <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {displayTitle}
          </h1>
          <p className="mb-8 max-w-lg text-lg text-muted-foreground leading-relaxed">
            {displayDesc}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <PublicCTA variant="coming_soon" priority="primary" size="lg" />
            <PublicCTA
              variant="default"
              priority="secondary"
              size="lg"
              label={t("cta.backToHome", { defaultValue: "Back to Home" })}
              appDestination="/"
            />
          </div>
        </div>
      </PublicPageContainer>
    </PublicShell>
  );
}
