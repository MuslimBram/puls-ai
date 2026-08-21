import { useEffect } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Building2,
  ChartColumn,
  CheckCircle2,
  Cpu,
  GitBranch,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Seo } from "@/components/Seo";
import { FloatingAIBot } from "@/components/FloatingAIBot";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicCTA } from "@/components/public/PublicCTA";
import { TrustBadgeRow } from "@/components/public/TrustBadge";
import { PublicLeadForm } from "@/components/leads/PublicLeadForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const HERO_CHANNELS = [
  { label: "WhatsApp", icon: Phone },
  { label: "Instagram", icon: Sparkles },
  { label: "Messenger", icon: MessageSquare },
  { label: "Telegram", icon: MessageSquare },
  { label: "Email", icon: Mail },
  { label: "Web Chat", icon: Bot },
];

const OMNICHANNEL_CHANNELS = [
  "WhatsApp",
  "Instagram",
  "Facebook / Messenger",
  "Telegram",
  "SMS",
  "Email",
  "Voice",
  "Web Chat",
];

const FLOW_KEYS = ["channels", "inbox", "crm", "ai", "automation", "analytics"] as const;
const PILLAR_KEYS = ["communication", "intelligence", "crmSales", "automation", "memory", "analytics"] as const;
const JOURNEY_KEYS = ["lead", "qualification", "crm", "followUp", "booking", "analytics"] as const;
const CONTROL_KEYS = ["handoff", "rules", "visibility"] as const;
const AI_PROMPT_KEYS = ["promptOne", "promptTwo", "promptThree"] as const;
const PROBLEM_KEYS = ["fragmentedLeads", "missedFollowUps", "disconnectedData", "manualWork", "unclearIntelligence", "lostContext"] as const;

const pillarIcons = {
  communication: MessageSquare,
  intelligence: BrainCircuit,
  crmSales: Users,
  automation: Workflow,
  memory: Cpu,
  analytics: ChartColumn,
} as const;

const journeyIcons = {
  lead: Sparkles,
  qualification: CheckCircle2,
  crm: Users,
  followUp: Workflow,
  booking: Building2,
  analytics: ChartColumn,
} as const;

const controlIcons = {
  handoff: Users,
  rules: ShieldCheck,
  visibility: ChartColumn,
} as const;

const flowIcons = {
  channels: MessageSquare,
  inbox: Mail,
  crm: Users,
  ai: Bot,
  automation: GitBranch,
  analytics: ChartColumn,
} as const;

