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

// Çmimet e pronarit në Euro (2026-11-25): tarifa mujore për databazën & AI-në + licenca vjetore.
// Përdoren kur databaza ende nuk i ka kolonat monthly_price_eur / annual_licence_eur.
const OWNER_EUR: Record<string, { monthly: number; annual: number }> = {
  launch: { monthly: 60, annual: 1700 },
  growth: { monthly: 100, annual: 2800 },
  agency: { monthly: 180, annual: 4500 },
};

// Çmime publike të tregut (USD, nëntor 2026) – për krahasim.
const COMPETITORS = [
  { name: "GoHighLevel (Unlimited / SaaS Pro)", monthly: [297, 497], yearly: null, note: { en: "Unlimited sub-accounts; WhatsApp and AI usage billed extra", sq: "Nën-llogari pa kufi; WhatsApp dhe AI paguhen veç" } },
  { name: "Vendasta", monthly: [499], prefix: "from", yearly: null, note: { en: "White-label from the $499 minimum, 1-year contract", sq: "White-label nga minimumi $499, kontratë 1-vjeçare" } },
  { name: "DM Champ (Agency)", monthly: [297, 497], yearly: null, note: { en: "10 clients ($27 each extra) or unlimited", sq: "10 klientë ($27 secili shtesë) ose pa kufi" } },
  { name: "Convocore", monthly: [199, 349], yearly: null, note: { en: "20 clients or unlimited, + 0.5% on payments", sq: "20 klientë ose pa kufi, + 0.5% e pagesave" } },
  { name: "Stammer.ai", monthly: [99], prefix: "from", yearly: null, note: { en: "AI chat/voice agents only, $10 per extra agent", sq: "Vetëm agjentë AI chat/zë, $10 për agjent shtesë" } },
];

