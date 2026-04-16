import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
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
    title: "6. Earn from referrals",
    body: "Share your referral link from the Referral Program page. You earn 15% every time someone purchases a package.",
    href: "/referral-program",
    cta: "Get my link",
  },
];

const CHANNEL_GUIDE = [
  {
    name: "Telegram",
    how: "Create a bot via @BotFather, copy the token, paste it in Connections Hub → Telegram.",
  },
  {
    name: "WhatsApp (Twilio)",
    how: "Create a Twilio account, copy Account SID + Auth Token, add WhatsApp sender, then paste credentials in Connections Hub.",
  },
  {
    name: "Instagram / Facebook",
    how: "Click 'Connect with Meta' in Connections Hub. You'll be redirected to Meta to approve permissions.",
  },
  {
    name: "Email",
    how: "Add your sending domain in Branding → Email Domain, verify DNS records, then enable email channel.",
  },
  {
    name: "Website Chat",
    how: "Copy the snippet from Connections Hub → Website Chat and paste it before </body> on your site.",
  },
];

const FAQS = [
  {
    q: "Can I edit or disconnect a channel later?",
    a: "Yes. Go to Connections Hub → click the channel → Edit credentials, Test connection, Reconnect or Disconnect. Your conversation history is preserved.",
  },
  {
    q: "What does my referral link look like?",
    a: "All referral links use https://kohablerjeve.top/register?ref=YOUR_CODE — branded and trackable. Generate yours from the Referral Program page.",
  },
  {
    q: "When do I receive my referral reward?",
    a: "You earn 15% the moment your referred user purchases any paid package. The reward is credited to your wallet automatically.",
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
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Help Center</h1>
          <p className="text-sm text-muted-foreground">
            Your guide to getting the most out of Pulse AI — connect channels, train the AI, and start earning.
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
          <CardTitle>How to connect each channel</CardTitle>
          <CardDescription>Step-by-step for every supported integration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {CHANNEL_GUIDE.map((c) => (
            <div key={c.name} className="flex flex-col gap-1 rounded-md border border-border p-3 md:flex-row md:items-center md:gap-4">
              <Badge variant="outline" className="w-fit">{c.name}</Badge>
              <p className="text-sm text-muted-foreground flex-1">{c.how}</p>
            </div>
          ))}
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
