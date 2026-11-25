import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Check, Crown, Palette, Globe, LifeBuoy, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { Seo } from "@/components/Seo";
import { usePublicLocale } from "@/hooks/usePublicLocale";

interface WhiteLabelPackage {
  id: string;
  package_key: string;
  name: string;
  description: string | null;
  setup_fee: number;
  monthly_licence: number;
  monthly_price_eur?: number | null;
  annual_licence_eur?: number | null;
  revenue_share_percent: number;
  included_clients: number;
  features: string[];
  highlighted: boolean;
  sort_order: number;
}

// White Label – investim një herë (vendim i pronarit, 2026-11-25), çmimet bazë në Lek.
// Mirëmbajtja: 20% e licencës në vit; licenca mund të paguhet edhe në 6 këste të barabarta.
const MAINTENANCE_RATE = 0.2;
const INSTALMENTS = 6;

type Tier = {
  key: string; oneTimeAll: number | null; maintenanceAll: number | null; clients: number | null; highlighted?: boolean;
  name: { sq: string; en: string }; desc: { sq: string; en: string }; features: { sq: string[]; en: string[] };
};
const WL_TIERS: Tier[] = [
  {
    key: "launch", oneTimeAll: 1000000, maintenanceAll: 1000000 * MAINTENANCE_RATE / 12, clients: 50,
    name: { sq: "White Label 50", en: "White Label 50" },
    desc: { sq: "Për menaxherë rrjetesh sociale dhe agjenci të vogla që nisin me markën e tyre.", en: "For social media managers and small agencies starting under their own brand." },
    features: {
      sq: ["Logoja, ngjyrat dhe emri juaj", "Deri në 50 klientë (biznese)", "Inbox, CRM, AI dhe automatizime për çdo klient", "Mirëmbajtja: 20% e licencës në vit (hostimi, databaza, AI, përditësimet)", "Mbështetje me email dhe chat"],
      en: ["Your logo, colours and brand name", "Up to 50 clients (businesses)", "Inbox, CRM, AI and automations for every client", "Maintenance: 20% of the licence per year (hosting, database, AI, updates)", "Email and chat support"],
    },
  },
  {
    key: "growth", oneTimeAll: 5000000, maintenanceAll: 5000000 * MAINTENANCE_RATE / 12, clients: 300, highlighted: true,
    name: { sq: "White Label 300", en: "White Label 300" },
    desc: { sq: "Për agjenci me shumë klientë që duan domenin dhe markën e tyre të plotë.", en: "For agencies with many clients that want their own domain and full brand." },
    features: {
      sq: ["Gjithçka te White Label 50", "Deri në 300 klientë (biznese)", "Domeni juaj dhe email-et me markën tuaj", "Trajnim për ekipin dhe ndihmë në nisje", "Mbështetje me përparësi (24 orë)"],
      en: ["Everything in White Label 50", "Up to 300 clients (businesses)", "Your own domain and branded emails", "Team training and onboarding help", "Priority support (24h)"],
    },
  },
  {
    key: "agency", oneTimeAll: 10000000, maintenanceAll: 10000000 * MAINTENANCE_RATE / 12, clients: null,
    name: { sq: "White Label – Premium Unlimited", en: "White Label – Premium Unlimited" },
    desc: { sq: "Për agjenci të mëdha dhe rrjete që duan klientë pa kufi.", en: "For large agencies and networks that want unlimited clients." },
    features: {
      sq: ["Gjithçka te White Label 300", "Klientë (biznese) pa kufi", "Menaxher i dedikuar llogarie", "Integrime të posaçme dhe API", "Rishikim strategjik çdo 3 muaj"],
      en: ["Everything in White Label 300", "Unlimited clients (businesses)", "Dedicated account manager", "Custom integrations and API access", "Quarterly strategy review"],
    },
  },
  {
    key: "source_code", oneTimeAll: null, maintenanceAll: null, clients: null,
    name: { sq: "Kodi i plotë – pa logo", en: "Full source code – unbranded" },
    desc: { sq: "Merrni të gjithë kodin e Pulse AI pa logo, për ta drejtuar në serverat tuaj.", en: "Get the complete Pulse AI code without logo, to run on your own servers." },
    features: {
      sq: ["I gjithë kodi i aplikacionit dhe i funksioneve", "Pa logo dhe pa emrin Pulse AI", "Instalim në serverat tuaj", "Kontratë licence (pa rishitje të kodit)", "Mirëmbajtje sipas marrëveshjes"],
      en: ["All application and function code", "No logo and no Pulse AI name", "Installation on your own servers", "Licence contract (no resale of the code)", "Maintenance by agreement"],
    },
  },
];

