/**
 * PublicHeader — sticky top header for the Pulse AI public website.
 *
 * Contains: brand logo, desktop mega nav, standalone CTA, language selector,
 * and mobile hamburger.
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PublicMegaNav } from "./PublicMegaNav";
import { PublicMobileNav } from "./PublicMobileNav";
import { PublicCTA } from "./PublicCTA";
import { PublicLanguageSelector } from "./PublicLanguageSelector";
import { usePublicLocale } from "@/hooks/usePublicLocale";

interface PublicHeaderProps {
  /** Extra class on the <header> element */
  className?: string;
}

export function PublicHeader({ className }: PublicHeaderProps) {
  const { t } = useTranslation();
  const { localizedPath } = usePublicLocale();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full",
        "border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          to={localizedPath("/")}
          className="mr-4 flex shrink-0 items-center gap-1 text-lg font-bold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          aria-label={t("brand.home", { defaultValue: "Pulse AI — Home" })}
        >
          Pulse <span className="text-primary">AI</span>
        </Link>

        {/* Desktop nav — hidden on mobile */}
        <PublicMegaNav />

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          <PublicLanguageSelector />

          {/* Desktop CTA */}
          <div className="hidden sm:flex items-center gap-2">
            <PublicCTA
              priority="secondary"
              size="sm"
              label={t("cta.login")}
              appDestination="/dashboard"
            />
            <PublicCTA
              priority="primary"
              size="sm"
              appDestination="/dashboard"
            />
          </div>

          {/* Mobile nav — visible on mobile only */}
          <PublicMobileNav />
        </div>
      </div>
    </header>
  );
}
