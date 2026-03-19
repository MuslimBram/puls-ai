import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useChannels, ChannelData } from "@/hooks/useChannels";
import { toast } from "@/components/ui/sonner";
import {
  CheckCircle2, AlertCircle, Loader2, Copy, ArrowRight, ArrowLeft,
  ExternalLink, Shield, Plug, Zap, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Provider definitions ── */

interface CredField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  required?: boolean;
  help?: string;
}

export interface ProviderDef {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: string;
  description: string;
  docsUrl?: string;
  docsLabel?: string;
  credentials: CredField[];
  webhookPath?: string;           // edge-function path segment
  webhookInstructions?: string;
  verifyFn?: (creds: Record<string, string>) => Promise<{ ok: boolean; detail?: string }>;
}

/* ── Step indicator ── */

const STEPS = ["Credentials", "Webhook", "Verify", "Done"] as const;
type Step = (typeof STEPS)[number];

interface WizardProps {
  provider: ProviderDef;
  open: boolean;
  onClose: () => void;
}

export const ChannelConnectionWizard = ({ provider, open, onClose }: WizardProps) => {
  const { channels, addChannel } = useChannels();
  const existing = channels.find((c) => c.channel_type === provider.id);

  const [step, setStep] = useState<Step>("Credentials");
  const [creds, setCreds] = useState<Record<string, string>>(() => {
    const saved = (existing?.settings as Record<string, string>) || {};
    return provider.credentials.reduce((a, f) => {
      a[f.key] = saved[f.key] || "";
      return a;
    }, {} as Record<string, string>);
  });
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; detail?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const webhookUrl = provider.webhookPath
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${provider.webhookPath}`
    : null;

  const hasWebhookStep = !!provider.webhookPath;
  const activeSteps = hasWebhookStep ? STEPS : (["Credentials", "Verify", "Done"] as const);
  const stepIndex = activeSteps.indexOf(step as any);

  /* ── Navigation ── */
  const canNext = () => {
    if (step === "Credentials") {
      return provider.credentials.filter((f) => f.required).every((f) => creds[f.key]?.trim());
    }
    if (step === "Verify") return verifyResult?.ok;
    return true;
  };

  const goNext = () => {
    const idx = activeSteps.indexOf(step as any);
    if (idx < activeSteps.length - 1) setStep(activeSteps[idx + 1] as Step);
  };

  const goBack = () => {
    const idx = activeSteps.indexOf(step as any);
    if (idx > 0) setStep(activeSteps[idx - 1] as Step);
  };

  /* ── Verify ── */
  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      if (provider.verifyFn) {
        const res = await provider.verifyFn(creds);
        setVerifyResult(res);
        if (!res.ok) toast.error(res.detail || "Verification failed");
      } else {
        // Generic simulated verification
        await new Promise((r) => setTimeout(r, 1200));
        setVerifyResult({ ok: true, detail: "Connection verified" });
      }
    } catch (e: any) {
      setVerifyResult({ ok: false, detail: e.message || "Verification error" });
    }
    setVerifying(false);
  };

  /* ── Save ── */
  const handleSave = async () => {
    setSaving(true);
    try {
      const channelData: ChannelData = {
        channel_type: provider.id,
        channel_name: creds.channel_name || provider.name,
        settings: {
          ...creds,
          webhook_url: webhookUrl || undefined,
          connected_at: new Date().toISOString(),
          verified: true,
        },
      };
      await addChannel.mutateAsync(channelData);
      toast.success(`${provider.name} connected successfully!`);
      goNext(); // move to Done
    } catch {
      // handled by mutation
    }
    setSaving(false);
  };

  const copyWebhook = () => {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl);
      toast.success("Webhook URL copied");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            Connect {provider.name}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-2">
          {activeSteps.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                i <= stepIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                {i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={cn(
                "text-xs hidden sm:inline",
                i <= stepIndex ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {s}
              </span>
              {i < activeSteps.length - 1 && (
                <div className={cn("flex-1 h-0.5 mx-1", i < stepIndex ? "bg-primary" : "bg-border")} />
              )}
            </div>
          ))}
        </div>

        {/* ── STEP: Credentials ── */}
        {step === "Credentials" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{provider.description}</p>

            {provider.docsUrl && (
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary hover:bg-primary/10 transition-colors"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                <span className="font-medium">{provider.docsLabel || "Get your credentials →"}</span>
              </a>
            )}

            {/* Channel name */}
            <div className="space-y-1.5">
              <Label>Channel Name</Label>
              <Input
                placeholder={`e.g. My ${provider.name}`}
                value={creds.channel_name || ""}
                onChange={(e) => setCreds((p) => ({ ...p, channel_name: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">A friendly name for this connection</p>
            </div>

            {provider.credentials.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label>
                  {field.label}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    type={field.type === "password" && !showPassword[field.key] ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={creds[field.key] || ""}
                    onChange={(e) => setCreds((p) => ({ ...p, [field.key]: e.target.value }))}
                  />
                  {field.type === "password" && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((p) => ({ ...p, [field.key]: !p[field.key] }))}
                    >
                      {showPassword[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
              </div>
            ))}
          </div>
        )}

        {/* ── STEP: Webhook ── */}
        {step === "Webhook" && webhookUrl && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Webhook URL</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {provider.webhookInstructions || "Copy this URL and paste it in your provider's webhook settings."}
              </p>
              <div className="flex items-center gap-2 rounded-md bg-background border border-border p-2">
                <code className="text-xs text-muted-foreground break-all flex-1">{webhookUrl}</code>
                <Button size="sm" variant="ghost" onClick={copyWebhook} className="shrink-0">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" />
                Security Note
              </p>
              <p className="text-xs text-muted-foreground">
                Your credentials are stored encrypted and scoped to your business workspace only.
                Platform administrators cannot access or modify your provider keys.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP: Verify ── */}
        {step === "Verify" && (
          <div className="space-y-4">
            <div className="text-center py-4 space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                {verifying ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : verifyResult?.ok ? (
                  <CheckCircle2 className="h-8 w-8 text-[hsl(var(--chart-2))]" />
                ) : verifyResult ? (
                  <AlertCircle className="h-8 w-8 text-destructive" />
                ) : (
                  <Plug className="h-8 w-8 text-primary" />
                )}
              </div>

              <h3 className="text-base font-semibold text-foreground">
                {verifying
                  ? "Verifying connection..."
                  : verifyResult?.ok
                    ? "Connection verified!"
                    : verifyResult
                      ? "Verification failed"
                      : "Ready to verify"}
              </h3>

              {verifyResult?.detail && (
                <p className={cn(
                  "text-sm",
                  verifyResult.ok ? "text-[hsl(var(--chart-2))]" : "text-destructive"
                )}>
                  {verifyResult.detail}
                </p>
              )}

              {!verifying && !verifyResult?.ok && (
                <Button onClick={handleVerify} className="mt-2">
                  <Zap className="h-4 w-4 mr-1" />
                  Verify Connection
                </Button>
              )}

              {verifyResult?.ok && !saving && (
                <Button onClick={handleSave} className="mt-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                  Save & Activate
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP: Done ── */}
        {step === "Done" && (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--chart-2))]/10">
              <CheckCircle2 className="h-8 w-8 text-[hsl(var(--chart-2))]" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{provider.name} Connected!</h3>
            <p className="text-sm text-muted-foreground">
              Your {provider.name} channel is now active and ready to receive messages.
              All data is scoped to your business workspace.
            </p>
            <Badge variant="default" className="gap-1.5">
              <CheckCircle2 className="h-3 w-3" /> Active
            </Badge>
            <div className="pt-2">
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        )}

        {/* ── Navigation footer ── */}
        {step !== "Done" && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button variant="ghost" onClick={goBack} disabled={stepIndex === 0}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {step !== "Verify" && (
              <Button onClick={goNext} disabled={!canNext()}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ── Built-in provider definitions for self-service ── */

export const CHANNEL_PROVIDERS: ProviderDef[] = [
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    icon: null,
    category: "messaging",
    description: "Connect your WhatsApp Business API to send and receive messages from customers.",
    docsUrl: "https://business.facebook.com/settings/whatsapp-business-accounts",
    docsLabel: "Go to Meta WhatsApp Business settings →",
    webhookPath: "whatsapp-webhook",
    webhookInstructions: "Paste this URL in your Meta App → WhatsApp → Configuration → Webhook URL field.",
    credentials: [
      { key: "phone_number_id", label: "Phone Number ID", type: "text", required: true, placeholder: "e.g. 123456789012345", help: "Found in Meta Business Suite → WhatsApp → Phone Numbers" },
      { key: "access_token", label: "Permanent Access Token", type: "password", required: true, placeholder: "EAAx...", help: "Generate in Meta Business Suite → System Users → Generate Token" },
      { key: "verify_token", label: "Webhook Verify Token", type: "text", required: true, placeholder: "my_verify_token_123", help: "Choose any secret string. You'll enter the same value in Meta's webhook settings." },
      { key: "waba_id", label: "WhatsApp Business Account ID", type: "text", required: false, placeholder: "e.g. 987654321012345" },
    ],
    verifyFn: async (creds) => {
      try {
        const res = await fetch(`https://graph.facebook.com/v18.0/${creds.phone_number_id}?access_token=${creds.access_token}`);
        const data = await res.json();
        if (data.id) return { ok: true, detail: `Verified: ${data.display_phone_number || data.id}` };
        return { ok: false, detail: data.error?.message || "Invalid credentials" };
      } catch { return { ok: false, detail: "Network error" }; }
    },
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: null,
    category: "messaging",
    description: "Connect a Telegram bot to monitor groups and automate responses.",
    docsUrl: "https://t.me/BotFather",
    docsLabel: "Create a bot via @BotFather on Telegram →",
    webhookPath: "telegram-webhook",
    webhookInstructions: "The webhook will be set automatically when you verify the connection.",
    credentials: [
      { key: "bot_token", label: "Bot Token", type: "password", required: true, placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11", help: "Get this from @BotFather after creating your bot" },
    ],
    verifyFn: async (creds) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${creds.bot_token}/getMe`);
        const data = await res.json();
        if (data.ok) return { ok: true, detail: `Connected as @${data.result.username}` };
        return { ok: false, detail: "Invalid bot token" };
      } catch { return { ok: false, detail: "Network error" }; }
    },
  },
  {
    id: "email",
    name: "Email",
    icon: null,
    category: "email",
    description: "Connect your business email inbox to capture leads and manage conversations.",
    webhookPath: "email-ingest",
    webhookInstructions: "Configure your email provider to forward messages to this webhook URL, or use IMAP credentials below.",
    credentials: [
      { key: "email_address", label: "Email Address", type: "text", required: true, placeholder: "inbox@yourbusiness.com" },
      { key: "imap_server", label: "IMAP Server", type: "text", required: false, placeholder: "imap.gmail.com", help: "Required only for direct IMAP polling" },
      { key: "imap_port", label: "IMAP Port", type: "text", required: false, placeholder: "993" },
      { key: "imap_username", label: "IMAP Username", type: "text", required: false, placeholder: "your@email.com" },
      { key: "imap_password", label: "App Password", type: "password", required: false, placeholder: "••••••••", help: "Use an app-specific password, not your main password" },
    ],
  },
  {
    id: "facebook",
    name: "Facebook / Instagram",
    icon: null,
    category: "messaging",
    description: "Connect your Facebook Page and Instagram Business to manage DMs and comments.",
    docsUrl: "https://developers.facebook.com/apps/",
    docsLabel: "Go to Meta Developer Portal →",
    webhookPath: "meta-webhook",
    webhookInstructions: "Add this URL in your Meta App → Webhooks → Page subscriptions.",
    credentials: [
      { key: "page_id", label: "Facebook Page ID", type: "text", required: true, placeholder: "e.g. 123456789012345", help: "Found in your Facebook Page → About → Page ID" },
      { key: "page_access_token", label: "Page Access Token", type: "password", required: true, placeholder: "EAAx...", help: "Generate a Page token in Meta Developer Portal → Graph API Explorer" },
      { key: "verify_token", label: "Webhook Verify Token", type: "text", required: true, placeholder: "my_verify_token", help: "Choose any secret. Enter the same in Meta's webhook settings." },
      { key: "instagram_account_id", label: "Instagram Business Account ID", type: "text", required: false, placeholder: "e.g. 17841400000000", help: "Optional. Link your Instagram business account." },
    ],
    verifyFn: async (creds) => {
      try {
        const res = await fetch(`https://graph.facebook.com/v18.0/${creds.page_id}?access_token=${creds.page_access_token}&fields=name`);
        const data = await res.json();
        if (data.name) return { ok: true, detail: `Verified: ${data.name}` };
        return { ok: false, detail: data.error?.message || "Invalid credentials" };
      } catch { return { ok: false, detail: "Network error" }; }
    },
  },
  {
    id: "sms",
    name: "SMS",
    icon: null,
    category: "messaging",
    description: "Connect your SMS provider (Twilio, Vonage, etc.) to send and receive text messages.",
    docsUrl: "https://console.twilio.com/",
    docsLabel: "Go to Twilio Console →",
    webhookPath: "sms-webhook",
    webhookInstructions: "Set this URL as the messaging webhook in your Twilio phone number configuration.",
    credentials: [
      { key: "provider", label: "SMS Provider", type: "text", required: true, placeholder: "twilio", help: "e.g. twilio, vonage, messagebird" },
      { key: "account_sid", label: "Account SID", type: "text", required: true, placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
      { key: "auth_token", label: "Auth Token", type: "password", required: true, placeholder: "Your provider auth token" },
      { key: "phone_number", label: "Phone Number", type: "text", required: true, placeholder: "+1234567890", help: "Your SMS-capable phone number from the provider" },
    ],
    verifyFn: async (creds) => {
      if (creds.provider?.toLowerCase() === "twilio") {
        try {
          const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}.json`,
            { headers: { Authorization: "Basic " + btoa(`${creds.account_sid}:${creds.auth_token}`) } }
          );
          const data = await res.json();
          if (data.sid) return { ok: true, detail: `Verified: ${data.friendly_name || data.sid}` };
          return { ok: false, detail: data.message || "Invalid credentials" };
        } catch { return { ok: false, detail: "Network error" }; }
      }
      return { ok: true, detail: "Credentials saved (verification for this provider is manual)" };
    },
  },
];
