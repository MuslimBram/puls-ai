import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Download, Zap, Mail, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePublicLocale } from "@/hooks/usePublicLocale";
import { Seo } from "@/components/Seo";

export const LEGAL_LAST_UPDATED = "31 July 2026";
export const LEGAL_LAST_UPDATED_SQ = "31 korrik 2026";

export const LEGAL_LINKS: { href: string; labelKey: string }[] = [
  { href: "/privacy", labelKey: "footer.links.privacy" },
  { href: "/terms", labelKey: "footer.links.terms" },
  { href: "/security", labelKey: "securityPage.hero.title" },
  { href: "/cookies", labelKey: "footer.links.cookies" },
  { href: "/refund", labelKey: "footerWave4.refund" },
  { href: "/affiliate-terms", labelKey: "footerWave4.affiliateTerms" },
  { href: "/dpa", labelKey: "footer.links.dpa" },
  { href: "/terms-and-payments", labelKey: "footerWave4.termsAndPayments" },
];

export type LegalSection = { id: string; title: string };

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  description: string;
  path: string;
  sections: LegalSection[];
  children: ReactNode;
}

const configuredPublicSite = import.meta.env.VITE_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "https://kohablerjeve.top";
const configuredPublicHost = (() => {
  try {
    return new URL(configuredPublicSite).hostname;
  } catch {
    return "kohablerjeve.top";
  }
})();

export function LegalLayout({
  title,
  subtitle,
  description,
  path,
  sections,
  children,
}: LegalLayoutProps) {
  const { t } = useTranslation();
  const { locale, localizedPath } = usePublicLocale();
  const isSq = locale === "sq";
  const copy = isSq
    ? {
        legal: "Ligjore",
        lastUpdated: "Përditësuar së fundi",
        updatedDate: LEGAL_LAST_UPDATED_SQ,
        downloadPdf: "Shkarko PDF",
        onThisPage: "Në këtë faqe",
        needHelp: "Keni nevojë për ndihmë?",
        helpBody: "Ekipi ynë u përgjigjet pyetjeve për këtë dokument brenda dy ditëve pune.",
        otherDocuments: "Dokumente të tjera",
        disclaimer:
          "Ky dokument ofrohet vetëm për qëllime informuese dhe nuk përbën këshillë juridike. Për interpretim detyrues, konsultohuni me një jurist të licencuar në juridiksionin tuaj.",
        legalTrust: "Ligjore & Besim",
      }
    : {
        legal: "Legal",
        lastUpdated: "Last updated",
        updatedDate: LEGAL_LAST_UPDATED,
        downloadPdf: "Download PDF",
        onThisPage: "On this page",
        needHelp: "Need help?",
        helpBody: "Our team answers questions about this document within two business days.",
        otherDocuments: "Other documents",
        disclaimer:
          "This document is provided for information purposes and does not constitute legal advice. For binding interpretation, consult a licensed lawyer in your jurisdiction.",
        legalTrust: "Legal & Trust",
      };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title={`${title} | Pulse AI`} description={description} type="article" />

      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur print:hidden">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to={localizedPath("/")} className="flex items-center gap-2 font-semibold">
            <Zap className="h-5 w-5 text-primary" />
            Pulse AI
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm text-muted-foreground">
            <Link to={localizedPath("/pricing")} className="hover:text-foreground">{t("nav.standalone.pricing")}</Link>
            <Link to={localizedPath("/white-label")} className="hover:text-foreground">{t("nav.business.whiteLabel")}</Link>
            <Link to="/login" className="hover:text-foreground">{t("cta.login")}</Link>
            <Button size="sm" asChild>
              <Link to="/register">{t("cta.getStarted")}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="border-b border-border bg-muted/40">
        <div className="max-w-6xl mx-auto px-5 py-12">
          <p className="text-xs uppercase tracking-widest text-primary mb-3">{copy.legal}</p>
          <h1 className="text-3xl md:text-4xl font-semibold mb-3">{title}</h1>
          <p className="text-muted-foreground max-w-2xl leading-relaxed">{subtitle}</p>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
              {copy.lastUpdated}: {copy.updatedDate}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 print:hidden"
              onClick={() => window.print()}
            >
              <Download className="h-4 w-4" /> {copy.downloadPdf}
            </Button>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-5 py-10 grid gap-10 lg:grid-cols-[220px_minmax(0,768px)_200px] md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden md:block print:hidden">
          <div className="sticky top-20">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              {copy.onThisPage}
            </p>
            <nav className="space-y-1.5 text-sm">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block text-muted-foreground hover:text-foreground leading-snug"
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 space-y-10">
          {children}

          <div className="rounded-xl border border-border p-6 print:hidden">
            <h2 className="text-lg font-medium mb-2">{copy.needHelp}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {copy.helpBody}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="sm" className="gap-2">
                <a href="mailto:muslim.brami@gmail.com">
                  <Mail className="h-4 w-4" /> muslim.brami@gmail.com
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="gap-2">
                <Link to="/register">
                  {t("cta.getStarted")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {copy.disclaimer}
          </p>
        </main>

        <aside className="hidden lg:block print:hidden">
          <div className="sticky top-20">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              {copy.otherDocuments}
            </p>
            <nav className="space-y-1.5 text-sm">
              {LEGAL_LINKS.filter((l) => l.href !== path).map((l) => (
                <Link
                  key={l.href}
                  to={localizedPath(l.href)}
                  className="block text-muted-foreground hover:text-foreground leading-snug"
                >
                  {t(l.labelKey)}
                </Link>
              ))}
            </nav>
          </div>
        </aside>
      </div>

      <LegalFooter />
    </div>
  );
}

export function LegalFooter() {
  const { t } = useTranslation();
  const { locale, localizedPath } = usePublicLocale();
  const legalTrustLabel = locale === "sq" ? "Ligjore & Besim" : "Legal & Trust";

  return (
    <footer className="border-t border-border py-10 print:hidden">
      <div className="max-w-6xl mx-auto px-5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 mb-4 text-foreground font-semibold">
          <Zap className="h-4 w-4 text-primary" /> Pulse AI
        </div>
        <div className="mb-5">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 hover:text-foreground">
              {legalTrustLabel} <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              {LEGAL_LINKS.map((l) => (
                <DropdownMenuItem key={l.href} asChild>
                  <Link to={localizedPath(l.href)}>{t(l.labelKey)}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p>
          Pulse AI · {configuredPublicHost} ·{" "}
          <a href="mailto:muslim.brami@gmail.com" className="hover:text-foreground underline">
            muslim.brami@gmail.com
          </a>
        </p>
      </div>
    </footer>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-medium mb-4">{title}</h2>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export function InfoCard({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning";
}) {
  const tones = {
    neutral: "border-border bg-muted/40",
    positive: "border-primary/30 bg-primary/5",
    warning: "border-destructive/30 bg-destructive/5",
  } as const;
  return (
    <div className={`rounded-xl border p-5 ${tones[tone]}`}>
      <div className="font-medium text-foreground mb-2">{title}</div>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </div>
  );
}