// Çmime publike të tregut (USD, nëntor 2026) – mjete white-label për menaxherë rrjetesh sociale dhe agjenci.
const COMPETITORS = [
  { name: "SocialPilot (Ultimate)", monthly: [200], note: { en: "White label for ~10 clients, social media only", sq: "White label për ~10 klientë, vetëm rrjete sociale" } },
  { name: "Cloud Campaign (Team / Agency)", monthly: [199, 299], note: { en: "Branded reports; custom domain on Agency", sq: "Raporte me markën; domen vetjak te Agency" } },
  { name: "Vista Social (Scale)", monthly: [379, 449], note: { en: "About 70 social profiles", sq: "Rreth 70 profile sociale" } },
  { name: "Sendible (Advanced / Enterprise)", monthly: [299, 750], note: { en: "White label only on the top plans", sq: "White label vetëm te planet e larta" } },
  { name: "GoHighLevel (Unlimited / SaaS Pro)", monthly: [297, 497], note: { en: "CRM + funnels; WhatsApp and AI usage extra", sq: "CRM + funnel; WhatsApp dhe AI paguhen veç" } },
  { name: "WhatsCRM Hub (source code)", oneTime: [799, 1599], note: { en: "One-time source licence of a small WhatsApp CRM", sq: "Licencë kodi një herë për një CRM të vogël WhatsApp" } },
];

