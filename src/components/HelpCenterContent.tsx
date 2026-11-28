import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COMMISSION_POLICY } from "@/config/commissionPolicy";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CHANNEL_GUIDES, getGuideLocale } from "@/config/channelGuides";
import {
  Plug,
  MessageSquare,
  Bot,
  BarChart3,
  Users,
  Gift,
  Settings,
  Sparkles,
  ArrowRight,
} from "lucide-react";

const STEPS = [
  {
    icon: Settings,
    title: "1. Complete your business profile",
    body: "Go to Business Profile and fill in name, industry, services and audience. The AI uses this to personalize every reply.",
    href: "/business-profile",
    cta: "Open profile",
  },
  {
    icon: Plug,
    title: "2. Connect your channels",
    body: "Open Connections Hub and link Telegram, WhatsApp, Email, Instagram, etc. You can edit, reconnect, test or disconnect any channel anytime.",
    href: "/connections",
    cta: "Manage channels",
  },
  {
    icon: Bot,
    title: "3. Train the AI",
    body: "Go to Knowledge Base and add FAQs, pricing, policies. The AI will use these to reply automatically to your visitors.",
    href: "/knowledge-base",
    cta: "Train AI",
  },
  {
    icon: MessageSquare,
    title: "4. Use the unified inbox",
    body: "All messages from every channel land in one inbox. Reply manually or let the AI handle them.",
    href: "/inbox",
    cta: "Open inbox",
  },
  {
    icon: BarChart3,
    title: "5. Track performance",
    body: "Check Analytics and CRM to see leads, deals, response time and ROI in real time.",
    href: "/analytics",
    cta: "See analytics",
  },
  {
    icon: Gift,
    title: "6. Share your referral link",
    body: `Share your referral link from the Referral Program page. You earn ${COMMISSION_POLICY.referral.firstPaymentPercent}% of each referred business's first successful payment, and they get ${COMMISSION_POLICY.referral.referredDiscountPercent}% off it.`,
    href: "/referral-program",
    cta: "Get my link",
  },
];

const FAQS = [
  {
    q: "Can I edit or disconnect a channel later?",
    a: "Yes. Go to Connections Hub → click the channel → Edit credentials, Test connection, Reconnect or Disconnect. Your conversation history is preserved.",
  },
  {
    q: "What does my referral link look like?",
    a: "Your branded referral link is generated from the Referral Program page and includes your referral code automatically.",
  },
  {
    q: "When do I receive my referral reward?",
    a: `${COMMISSION_POLICY.referral.firstPaymentPercent}% of the referred business's first successful payment is credited to your wallet after the ${COMMISSION_POLICY.refundWindowDays}-day refund window, unless the payment is refunded or disputed. Renewals do not earn a referral reward.`,
  },
  {
    q: "Who can connect channels for my business?",
    a: "Owner and Admin roles can connect, reconnect or disconnect channels. Other roles can only view status.",
  },
  {
    q: "I didn't receive the 2FA verification email",
    a: "Check spam, then resend from the login page. If the issue persists, contact support — your account may need email confirmation reset.",
  },
];

export const HelpCenterContent = () => {
  const { i18n } = useTranslation();
  const locale = getGuideLocale(i18n.language);
  const isSq = locale === "sq";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Help Center</h1>
          <p className="text-sm text-muted-foreground">
            Your guide to getting the most out of Pulse AI — connect channels, train the AI, and use the Referral Program.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick start (6 steps)</CardTitle>
          <CardDescription>Follow these in order to activate your business in minutes</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.href} className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground flex-1">{s.body}</p>
                <Button asChild size="sm" variant="outline" className="w-fit">
                  <Link to={s.href}>
                    {s.cta} <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isSq ? "Si lidhet çdo kanal" : "How to connect each channel"}</CardTitle>
          <CardDescription>{isSq ? "Hapat, shembujt, gabimet dhe zgjidhjet për çdo integrim" : "Steps, examples, errors and fixes for every integration"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {CHANNEL_GUIDES.map((guide) => {
            const copy = guide.copy[locale];
            return (
              <details id={`channel-${guide.id}`} key={guide.id} className="scroll-mt-24 rounded-md border border-border p-3">
                <summary className="flex cursor-pointer items-center gap-3">
                  <Badge variant="outline" className="w-fit">{guide.name}</Badge>
                  <span className="flex-1 text-sm text-muted-foreground">{copy.summary}</span>
                  <span className="text-xs font-medium text-primary">{isSq ? "Lexo më shumë" : "Read more"}</span>
                </summary>
                <div className="mt-4 grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
                  <section>
                    <h3 className="font-semibold text-foreground">{isSq ? "Çfarë të duhet" : "What you need"}</h3>
                    <ul className="ml-5 mt-1 list-disc space-y-1">{copy.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>
                  <section>
                    <h3 className="font-semibold text-foreground">{isSq ? "Hapat" : "Steps"}</h3>
                    <ol className="ml-5 mt-1 list-decimal space-y-1">{copy.steps.map((item) => <li key={item}>{item}</li>)}</ol>
                  </section>
                  <section className="md:col-span-2">
                    <h3 className="font-semibold text-foreground">{isSq ? "Gabimet dhe zgjidhjet" : "Errors and fixes"}</h3>
                    <ul className="mt-1 space-y-2">{copy.errors.map((item) => <li key={item.error}><strong>{item.error}:</strong> {item.fix}</li>)}</ul>
                  </section>
                  <p className="rounded-md bg-muted/50 p-3 md:col-span-2"><strong>{isSq ? "Siguri:" : "Security:"}</strong> {copy.security}</p>
                  {guide.docsUrl && <a href={guide.docsUrl} target="_blank" rel="noopener noreferrer" className="w-fit text-primary underline">{isSq ? "Dokumentacioni zyrtar" : "Official documentation"}</a>}
                </div>
              </details>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit, reconnect, control your channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>From <strong>Connections Hub</strong> you can at any moment:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong>Test</strong> — verify a channel is online and accepting messages.</li>
            <li><strong>Edit credentials</strong> — replace tokens, API keys, or webhook URLs.</li>
            <li><strong>Reconnect</strong> — restart the OAuth flow if a token expired.</li>
            <li><strong>Disconnect</strong> — temporarily disable without losing history.</li>
            <li><strong>View logs</strong> — see every webhook hit and error in real time.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><Users className="inline h-4 w-4 mr-1" /> Referrals & Co-Management</CardTitle>
          <CardDescription>How referred businesses get help from their referrer</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>If you registered through a referral link, your referrer can act as your <strong>Co-Manager</strong>: they can view your channels, performance and help configure things — but they can never access billing or delete your data.</p>
          <p>You can see and manage who has co-manager access from <Link to="/managed-businesses" className="text-primary underline">Managed Businesses</Link>.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>FAQ</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};
