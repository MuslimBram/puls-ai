import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const mainLinks = [
  { key: "nav.standalone.lidhjet", href: "/lidhjet-public" },
  { key: "nav.standalone.pricing", href: "/pricing" },
  { key: "nav.standalone.security", href: "/security" },
  { key: "nav.company.about", href: "/about" },
  { key: "nav.business.whiteLabel", href: "/white-label" },
  { key: "nav.company.contact", href: "/contact" },
] as const;

// Pa përsëritje: Siguria dhe Kontakti janë te lidhjet kryesore.
const legalLinks = [
  { key: "footer.links.privacy", href: "/privacy" },
  { key: "footer.links.terms", href: "/terms" },
  { key: "footer.links.cookies", href: "/cookies" },
  { key: "footerWave4.termsAndPayments", href: "/terms-and-payments" },
  { key: "footerWave4.refund", href: "/refund" },
  { key: "footerWave4.affiliateTerms", href: "/affiliate-terms" },
  { key: "footer.links.dpa", href: "/dpa" },
] as const;

export const GlobalFooter = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const hiddenPaths = ["/.lovable/oauth/consent", "/auth/callback"];
  if (hiddenPaths.some((path) => location.pathname.startsWith(path))) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const linkClass = "transition-colors hover:text-foreground";

  return (
    <footer
      className={cn(
        "mt-auto border-t border-border/60 bg-background/80 px-4 py-8 backdrop-blur-sm sm:px-6 lg:px-8",
        "text-sm text-muted-foreground",
      )}
    >
      <div className="mx-auto max-w-7xl">
        <div className="hidden gap-6 sm:grid sm:grid-cols-[minmax(220px,1fr)_2fr] sm:items-start">
          <div>
            <Link to="/" className="text-base font-semibold text-foreground transition-colors hover:text-foreground" title="Pulse AI">
              Pulse AI
            </Link>
            <p className="mt-2 max-w-sm text-sm leading-6">
              {t("footer.tagline", {
                defaultValue: "One intelligent system to run, automate and grow your business.",
              })}
            </p>
          </div>

          <div className="flex flex-col items-end gap-5">
            <nav className="flex flex-wrap justify-end gap-x-5 gap-y-2" aria-label="Footer navigation">
              {mainLinks.map((link) => (
                <Link key={link.href} to={link.href} className={linkClass} title={t(link.key)}>
                  {t(link.key)}
                </Link>
              ))}
            </nav>
            <nav className="flex flex-wrap justify-end gap-x-4 gap-y-2 text-xs" aria-label="Legal">
              {legalLinks.map((link) => (
                <Link key={link.href} to={link.href} className={linkClass} title={t(link.key)}>
                  {t(link.key)}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="space-y-5 sm:hidden">
          <div>
            <Link to="/" className="text-base font-semibold text-foreground transition-colors hover:text-foreground" title="Pulse AI">
              Pulse AI
            </Link>
            <p className="mt-2 text-sm leading-6">
              {t("footer.tagline", {
                defaultValue: "One intelligent system to run, automate and grow your business.",
              })}
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Footer navigation">
            {mainLinks.map((link) => (
              <Link key={link.href} to={link.href} className={linkClass} title={t(link.key)}>
                {t(link.key)}
              </Link>
            ))}
          </nav>
          <nav className="flex flex-wrap gap-x-3 gap-y-2 text-xs" aria-label="Legal">
            {legalLinks.map((link) => (
              <Link key={link.href} to={link.href} className={linkClass} title={t(link.key)}>
                {t(link.key)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-6 border-t border-border/50 pt-4 text-xs">
          © {currentYear} Pulse AI. {t("footer.rightsReserved")}
        </div>
      </div>
    </footer>
  );
};