const WhiteLabel = () => {
  const { t, i18n } = useTranslation();
  const isSq = i18n.language?.startsWith("sq");
  const { fromBase, currency } = useDisplayCurrency();
  const lang = isSq ? "sq" : "en";
  const L = isSq
    ? { packages: "Paketat White Label", once: "investim një herë", maint: "Mirëmbajtja (20% në vit)", perMonth: "në muaj", perYear: "në vit", instal: (n: number, v: string) => `ose ${n} këste × ${v}`, smm: "Menaxher i rrjeteve sociale ose freelancer? Regjistrohuni si White Label, Biznes, Frilancer ose Ambasador – zgjidhni llojin në regjistrim.", smmCta: "Regjistrohu", mostChosen: "Më e zgjedhura", clients: (n: number) => `Kapacitet: ${n} klientë (biznese)`, unlimited: "Kapacitet: klientë pa kufi", quote: "Kërkoni ofertë", choose: "Zgjidh", selected: "E zgjedhur", compare: "Krahasimi me tregun", provider: "Ofruesi", oneTimeCol: "Një herë", monthly: "Në muaj", notes: "Shënime", ours: "Licencë një herë (ose 6 këste) + mirëmbajtje 20% në vit; marka, domeni dhe klientët janë tuajat", note: "Mirëmbajtja (20% e licencës në vit) mbulon hostimin, databazën, AI-në, përditësimet dhe mbështetjen. Licenca mund të paguhet përnjëherë ose në 6 këste mujore. Çmimet nuk përfshijnë TVSH-në kur aplikohet. Çmimet e konkurrentëve janë publike, në USD, nëntor 2026.", fx: "Çmimet në Euro/Dollar janë orientuese sipas kursit 1 € = 88 Lek, 1 $ = 80 Lek; fatura del në Lek.", loading: "Duke ngarkuar paketat…" }
    : { packages: "White Label packages", once: "one-time investment", maint: "Maintenance (20% per year)", perMonth: "per month", perYear: "per year", instal: (n: number, v: string) => `or ${n} instalments × ${v}`, smm: "Social media manager or freelancer? Register as White Label, Business, Freelancer or Ambassador – pick the type when you sign up.", smmCta: "Register", mostChosen: "Most chosen", clients: (n: number) => `Capacity: ${n} clients (businesses)`, unlimited: "Capacity: unlimited clients", quote: "Request a quote", choose: "Choose", selected: "Selected", compare: "How we compare", provider: "Provider", oneTimeCol: "One-time", monthly: "Monthly", notes: "Notes", ours: "One-time licence (or 6 instalments) + 20% yearly maintenance; the brand, domain and clients are yours", note: "Maintenance (20% of the licence per year) covers hosting, database, AI, updates and support. The licence can be paid at once or in 6 monthly instalments. Prices exclude VAT where applicable. Competitor prices are public list prices in USD, November 2026.", fx: "Euro/Dollar prices are indicative at 1 € = 88 ALL, 1 $ = 80 ALL; invoices are issued in ALL.", loading: "Loading packages…" };
  const { user } = useAuth();
  const { localizedPath } = usePublicLocale();
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({
    contact_name: "",
    contact_email: "",
    phone: "",
    brand_name: "",
    desired_domain: "",
    expected_clients: "",
    message: "",
  });

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["white-label-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("white_label_packages" as never)
        .select("*")
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as WhiteLabelPackage[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const activeTier = useMemo(
    () => WL_TIERS.find((p) => p.key === selected) ?? WL_TIERS.find((p) => p.highlighted) ?? WL_TIERS[0],
    [selected],
  );

  const apply = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(isSq ? "Hyni fillimisht, që aplikimi të lidhet me llogarinë tuaj." : "Sign in first so we can link the application to your account.");
      const { error } = await supabase.from("white_label_partners" as never).insert({
        user_id: user.id,
        contact_name: form.contact_name,
        contact_email: form.contact_email,
        phone: form.phone || null,
        brand_name: form.brand_name,
        desired_domain: form.desired_domain || null,
        package_key: activeTier?.key ?? null,
        expected_clients: form.expected_clients ? Number(form.expected_clients) : null,
        message: form.message || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isSq ? "Aplikimi u dërgua. Ekipi ynë do t'ju kontaktojë brenda 2 ditëve të punës." : "Application sent. Our team will contact you within 2 business days.");
      setForm({ contact_name: "", contact_email: "", phone: "", brand_name: "", desired_domain: "", expected_clients: "", message: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = form.contact_name.trim() && form.contact_email.trim() && form.brand_name.trim() && !apply.isPending;

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={t("whiteLabelPage.seo.title")}
        description={t("whiteLabelPage.seo.desc")}
      />

      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to={localizedPath("/")} className="flex items-center gap-2 font-semibold text-foreground">
            <Zap className="h-5 w-5 text-primary" /> Pulse AI
          </Link>
          <Button asChild variant="outline" size="sm"><Link to="/register">{t("auth.createAccount")}</Link></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-14 text-center">
        <Badge variant="secondary" className="mb-4">Partner programme</Badge>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {t("whiteLabelPage.hero.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          {t("whiteLabelPage.hero.subtitle")}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Palette, title: t("whiteLabelPage.features.branding.title"), text: t("whiteLabelPage.features.branding.body") },
            { icon: Globe, title: t("whiteLabelPage.features.domain.title"), text: t("whiteLabelPage.features.domain.body") },
            { icon: LifeBuoy, title: t("whiteLabelPage.features.hosting.title"), text: t("whiteLabelPage.features.hosting.body") },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-border p-5 text-left">
              <Icon className="mb-3 h-6 w-6 text-primary" />
              <p className="font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <h2 className="mb-6 text-2xl font-semibold text-foreground">{L.packages}</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{L.loading}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {WL_TIERS.map((tier) => {
              const isActive = activeTier?.key === tier.key;
              return (
                <Card key={tier.key} className={cn("relative flex flex-col", isActive && "border-primary shadow-md")}>
                  {tier.highlighted && (
                    <Badge className="absolute -top-2 right-4 flex items-center gap-1">
                      <Crown className="h-3 w-3" /> {L.mostChosen}
                    </Badge>
                  )}
                  <CardHeader>
                    <CardTitle>{tier.name[lang]}</CardTitle>
                    <CardDescription>{tier.desc[lang]}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div>
                      {tier.oneTimeAll ? (
                        <>
                          <p className="text-3xl font-semibold text-foreground">{fromBase(tier.oneTimeAll, "ALL")}</p>
                          <p className="text-xs text-muted-foreground">{L.once}</p>
                          <p className="text-xs text-muted-foreground">{L.instal(INSTALMENTS, fromBase(Math.round(tier.oneTimeAll / INSTALMENTS), "ALL"))}</p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {L.maint}: <span className="font-medium text-foreground">{fromBase(Math.round(tier.oneTimeAll * MAINTENANCE_RATE), "ALL")}</span> {L.perYear}
                            {" "}(≈ {fromBase(Math.round(tier.maintenanceAll ?? 0), "ALL").replace("≈ ", "")} {L.perMonth})
                          </p>
                          <p className="text-sm text-muted-foreground">{tier.clients ? L.clients(tier.clients) : L.unlimited}</p>
                        </>
                      ) : (
                        <p className="text-2xl font-semibold text-foreground">{L.quote}</p>
                      )}
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {tier.features[lang].map((f) => (
                        <li key={f} className="flex gap-2 text-muted-foreground">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="mt-auto w-full"
                      variant={isActive ? "default" : "outline"}
                      onClick={() => {
                        setSelected(tier.key);
                        document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      {tier.oneTimeAll ? `${isActive ? L.selected : L.choose}: ${tier.name[lang].replace("White Label – ", "").replace("White Label ", "")}` : L.quote}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <div className="mt-5 flex flex-col items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">{L.smm}</p>
          <Button asChild variant="outline" size="sm"><Link to="/register">{L.smmCta}</Link></Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {L.note}{currency !== "ALL" ? " " + L.fx : ""}
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">{L.compare}</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">{L.provider}</th>
                <th className="px-4 py-3 font-medium">{L.oneTimeCol}</th>
                <th className="px-4 py-3 font-medium">{L.monthly}</th>
                <th className="px-4 py-3 font-medium">{L.notes}</th>
              </tr>
            </thead>
            <tbody>
              {COMPETITORS.map((c) => (
                <tr key={c.name} className="border-t border-border">
                  <td className="px-4 py-3 text-muted-foreground">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{"oneTime" in c && c.oneTime ? c.oneTime.map((v) => fromBase(v, "USD")).join(" – ") : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{"monthly" in c && c.monthly ? c.monthly.map((v) => fromBase(v, "USD")).join(" – ") : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{isSq ? c.note.sq : c.note.en}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-primary/5">
                <td className="px-4 py-3 font-semibold text-foreground">Pulse AI White-Label</td>
                <td className="px-4 py-3 text-foreground">{fromBase(1000000, "ALL")} – {fromBase(10000000, "ALL")}</td>
                <td className="px-4 py-3 text-foreground">{fromBase(Math.round(1000000 * MAINTENANCE_RATE / 12), "ALL")} – {fromBase(Math.round(10000000 * MAINTENANCE_RATE / 12), "ALL")}</td>
                <td className="px-4 py-3 text-foreground">{L.ours}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="apply" className="mx-auto max-w-2xl px-4 pb-20">
        <Card>
          <CardHeader>
            <CardTitle>{isSq ? "Apliko për White Label" : "Apply for White Label"}</CardTitle>
            <CardDescription>
              {activeTier ? (isSq ? `Paketa e zgjedhur: ${activeTier.name.sq}.` : `Selected package: ${activeTier.name.en}.`) : (isSq ? "Zgjidh një paketë më sipër." : "Choose a package above, then apply.")}{" "}
              {isSq ? "Ekipi ynë shqyrton çdo aplikim para aktivizimit." : "Our team reviews every application before activation."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!user && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
                <p className="mb-2">{t("whiteLabelPage.applyNote")}</p>
                <Link to="/login" className="font-medium text-primary underline">{t("cta.login")}</Link> {t("common.or")}{" "}
                <Link to="/register" className="font-medium text-primary underline">{t("auth.createAccount")}</Link>.
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wl-name">{t("leadForm.fields.fullName")}</Label>
                <Input id="wl-name" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-email">{t("leadForm.fields.email")}</Label>
                <Input id="wl-email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-phone">{t("leadForm.fields.phone")}</Label>
                <Input id="wl-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-brand">{isSq ? "Emri i markës" : "Brand name"}</Label>
                <Input id="wl-brand" value={form.brand_name} onChange={(e) => setForm({ ...form, brand_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-domain">{isSq ? "Domeni i dëshiruar" : "Desired domain"}</Label>
                <Input id="wl-domain" placeholder={isSq ? "app.marka-juaj.com" : "app.yourbrand.com"} value={form.desired_domain} onChange={(e) => setForm({ ...form, desired_domain: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-clients">{isSq ? "Numri i pritur i klientëve" : "Expected clients"}</Label>
                <Input id="wl-clients" type="number" min={0} value={form.expected_clients} onChange={(e) => setForm({ ...form, expected_clients: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-message">{isSq ? "Diçka tjetër?" : "Anything else?"}</Label>
              <Textarea id="wl-message" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            <Button className="w-full" disabled={!canSubmit || !user} onClick={() => apply.mutate()}>
              {apply.isPending ? (isSq ? "Duke dërguar…" : "Sending…") : (isSq ? "Dërgo aplikimin" : "Send application")}
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default WhiteLabel;
