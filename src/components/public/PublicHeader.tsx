/**
 * PublicHeader — the single compact header for Pulse AI public pages.
 *
 * Navigation, language, history controls and theme all live in this row.
 */

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Home, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PublicMegaNav } from "./PublicMegaNav";
import { PublicMobileNav } from "./PublicMobileNav";
import { PublicCTA } from "./PublicCTA";
import { PublicLanguageSelector } from "./PublicLanguageSelector";
import { usePublicLocale } from "@/hooks/usePublicLocale";

interface PublicHeaderProps {
  className?: string;
}

export function PublicHeader({ className }: PublicHeaderProps) {
  const { t } = useTranslation();
  const { localizedPath } = usePublicLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("theme", nextDark ? "dark" : "light");
    setIsDark(nextDark);
  };

  const controlClass = "h-9 w-9 shrink-0 p-0";

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full",
        "border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-6 lg:px-8">
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label={t("common.navigation", { defaultValue: "Page controls" })}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={controlClass}
            onClick={() => navigate(-1)}
            title={t("common.back")}
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={controlClass}
            onClick={() => navigate(1)}
            title={t("common.forward")}
            aria-label={t("common.forward")}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={controlClass}
            onClick={() => navigate(localizedPath("/"))}
            title={t("common.home")}
            aria-label={t("common.home")}
          >
            <Home className="h-4 w-4" />
          </Button>
        </nav>

        <Link
          to={localizedPath("/")}
          className="mr-2 flex shrink-0 items-center gap-1 rounded-sm text-lg font-bold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t("brand.home", { defaultValue: "Pulse AI — Home" })}
        >
          Pulse <span className="text-primary">AI</span>
        </Link>

        <PublicMegaNav />

        <div className="ml-auto flex items-center gap-1">
          <PublicLanguageSelector />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={controlClass}
            onClick={toggleTheme}
            title={isDark ? t("common.lightMode") : t("common.darkMode")}
            aria-label={isDark ? t("common.lightMode") : t("common.darkMode")}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <div className="hidden items-center gap-2 sm:flex">
            <PublicCTA
              priority="secondary"
              size="sm"
              label={t("cta.login")}
              appDestination="/dashboard"
            />
            <PublicCTA priority="primary" size="sm" appDestination="/dashboard" />
          </div>

          <PublicMobileNav />
        </div>
      </div>
      <span className="sr-only" aria-live="polite">{location.pathname}</span>
    </header>
  );
}
