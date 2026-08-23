import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LegalLayout, Section, type LegalSection } from "@/components/legal/LegalLayout";
import { getCookieConsent, setCookieConsent } from "@/components/legal/CookieConsentBanner";
import { usePublicLocale } from "@/hooks/usePublicLocale";

export default function CookiePolicy() {
  const { locale } = usePublicLocale();
  const isSq = locale === "sq";
  const [optional, setOptional] = useState(false);

  useEffect(() => {
    setOptional(getCookieConsent() === "all");
  }, []);

  const sections: LegalSection[] = isSq
    ? [
        { id: "what", title: "1. Çfarë janë cookie-t" },
        { id: "types", title: "2. Cookie-t që përdorim" },
        { id: "preferences", title: "3. Preferencat tuaja" },
        { id: "managing", title: "4. Menaxhimi i cookie-ve në shfletues" },
      ]
    : [
        { id: "what", title: "1. What cookies are" },
        { id: "types", title: "2. Cookies we use" },
        { id: "preferences", title: "3. Your preferences" },
        { id: "managing", title: "4. Managing cookies in your browser" },
      ];

  const rows = isSq
    ? [
        ["Thelbësore", "Sesioni, autentikimi, mbrojtja CSRF, balancimi i ngarkesës", "Sesioni – 24 orë", "Gjithmonë aktive"],
        ["Preferenca", "Gjuha, tema, zgjedhja e cookie-ve, banner-at e mbyllur", "Deri në 12 muaj", "Opsionale"],
        ["Analitikë", "Përdorim i agreguar i funksioneve dhe diagnostikim gabimesh", "Deri në 12 muaj", "Opsionale"],
        ["Marketing", "Atribuim për referral dhe linke ambasadorësh", "Deri në 90 ditë", "Opsionale"],
      ]
    : [
        ["Essential", "Session, authentication, CSRF protection, load balancing", "Session – 24 hours", "Always on"],
        ["Preferences", "Language, theme, cookie choice, dismissed banners", "Up to 12 months", "Optional"],
        ["Analytics", "Aggregated feature usage and error diagnostics", "Up to 12 months", "Optional"],
        ["Marketing", "Attribution for referral and ambassador links", "Up to 90 days", "Optional"],
      ];

  const save = () => {
    setCookieConsent(optional ? "all" : "essential");
    toast.success(isSq ? "Preferencat e cookie-ve u ruajtën" : "Cookie preferences saved");
  };

  return (
    <LegalLayout
      title={isSq ? "Politika e Cookie-ve" : "Cookie Policy"}
      subtitle={isSq
        ? "Cilat cookie vendos Pulse AI, pse ekzistojnë, sa zgjasin dhe si të ndryshoni zgjedhjen tuaj."
        : "Which cookies Pulse AI sets, why they exist, how long they last and how to change your choice."}
      description={isSq
        ? "Politika e Cookie-ve e Pulse AI: cookie thelbësore, preference, analitike dhe marketingu, afatet e ruajtjes dhe si të menaxhoni pëlqimin."
        : "Pulse AI Cookie Policy: essential, preference, analytics and marketing cookies, their retention periods, and how to manage your consent."}
      path="/cookies"
      sections={sections}
    >
      <Section id="what" title={sections[0].title}>
        <p>{isSq
          ? "Cookie-t janë skedarë të vegjël të ruajtur nga shfletuesi juaj. Ne përdorim gjithashtu teknologji të barasvlershme si localStorage. Disa janë të nevojshme që platforma të funksionojë; të tjerat janë opsionale dhe vendosen vetëm pasi t'i lejoni."
          : "Cookies are small files stored by your browser. We also use equivalent technologies such as localStorage. Some are required for the platform to function; others are optional and only set after you allow them."}</p>
      </Section>

      <Section id="types" title={sections[1].title}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-foreground">
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Kategoria" : "Category"}</th>
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Qëllimi" : "Purpose"}</th>
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Ruajtja" : "Retention"}</th>
                <th className="text-left py-2 font-medium">{isSq ? "Pëlqimi" : "Consent"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([cat, purpose, retention, consent]) => (
                <tr key={cat} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-4 text-foreground font-medium">{cat}</td>
                  <td className="py-2 pr-4">{purpose}</td>
                  <td className="py-2 pr-4">{retention}</td>
                  <td className="py-2">{consent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="preferences" title={sections[2].title}>
        <div className="rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-foreground">{isSq ? "Cookie thelbësore" : "Essential cookies"}</div>
              <p className="text-sm text-muted-foreground">
                {isSq ? "Të nevojshme për hyrjen dhe sigurinë. Nuk mund të çaktivizohen." : "Required for sign-in and security. Cannot be disabled."}
              </p>
            </div>
            <Switch checked disabled aria-label={isSq ? "Cookie thelbësore gjithmonë aktive" : "Essential cookies always enabled"} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-foreground">{isSq ? "Analitikë, preferenca dhe marketing" : "Analytics, preferences and marketing"}</div>
              <p className="text-sm text-muted-foreground">
                {isSq ? "Na ndihmon të përmirësojmë produktin dhe të atribuojmë referral link-et." : "Helps us improve the product and attribute referral links."}
              </p>
            </div>
            <Switch checked={optional} onCheckedChange={setOptional} aria-label={isSq ? "Cookie opsionale" : "Optional cookies"} />
          </div>
          <Button size="sm" onClick={save}>{isSq ? "Ruaj preferencat" : "Save preferences"}</Button>
        </div>
      </Section>

      <Section id="managing" title={sections[3].title}>
        <p>{isSq
          ? "Mund t'i fshini ose bllokoni cookie-t në cilësimet e shfletuesit. Bllokimi i cookie-ve thelbësore do t'ju pengojë të hyni në llogari. Fshirja e të dhënave të faqes rivendos zgjedhjen e pëlqimit dhe banner-i do të shfaqet përsëri."
          : "You can delete or block cookies in your browser settings. Blocking essential cookies will prevent you from signing in. Clearing site data resets your consent choice and the banner will appear again."}</p>
      </Section>
    </LegalLayout>
  );
}