const Index = () => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const scrollRef = useScrollAnimation();
  const location = useLocation();

  const openAIBot = () => {
    window.dispatchEvent(new CustomEvent("pulse-ai-open-bot"));
  };

  useEffect(() => {
    if (!location.hash) return;

    const sectionId = decodeURIComponent(location.hash.slice(1));
    const section = document.getElementById(sectionId);

    if (!section) return;

    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Pulse AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: t("homepage.hero.description"),
    url: `${window.location.origin}/`,
    offers: {
      "@type": "Offer",
      url: `${window.location.origin}/pricing`,
    },
  };

  return (
    <PublicShell mainClassName="overflow-x-clip">
      <Seo
        title={t("homepage.seo.title")}
        description={t("homepage.seo.description")}
        canonical={`${window.location.origin}/`}
        jsonLd={jsonLd}
      />

      <div ref={scrollRef} className="bg-background">
        <section id="overview" className="border-b border-border/60">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
            <div className="space-y-8">
              <div className="space-y-4 animate-on-scroll">
                <Badge variant="secondary" className="w-fit gap-2 px-3 py-1 text-xs font-medium">
                  <Zap className="h-3.5 w-3.5" />
                  {t("homepage.hero.eyebrow")}
                </Badge>
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                    {t("homepage.hero.brand")}
                  </p>
                  <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                    {t("homepage.hero.title")}
                  </h1>
                  <p className="max-w-2xl text-xl text-muted-foreground sm:text-2xl">
                    {t("homepage.hero.subtitle")}
                  </p>
                </div>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {t("homepage.hero.description")}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row animate-on-scroll">
                <PublicCTA
                  size="lg"
                  className="min-w-[200px]"
                  appDestination="/dashboard"
                  label={t("homepage.hero.primaryCta")}
                />
                <Button size="lg" variant="outline" className="gap-2" onClick={openAIBot}>
                  {t("homepage.hero.secondaryCta")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="space-y-3 animate-on-scroll">
                <TrustBadgeRow />
                <p className="text-sm text-muted-foreground">
                  {t("homepage.hero.supportingNote")}
                </p>
              </div>
            </div>

            <Card className="animate-on-scroll border-border/70 bg-card/80 shadow-sm">
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("homepage.systemPreview.title")}</p>
                    <p className="text-sm text-muted-foreground">{t("homepage.systemPreview.description")}</p>
                  </div>
                  <Badge variant="outline">{t("homepage.systemPreview.badge")}</Badge>
                </div>
                <div className="flex flex-wrap gap-2" aria-label={t("homepage.omnichannel.title")}>
                  {HERO_CHANNELS.map(({ label, icon: Icon }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
                    >
                      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      {label}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {FLOW_KEYS.map((key, index) => {
                  const Icon = flowIcons[key];
                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background px-4 py-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {t(`homepage.flow.${key}.title`)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t(`homepage.flow.${key}.description`)}
                          </p>
                        </div>
                      </div>
                      {index < FLOW_KEYS.length - 1 && (
                        <div className="ml-5 h-5 w-px border-l border-dashed border-border/80" aria-hidden="true" />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="problem" className="border-b border-border/60 bg-muted/20">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-3xl text-center animate-on-scroll">
              <Badge variant="outline" className="mb-4">{t("homepage.problem.eyebrow")}</Badge>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {t("homepage.problem.title")}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {t("homepage.problem.description")}
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {PROBLEM_KEYS.map((key) => (
                <Card key={key} className="animate-on-scroll border-border/70 bg-background/80">
                  <CardContent className="flex items-start gap-3 p-5">
                    <div className="mt-0.5 rounded-full bg-destructive/10 p-2 text-destructive">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {t(`homepage.problem.items.${key}`)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="mt-8 animate-on-scroll border-primary/20 bg-primary/5">
              <CardContent className="p-6 sm:p-8">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                  {t("homepage.problem.solutionLabel")}
                </p>
                <p className="mt-3 max-w-4xl text-lg leading-8 text-foreground">
                  {t("homepage.problem.solution")}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="system" className="border-b border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-3xl text-center animate-on-scroll">
              <Badge variant="outline" className="mb-4">{t("homepage.flowSection.eyebrow")}</Badge>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {t("homepage.flowSection.title")}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {t("homepage.flowSection.description")}
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-6">
              {FLOW_KEYS.map((key, index) => {
                const Icon = flowIcons[key];
                return (
                  <div key={key} className="relative animate-on-scroll">
                    <Card className="h-full border-border/70 bg-card/80">
                      <CardContent className="flex h-full flex-col gap-4 p-5">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-base font-semibold text-foreground">
                            {t(`homepage.flow.${key}.title`)}
                          </h3>
                          <p className="text-sm leading-6 text-muted-foreground">
                            {t(`homepage.flow.${key}.description`)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    {index < FLOW_KEYS.length - 1 && (
                      <div className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 lg:block">
                        <ArrowRight className="h-5 w-5 text-border" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="capabilities" className="border-b border-border/60 bg-muted/20">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-3xl text-center animate-on-scroll">
              <Badge variant="outline" className="mb-4">{t("homepage.pillars.eyebrow")}</Badge>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {t("homepage.pillars.title")}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {t("homepage.pillars.description")}
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {PILLAR_KEYS.map((key) => {
                const Icon = pillarIcons[key];
                return (
                  <Card key={key} className="animate-on-scroll border-border/70 bg-background/90">
                    <CardContent className="space-y-4 p-6">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {t(`homepage.pillars.items.${key}.title`)}
                        </h3>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {t(`homepage.pillars.items.${key}.description`)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section id="omnichannel" className="border-b border-border/60">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-20">
            <div className="space-y-4 animate-on-scroll">
              <Badge variant="outline">{t("homepage.omnichannel.eyebrow")}</Badge>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {t("homepage.omnichannel.title")}
              </h2>
              <p className="text-lg text-muted-foreground">
                {t("homepage.omnichannel.description")}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {t("homepage.omnichannel.disclaimer")}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 animate-on-scroll">
              {OMNICHANNEL_CHANNELS.map((channel) => (
                <div
                  key={channel}
                  className="rounded-2xl border border-border/70 bg-card/80 px-4 py-4 text-sm font-medium text-foreground shadow-sm"
                >
                  {channel}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="ai" className="border-b border-border/60 bg-muted/20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-20">
            <div className="space-y-5 animate-on-scroll">
              <Badge variant="outline">{t("homepage.aiSection.eyebrow")}</Badge>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {t("homepage.aiSection.title")}
              </h2>
              <p className="text-lg text-muted-foreground">
                {t("homepage.aiSection.description")}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {t("homepage.aiSection.note")}
              </p>
              <Button size="lg" className="gap-2" onClick={openAIBot}>
                {t("homepage.aiSection.primaryCta")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <Card className="animate-on-scroll border-border/70 bg-background/90 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
                  {t("homepage.aiSection.cardTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {AI_PROMPT_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={openAIBot}
                    className="flex w-full items-start justify-between gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="text-sm leading-6 text-foreground">
                      {t(`homepage.aiSection.${key}`)}
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="journey" className="border-b border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-3xl text-center animate-on-scroll">
              <Badge variant="outline" className="mb-4">{t("homepage.journey.eyebrow")}</Badge>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {t("homepage.journey.title")}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {t("homepage.journey.description")}
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-6">
              {JOURNEY_KEYS.map((key, index) => {
                const Icon = journeyIcons[key];
                return (
                  <div key={key} className="relative animate-on-scroll">
                    <Card className="h-full border-border/70 bg-card/80">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            {t(`homepage.journey.steps.${key}.title`)}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {t(`homepage.journey.steps.${key}.description`)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    {index < JOURNEY_KEYS.length - 1 && (
                      <div className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 lg:block">
                        <ArrowRight className="h-5 w-5 text-border" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="trust" className="border-b border-border/60 bg-muted/20">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-3xl text-center animate-on-scroll">
              <Badge variant="outline" className="mb-4">{t("homepage.control.eyebrow")}</Badge>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {t("homepage.control.title")}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {t("homepage.control.description")}
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {CONTROL_KEYS.map((key) => {
                const Icon = controlIcons[key];
                return (
                  <Card key={key} className="animate-on-scroll border-border/70 bg-background/90">
                    <CardContent className="space-y-4 p-6">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          {t(`homepage.control.items.${key}.title`)}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {t(`homepage.control.items.${key}.description`)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section id="analytics" className="border-b border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-3xl text-center animate-on-scroll">
              <Badge variant="outline" className="mb-4">{t("homepage.pricing.eyebrow")}</Badge>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {t("homepage.pricing.title")}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {t("homepage.pricing.description")}
              </p>
            </div>
            <div className="mt-8 flex justify-center animate-on-scroll">
              <Button size="lg" variant="outline" asChild>
                <Link to="/pricing">
                  {t("homepage.pricing.cta")}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="contact" className="bg-muted/20">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
            <Card className="animate-on-scroll border-border/70 bg-background/90">
              <CardContent className="space-y-6 p-6 sm:p-8">
                <Badge variant="outline">{t("homepage.finalCta.eyebrow")}</Badge>
                <div className="space-y-3">
                  <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {t("homepage.finalCta.title")}
                  </h2>
                  <p className="text-lg text-muted-foreground">
                    {t("homepage.finalCta.description")}
                  </p>
                </div>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>{t("homepage.finalCta.pointOne")}</p>
                  <p>{t("homepage.finalCta.pointTwo")}</p>
                  <p>{t("homepage.finalCta.pointThree")}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <PublicCTA
                    size="lg"
                    className="min-w-[200px]"
                    appDestination="/dashboard"
                    label={t("homepage.finalCta.primaryCta")}
                  />
                  <Button size="lg" variant="outline" className="gap-2" onClick={openAIBot}>
                    {t("homepage.finalCta.secondaryCta")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="animate-on-scroll border-border/70 bg-card/90 shadow-sm">
              <CardContent className="p-6 sm:p-8">
                <PublicLeadForm
                  source="homepage"
                  showPlanSelect={false}
                  title={t("homepage.leadForm.title")}
                  subtitle={t("homepage.leadForm.subtitle")}
                />
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      <FloatingAIBot />
    </PublicShell>
  );
};

export default Index;
