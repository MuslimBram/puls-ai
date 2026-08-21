/**
 * PublicFooter — marketing website footer for Pulse AI.
 *
 * Sections: Platform, Business, Company, Legal.
 * Shows trust badge and language selector.
 * Does NOT expose admin or authenticated-only routes.
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Separator } from "@/components/ui/separator";
import { TrustBadge } from "./TrustBadge";
import { PublicLanguageSelector } from "./PublicLanguageSelector";
import { cn } from "@/lib/utils";

const FOOTER_PLATFORM = [
  { labelKey: "nav.platform.aiIntelligence", href: "/platform/ai-intelligence" },
  { labelKey: "nav.platform.unifiedInbox",    href: "/platform/unified-inbox" },
  { labelKey: "nav.platform.crmSales",        href: "/platform/crm-sales" },
  { labelKey: "nav.platform.marketing",       href: "/platform/marketing" },
  { labelKey: "nav.platform.automation",      href: "/platform/automation" },
  { labelKey: "nav.platform.analytics",       href: "/platform/analytics" },
  { labelKey: "nav.platform.developers",      href: "/platform/developers" },
];

const FOOTER_BUSINESS = [
  { labelKey: "nav.standalone.pricing",       href: "/pricing" },
  { labelKey: "nav.business.whiteLabel",      href: "/white-label" },
  { labelKey: "nav.standalone.lidhjet",       href: "/lidhjet" },
];

const FOOTER_COMPANY = [
  { labelKey: "nav.standalone.security",      href: "/security" },
  { labelKey: "nav.company.about",            href: "/about",   comingSoon: true },
  { labelKey: "nav.company.contact",          href: "/contact", comingSoon: true },
];

const FOOTER_LEGAL = [
  { label: "Privacy Policy",   href: "/legal/privacy-policy" },
  { label: "Terms of Service", href: "/legal/terms-of-service" },
  { label: "Cookie Policy",    href: "/legal/cookie-policy" },
  { label: "DPA",              href: "/legal/dpa" },
];

export function PublicFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/30" aria-label={t("footer.label", { defaultValue: "Site footer" })}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Brand + tagline */}
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Link
              to="/"
              className="inline-block text-xl font-bold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            >
              Pulse <span className="text-primary">AI</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              {t("brand.descriptor", { defaultValue: "The AI Business Operating System" })}
            </p>
            <TrustBadge />
          </div>
          <PublicLanguageSelector />
        </div>

        {/* Link grid */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <FooterSection title={t("nav.group.platform")}>
            {FOOTER_PLATFORM.map((item) => (
              <FooterLink key={item.href} href={item.href} label={t(item.labelKey)} />
            ))}
          </FooterSection>

          <FooterSection title={t("nav.group.business")}>
            {FOOTER_BUSINESS.map((item) => (
              <FooterLink key={item.href} href={item.href} label={t(item.labelKey)} />
            ))}
          </FooterSection>

          <FooterSection title={t("nav.group.company")}>
            {FOOTER_COMPANY.map((item) => (
              <FooterLink
                key={item.href}
                href={item.href}
                label={t(item.labelKey)}
                muted={item.comingSoon}
              />
            ))}
          </FooterSection>

          <FooterSection title={t("footer.legal", { defaultValue: "Legal" })}>
            {FOOTER_LEGAL.map((item) => (
              <FooterLink key={item.href} href={item.href} label={item.label} />
            ))}
          </FooterSection>
        </div>

        <Separator className="my-8" />

        {/* Bottom bar */}
        <div className="flex flex-col gap-2 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <p>
            &copy; {year} Pulse AI. {t("footer.rightsReserved", { defaultValue: "All rights reserved." })}
          </p>
          <p>{t("footer.tagline", { defaultValue: "One intelligent system to run, automate and grow your business." })}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-foreground">
        {title}
      </p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  label,
  muted = false,
}: {
  href: string;
  label: string;
  muted?: boolean;
}) {
  return (
    <li>
      <Link
        to={href}
        className={cn(
          "text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm",
          muted
            ? "text-muted-foreground/60 cursor-default pointer-events-none"
            : "text-muted-foreground hover:text-foreground",
        )}
        tabIndex={muted ? -1 : undefined}
        aria-disabled={muted ? "true" : undefined}
      >
        {label}
      </Link>
    </li>
  );
}
