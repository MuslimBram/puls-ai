import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock, LogIn, UserPlus, Home, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { memberPageInfo, MEMBER_PAGES } from "@/lib/memberPages";

const T = {
  sq: {
    locked: "Kjo faqe është për anëtarët e Pulse AI",
    need: "Për ta parë duhet të jesh i regjistruar dhe të hysh në llogarinë tënde.",
    adminNeed: "Kjo faqe është vetëm për administratorët e platformës.",
    what: "Çfarë do të shohësh këtu:",
    login: "Hyr",
    register: "Regjistrohu falas",
    home: "Kthehu në faqen kryesore",
    notFound: "Kjo faqe nuk ekziston",
    notFoundText: "Adresa mund të jetë shkruar gabim ose faqja është zhvendosur. Ja disa faqe që mund të të duhen:",
  },
  en: {
    locked: "This page is for Pulse AI members",
    need: "You need to be registered and signed in to see it.",
    adminNeed: "This page is only for platform administrators.",
    what: "What you will find here:",
    login: "Sign in",
    register: "Register for free",
    home: "Back to home",
    notFound: "This page does not exist",
    notFoundText: "The address may be mistyped or the page has moved. Here are some pages you may need:",
  },
};

/** Shpjegim për vizitorin: çfarë ka faqja dhe pse duhet hyrje. Pa info → faqja s'ekziston. */
export default function MemberAccessNotice({ mode = "auto" }: { mode?: "auto" | "notfound" }) {
  const { pathname, search } = useLocation();
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("sq") ? "sq" : "en";
  const t = T[lang];
  const info = mode === "notfound" ? null : memberPageInfo(pathname);
  const next = encodeURIComponent(pathname + search);

  if (!info) {
    const suggestions = ["/dashboard", "/inbox", "/leads", "/crm", "/lidhjet", "/help-center"];
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-lg text-center">
          <p className="text-5xl font-bold text-primary">404</p>
          <h1 className="mt-3 text-2xl font-semibold">{t.notFound}</h1>
          <p className="mt-2 text-muted-foreground">{t.notFoundText}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {suggestions.map((p) => (
              <Link key={p} to={p} className="flex items-center gap-2 rounded-lg border border-border p-3 text-left text-sm hover:border-primary">
                <Compass className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span><b>{MEMBER_PAGES[p][lang][0]}</b><br /><span className="text-muted-foreground">{MEMBER_PAGES[p][lang][1]}</span></span>
              </Link>
            ))}
          </div>
          <Button asChild variant="ghost" className="mt-5">
            <Link to="/"><Home className="mr-2 h-4 w-4" aria-hidden="true" />{t.home}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const [title, desc] = info[lang];
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{t.locked}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{info.admin ? t.adminNeed : t.need}</p>
        <div className="mt-5 rounded-xl bg-muted/50 p-4 text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.what}</p>
          <p className="mt-1 font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <Link to={`/login?next=${next}`}><LogIn className="mr-2 h-4 w-4" aria-hidden="true" />{t.login}</Link>
          </Button>
          {!info.admin && (
            <Button asChild variant="outline" className="flex-1">
              <Link to={`/register?source=${encodeURIComponent(pathname)}`}><UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />{t.register}</Link>
            </Button>
          )}
        </div>
        <Link to="/" className="mt-4 inline-block text-sm text-muted-foreground underline">{t.home}</Link>
      </div>
    </div>
  );
}
