import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Brain,
  FileSearch,
  Globe2,
  Image,
  MessageSquareText,
  Plug,
  Sparkles,
  Workflow,
} from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { Seo } from "@/components/Seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const copy = {
  en: {
    seoTitle: "LEAH — Standalone AI Workspace | Pulse AI",
    seoDescription: "Explore LEAH, Pulse AI's standalone workspace for research, creation, analysis and connected AI providers.",
    eyebrow: "Standalone AI workspace",
    title: "Meet LEAH before you sign in",
    description: "LEAH is a personal AI workspace for research, creation and planning. It can be used without a business workspace, CRM, Inbox, channels or a separate Pulse AI subscription.",
    primary: "Start with LEAH",
    secondary: "See pricing",
    preview: "Interface preview",
    previewNote: "This preview shows the intended experience. Real tools and provider access become available after sign-in and depend on your LEAH plan or connected API keys.",
    chatTitle: "Research and build with LEAH",
    prompt: "Compare three competitors, summarize their positioning, and create a 30-day launch plan.",
    answer: "I’ll organize the research, preserve the sources, and turn the findings into a practical workflow you can review.",
    capabilitiesTitle: "What LEAH is designed to do",
    capabilities: [
      ["Chat and research", "Ask questions, investigate topics and compare competitors with source-aware results."],
      ["Website and social scanning", "Analyze websites, social networks, and connected Telegram or WhatsApp sources within plan limits."],
      ["Images and video", "Generate or edit visual content using supported and validated AI providers."],
      ["Websites and applications", "Plan, create and edit website or application projects from one workspace."],
      ["Files and personal memory", "Analyze uploaded files and preserve useful personal context according to your plan."],
      ["Plugins and AI providers", "Use Pulse-managed providers or connect supported BYOK providers when your plan allows it."],
    ],
  },
  sq: {
    seoTitle: "LEAH — Hapësira AI e Pavarur | Pulse AI",
    seoDescription: "Zbulo LEAH, hapësirën e pavarur të Pulse AI për kërkim, krijim, analizë dhe provider-ë AI të lidhur.",
    eyebrow: "Hapësirë AI e pavarur",
    title: "Njihu me LEAH përpara se të hysh",
    description: "LEAH është hapësirë personale AI për kërkim, krijim dhe planifikim. Mund të përdoret pa biznes, CRM, Inbox, kanale ose abonim tjetër Pulse AI.",
    primary: "Fillo me LEAH",
    secondary: "Shiko çmimet",
    preview: "Pamje paraprake e ndërfaqes",
    previewNote: "Kjo pamje tregon eksperiencën e synuar. Mjetet reale dhe provider-ët aktivizohen pas hyrjes dhe varen nga paketa LEAH ose API keys të lidhura.",
    chatTitle: "Kërko dhe ndërto me LEAH",
    prompt: "Krahaso tre konkurrentë, përmblidh pozicionimin e tyre dhe krijo një plan lançimi 30-ditor.",
    answer: "Do ta organizoj kërkimin, do të ruaj burimet dhe do t’i kthej gjetjet në një workflow praktik që mund ta kontrollosh.",
    capabilitiesTitle: "Çfarë është projektuar të bëjë LEAH",
    capabilities: [
      ["Chat dhe research", "Bëj pyetje, kërko tema dhe krahaso konkurrentë me rezultate që ruajnë burimet."],
      ["Skanim website-i dhe social", "Analizo website, rrjete sociale dhe burime Telegram ose WhatsApp brenda limiteve të paketës."],
      ["Foto dhe video", "Gjenero ose edito përmbajtje vizuale me provider-ë AI të mbështetur dhe të verifikuar."],
      ["Website dhe aplikacione", "Planifiko, krijo dhe edito projekte website-i ose aplikacionesh nga një hapësirë."],
      ["Skedarë dhe memorie personale", "Analizo skedarët dhe ruaj kontekst personal të dobishëm sipas paketës."],
      ["Plugin-e dhe provider-ë AI", "Përdor provider-ët e menaxhuar nga Pulse ose BYOK kur paketa e lejon."],
    ],
  },
} as const;

const capabilityIcons = [MessageSquareText, Globe2, Image, Workflow, FileSearch, Plug];

export default function LeahPublic() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("sq") ? "sq" : "en";
  const content = copy[language];

  return (
    <PublicShell>
      <Seo title={content.seoTitle} description={content.seoDescription} />

      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <Badge className="mb-4 gap-2"><Sparkles className="h-3.5 w-3.5" />{content.eyebrow}</Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{content.title}</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">{content.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/register?next=%2Fleah">{content.primary}</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to={`/${language}/pricing`}>{content.secondary}</Link></Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-2 font-semibold"><Bot className="h-5 w-5 text-primary" />LEAH</div>
              <Badge variant="outline">{content.preview}</Badge>
            </div>
            <div className="grid min-h-[360px] sm:grid-cols-[150px_1fr]">
              <aside className="hidden border-r bg-muted/20 p-3 sm:block">
                <div className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">+ New chat</div>
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <div className="rounded-md border bg-background p-2">Competitor research</div>
                  <div className="rounded-md border bg-background p-2">Website project</div>
                  <div className="rounded-md border bg-background p-2">Content planner</div>
                </div>
              </aside>
              <div className="flex flex-col p-4 sm:p-6">
                <div className="flex items-center gap-2 font-semibold"><Brain className="h-5 w-5 text-primary" />{content.chatTitle}</div>
                <div className="mt-6 ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">{content.prompt}</div>
                <div className="mt-4 max-w-[90%] rounded-2xl rounded-bl-sm border bg-muted/30 px-4 py-3 text-sm leading-6">{content.answer}</div>
                <div className="mt-auto rounded-xl border border-dashed p-3 text-xs text-muted-foreground">{content.previewNote}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/20 px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold">{content.capabilitiesTitle}</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {content.capabilities.map(([title, description], index) => {
              const Icon = capabilityIcons[index];
              return (
                <Card key={title}>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5 text-primary" />{title}</CardTitle></CardHeader>
                  <CardContent><p className="text-sm leading-6 text-muted-foreground">{description}</p></CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
