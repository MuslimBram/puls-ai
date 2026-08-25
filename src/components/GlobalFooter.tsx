import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export const GlobalFooter = () => {
  const { t } = useTranslation();
  const location = useLocation();

  // Don't show footer on OAuth/callback pages or other special pages
  const hideFooterPaths = ["/.lovable/oauth/consent", "/auth/callback"];
  const shouldHideFooter = hideFooterPaths.some((path) =>
    location.pathname.startsWith(path)
  );

  if (shouldHideFooter) {
    return null;
  }

  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={cn(
        "border-t border-border/50 bg-background/50 backdrop-blur-sm mt-auto",
        "py-4 px-4 sm:px-6 lg:px-8",
        "text-sm text-muted-foreground"
      )}
    >
      <div className="max-w-7xl mx-auto">
        {/* Desktop Layout - Three Columns */}
        <div className="hidden sm:grid sm:grid-cols-3 sm:gap-8 sm:items-center">
          {/* Left: Logo & Copyright */}
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <span className="font-semibold text-foreground">Pulse AI</span>
            </div>
            <span className="text-xs">© {currentYear} {t("footer.rightsReserved")}</span>
          </div>

          {/* Center: Legal Links */}
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              to="/privacy"
              className="hover:text-foreground transition-colors"
              title={t("footer.links.privacy")}
            >
              {t("footer.links.privacy")}
            </Link>
            <span className="text-border/30">/</span>
            <Link
              to="/terms"
              className="hover:text-foreground transition-colors"
              title={t("footer.links.terms")}
            >
              {t("footer.links.terms")}
            </Link>
            <span className="text-border/30">/</span>
            <Link
              to="/cookies"
              className="hover:text-foreground transition-colors"
              title={t("footer.links.cookies")}
            >
              {t("footer.links.cookies")}
            </Link>
            <span className="text-border/30">/</span>
            <Link
              to="/security"
              className="hover:text-foreground transition-colors"
              title={t("footer.links.security")}
            >
              {t("footer.links.security")}
            </Link>
          </div>

          {/* Right: Tagline */}
          <div className="text-right text-xs text-muted-foreground">
            {t("footer.tagline")}
          </div>
        </div>

        {/* Mobile Layout - Stacked */}
        <div className="sm:hidden space-y-3">
          {/* Row 1: Logo & Copyright */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">Pulse AI</span>
            <span className="text-xs">© {currentYear} {t("footer.rightsReserved")}</span>
          </div>

          {/* Row 2: Legal Links */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              to="/privacy"
              className="hover:text-foreground transition-colors"
              title={t("footer.links.privacy")}
            >
              {t("footer.links.privacy")}
            </Link>
            <span className="text-border/30">·</span>
            <Link
              to="/terms"
              className="hover:text-foreground transition-colors"
              title={t("footer.links.terms")}
            >
              {t("footer.links.terms")}
            </Link>
            <span className="text-border/30">·</span>
            <Link
              to="/cookies"
              className="hover:text-foreground transition-colors"
              title={t("footer.links.cookies")}
            >
              {t("footer.links.cookies")}
            </Link>
            <span className="text-border/30">·</span>
            <Link
              to="/security"
              className="hover:text-foreground transition-colors"
              title={t("footer.links.security")}
            >
              {t("footer.links.security")}
            </Link>
          </div>

          {/* Row 3: Tagline (optional on mobile) */}
          <div className="text-xs text-muted-foreground leading-tight">
            {t("footer.tagline")}
          </div>
        </div>
      </div>
    </footer>
  );
};