const WhiteLabel = () => {
  const { t, i18n } = useTranslation();
  const isSq = i18n.language?.startsWith("sq");
  const { fromBase, currency } = useDisplayCurrency();
  const eur = (pkg: WhiteLabelPackage) => ({
    monthly: pkg.monthly_price_eur ?? OWNER_EUR[pkg.package_key]?.monthly ?? 0,
    annual: pkg.annual_licence_eur ?? OWNER_EUR[pkg.package_key]?.annual ?? 0,
  });
  const L = isSq
    ? { packages: "Paketat", perMonth: "në muaj · databaza & AI", setup: "Licenca vjetore", once: "në vit", mostChosen: "Më e zgjedhura", orShare: (n: number) => `Ose ${n}% e të ardhurave në vend të licencës fikse`, unlimited: "Hapësira klientësh pa kufi", clients: (n: number) => `${n} hapësira klientësh`, compare: "Krahasimi", provider: "Ofruesi", setupCol: "Licenca / vit", monthly: "Në muaj", notes: "Shënime", from: "nga", ours: "Databaza, AI-ja, hostimi, mbështetja dhe përditësimet të përfshira", note: "Tarifa mujore mbulon databazën dhe AI-në; licenca vjetore mbulon markën tuaj, mbështetjen dhe përditësimet. Çmimet nuk përfshijnë TVSH-në kur aplikohet. Çmimet e konkurrentëve janë publike, në USD, nëntor 2026.", fx: "Çmimet në monedhë tjetër nga Euro janë orientuese (≈), sipas kursit; fatura del në Euro." }
    : { packages: "Packages", perMonth: "per month · database & AI", setup: "Annual licence", once: "per year", mostChosen: "Most chosen", orShare: (n: number) => `Or ${n}% revenue share instead of the fixed licence`, unlimited: "Unlimited client workspaces", clients: (n: number) => `${n} client workspaces`, compare: "How we compare", provider: "Provider", setupCol: "Licence / year", monthly: "Monthly", notes: "Notes", from: "from", ours: "Database, AI, hosting, support and updates included", note: "The monthly fee covers the database and AI; the annual licence covers your brand, support and updates. Prices exclude VAT where applicable. Competitor prices are public list prices in USD, November 2026.", fx: "Prices in currencies other than Euro are indicative (≈) at the current rate; invoices are issued in EUR." };
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

  const activePackage = useMemo(
    () => packages.find((p) => p.package_key === selected) ?? packages.find((p) => p.highlighted) ?? packages[0],
    [packages, selected],
  );

  const apply = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in first so we can link the application to your account.");
      const { error } = await supabase.from("white_label_partners" as never).insert({
        user_id: user.id,
        contact_name: form.contact_name,
        contact_email: form.contact_email,
        phone: form.phone || null,
        brand_name: form.brand_name,
        desired_domain: form.desired_domain || null,
        package_key: activePackage?.package_key ?? null,
        expected_clients: form.expected_clients ? Number(form.expected_clients) : null,
        message: form.message || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Application sent. Our team will contact you within 2 business days.");
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
          <p className="text-sm text-muted-foreground">Loading packages…</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {packages.map((pkg) => {
              const isActive = activePackage?.package_key === pkg.package_key;
              return (
                <Card
                  key={pkg.id}
                  className={cn("relative flex flex-col", isActive && "border-primary shadow-md")}
                >
                  {pkg.highlighted && (
                    <Badge className="absolute -top-2 right-4 flex items-center gap-1">
                      <Crown className="h-3 w-3" /> {L.mostChosen}
                    </Badge>
                  )}
                  <CardHeader>
                    <CardTitle>{pkg.name}</CardTitle>
                    <CardDescription>{pkg.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div>
                      <p className="text-3xl font-semibold text-foreground">{fromBase(eur(pkg).monthly, "EUR")}</p>
                      <p className="text-xs text-muted-foreground">{L.perMonth}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {L.setup}: <span className="font-medium text-foreground">{fromBase(eur(pkg).annual, "EUR")}</span> {L.once}
                      </p>
                      {pkg.revenue_share_percent > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {L.orShare(pkg.revenue_share_percent)}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {pkg.included_clients === -1 ? L.unlimited : L.clients(pkg.included_clients)}
                      </p>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {(pkg.features || []).map((f) => (
                        <li key={f} className="flex gap-2 text-muted-foreground">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="mt-auto w-full"
                      variant={isActive ? "default" : "outline"}
                      onClick={() => {
                        setSelected(pkg.package_key);
                        document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      {isActive ? "Selected" : "Choose"} {pkg.name}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          {L.note}{currency !== "EUR" ? " " + L.fx : ""}
          Prices exclude VAT where applicable.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">{L.compare}</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">{L.provider}</th>
                <th className="px-4 py-3 font-medium">{L.setupCol}</th>
                <th className="px-4 py-3 font-medium">{L.monthly}</th>
                <th className="px-4 py-3 font-medium">{L.notes}</th>
              </tr>
            </thead>
            <tbody>
              {COMPETITORS.map((c) => (
                <tr key={c.name} className="border-t border-border">
                  <td className="px-4 py-3 text-muted-foreground">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.yearly ? fromBase(c.yearly, "USD") : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{"prefix" in c && c.prefix === "from" ? L.from + " " : ""}{c.monthly.map((v) => fromBase(v, "USD")).join(" – ")}</td>
                  <td className="px-4 py-3 text-muted-foreground">{isSq ? c.note.sq : c.note.en}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-primary/5">
                <td className="px-4 py-3 font-semibold text-foreground">Pulse AI White-Label</td>
                <td className="px-4 py-3 text-foreground">{fromBase(1700, "EUR")} – {fromBase(4500, "EUR")}</td>
                <td className="px-4 py-3 text-foreground">{fromBase(60, "EUR")} – {fromBase(180, "EUR")}</td>
                <td className="px-4 py-3 text-foreground">{L.ours}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="apply" className="mx-auto max-w-2xl px-4 pb-20">
        <Card>
          <CardHeader>
            <CardTitle>Apply for White-Label</CardTitle>
            <CardDescription>
              {activePackage ? `Selected package: ${activePackage.name}.` : "Choose a package above, then apply."} Our
              team reviews every application before activation.
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
                <Label htmlFor="wl-brand">Brand name</Label>
                <Input id="wl-brand" value={form.brand_name} onChange={(e) => setForm({ ...form, brand_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-domain">Desired domain</Label>
                <Input id="wl-domain" placeholder="app.yourbrand.com" value={form.desired_domain} onChange={(e) => setForm({ ...form, desired_domain: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-clients">Expected clients</Label>
                <Input id="wl-clients" type="number" min={0} value={form.expected_clients} onChange={(e) => setForm({ ...form, expected_clients: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-message">Anything else?</Label>
              <Textarea id="wl-message" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            <Button className="w-full" disabled={!canSubmit || !user} onClick={() => apply.mutate()}>
              {apply.isPending ? "Sending…" : "Send application"}
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default WhiteLabel;
