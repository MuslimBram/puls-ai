import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChannels } from "@/hooks/useChannels";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, AlertCircle, Loader2, Copy, ArrowRight, ArrowLeft,
  ExternalLink, Shield, Phone, Headphones, Eye, EyeOff, Zap, Settings2,
} from "lucide-react";

// Only Twilio has a verified backend implementation.
// Other providers are listed as Coming Soon — do not claim functionality not implemented.
const VOIP_PROVIDERS = [
  { value: "twilio", label: "Twilio", docsUrl: "https://console.twilio.com/", available: true },
  { value: "vonage", label: "Vonage (Nexmo)", docsUrl: "https://dashboard.nexmo.com/", available: false },
  { value: "plivo", label: "Plivo", docsUrl: "https://console.plivo.com/", available: false },
  { value: "telnyx", label: "Telnyx", docsUrl: "https://portal.telnyx.com/", available: false },
  { value: "custom_sip", label: "Custom SIP Provider", docsUrl: "", available: false },
];

const STEPS = ["Provider", "Credentials", "Webhook", "Verify"] as const;
type Step = (typeof STEPS)[number];

export const TelephonyProviderSetup = () => {
  const { channels } = useChannels();
  const { workspace } = useWorkspace();
  const voipChannel = channels.find((c) => c.channel_type === "voip");

  // Correct Twilio webhook URLs — DO NOT mix up voice and SMS
  const baseUrl = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";
  const TWILIO_WEBHOOKS = {
    voice_inbound:           `${baseUrl}/twilio-inbound-call`,
    voice_status_callback:   `${baseUrl}/twilio-status-callback`,
    sms_inbound:             `${baseUrl}/sms-webhook`,
    voice_ai_relay:          `${baseUrl}/voice-ai-relay`,  // ConversationRelay (voice_ai_enabled=true only)
  };
  const [step, setStep] = useState<Step>("Provider");
  const [provider, setProvider] = useState("");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; detail?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const selectedProvider = VOIP_PROVIDERS.find((p) => p.value === provider);
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-inbound-call`;

  const getCredFields = () => {
    if (provider === "twilio") return [
      { key: "account_sid", label: "Account SID", type: "text" as const, required: true, placeholder: "ACxxxxxxxx" },
      { key: "auth_token", label: "Auth Token", type: "password" as const, required: true, placeholder: "Your auth token" },
      { key: "twiml_app_sid", label: "TwiML App SID", type: "text" as const, required: false, placeholder: "APxxxxxxxx", help: "Required for browser-based calling" },
      { key: "api_key_sid", label: "API Key SID (for WebRTC)", type: "text" as const, required: false, placeholder: "SKxxxxxxxx", help: "Twilio API Key SID — required for browser calling. Create at console.twilio.com/project/api-keys" },
      { key: "api_key_secret", label: "API Key Secret (for WebRTC)", type: "password" as const, required: false, placeholder: "Your API Key Secret", help: "Never shown after saving. Required for browser calling." },
      { key: "phone_number", label: "Phone Number", type: "text" as const, required: true, placeholder: "+1234567890" },
    ];
    if (provider === "custom_sip") return [
      { key: "sip_server", label: "SIP Server", type: "text" as const, required: true, placeholder: "sip.provider.com" },
      { key: "sip_port", label: "SIP Port", type: "text" as const, required: false, placeholder: "5060" },
      { key: "sip_username", label: "SIP Username", type: "text" as const, required: true, placeholder: "your_username" },
      { key: "sip_password", label: "SIP Password", type: "password" as const, required: true, placeholder: "••••••••" },
      { key: "sip_domain", label: "SIP Domain", type: "text" as const, required: false, placeholder: "sip.provider.com" },
      { key: "caller_id", label: "Caller ID Number", type: "text" as const, required: true, placeholder: "+1234567890" },
    ];
    // Generic for vonage, plivo, telnyx
    return [
      { key: "api_key", label: "API Key", type: "text" as const, required: true, placeholder: "Your API key" },
      { key: "api_secret", label: "API Secret", type: "password" as const, required: true, placeholder: "Your API secret" },
      { key: "phone_number", label: "Phone Number", type: "text" as const, required: true, placeholder: "+1234567890" },
    ];
  };

  const canNext = () => {
    if (step === "Provider") return !!provider;
    if (step === "Credentials") return getCredFields().filter((f) => f.required).every((f) => creds[f.key]?.trim());
    return true;
  };

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };
  const goBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // SECURITY: Credentials saved and verified server-side via Edge Function.
      // Encrypted with TOKEN_ENCRYPTION_KEY before storage.
      // Frontend NEVER calls Twilio API directly or stores raw secrets.
      if (!workspace?.id) throw new Error("Select a workspace before connecting telephony.");
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) throw new Error("Not authenticated");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-channel-credentials`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action: "save",
            workspace_id: workspace.id,
            provider,
            channel_type: "voip",
            account_sid:    creds.account_sid,
            auth_token:     creds.auth_token,
            phone_number:   creds.phone_number,
            twiml_app_sid:  creds.twiml_app_sid,
            api_key_sid:    creds.api_key_sid,
            api_key_secret: creds.api_key_secret,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.detail ?? result.error ?? "Failed to save");
      setVerifyResult({ ok: true, detail: result.verification_detail ?? "Verified" });
      setDone(true);
      toast.success("Twilio credentials saved and verified securely");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save configuration";
      toast.error(msg);
      setVerifyResult({ ok: false, detail: msg });
    } finally {
      setSaving(false);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  if (done || voipChannel) {
    const settings = (voipChannel?.settings as Record<string, string>) || creds;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Headphones className="h-5 w-5 text-primary" />
            Telephony Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--chart-2))]/10">
              <CheckCircle2 className="h-5 w-5 text-[hsl(var(--chart-2))]" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {settings.provider_label || settings.provider || "VoIP"} Connected
              </p>
              <p className="text-xs text-muted-foreground">
                Phone: {settings.phone_number || settings.caller_id || "Configured"}
              </p>
            </div>
            <Badge variant="default" className="ml-auto gap-1">
              <CheckCircle2 className="h-3 w-3" /> Active
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setDone(false); setStep("Provider"); }}
            className="text-xs"
          >
            <Settings2 className="h-3 w-3 mr-1" /> Reconfigure
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Headphones className="h-5 w-5 text-primary" />
          Connect Telephony Provider
        </CardTitle>
        <CardDescription>
          Connect your own VoIP/SIP provider to enable inbound and outbound calling for your business.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {i < stepIndex ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </div>
              <span className={cn(
                "text-xs hidden sm:inline",
                i <= stepIndex ? "text-foreground font-medium" : "text-muted-foreground"
              )}>{s}</span>
              {i < STEPS.length - 1 && (
                <div className={cn("flex-1 h-0.5 mx-1", i < stepIndex ? "bg-primary" : "bg-border")} />
              )}
            </div>
          ))}
        </div>

        {/* Step: Provider */}
        {step === "Provider" && (
          <div className="space-y-3">
            <Label>Select your VoIP provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue placeholder="Choose a provider..." /></SelectTrigger>
              <SelectContent>
                {VOIP_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProvider?.docsUrl && (
              <a
                href={selectedProvider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary hover:bg-primary/10 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="font-medium">Open {selectedProvider.label} Dashboard →</span>
              </a>
            )}
          </div>
        )}

        {/* Step: Credentials */}
        {step === "Credentials" && (
          <div className="space-y-3 pt-2">
            <div className="rounded-lg border p-3 bg-primary/5 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm">
                <strong>Professional</strong> mode — full provider integration
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter your {selectedProvider?.label} credentials. These are stored securely in your workspace only.
            </p>
            {getCredFields().map((field) => (
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
                {"help" in field && field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Step: Webhook */}
        {step === "Webhook" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Webhook URL</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure this URL in your {selectedProvider?.label} dashboard for call status callbacks.
              </p>
              <div className="flex items-center gap-2 rounded-md bg-background border border-border p-2">
                <code className="text-xs text-muted-foreground break-all flex-1">{webhookUrl}</code>
                <Button size="sm" variant="ghost" onClick={copyWebhook}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" /> Security
              </p>
              <p className="text-xs text-muted-foreground">
                Credentials are encrypted and scoped to your business workspace. Admins have view-only oversight.
              </p>
            </div>
          </div>
        )}

        {/* Step: Verify */}
        {step === "Verify" && (
          <div className="text-center py-4 space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              {saving ? (
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              ) : verifyResult?.ok ? (
                <CheckCircle2 className="h-7 w-7 text-[hsl(var(--chart-2))]" />
              ) : verifyResult ? (
                <AlertCircle className="h-7 w-7 text-destructive" />
              ) : (
                <Phone className="h-7 w-7 text-primary" />
              )}
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {saving ? "Verifying..." : verifyResult?.ok ? "Connection verified!" : verifyResult ? "Failed" : "Ready to verify"}
            </h3>
            {verifyResult?.detail && (
              <p className={cn("text-xs", verifyResult.ok ? "text-[hsl(var(--chart-2))]" : "text-destructive")}>
                {verifyResult.detail}
              </p>
            )}
            {!saving && !verifyResult?.ok && (
              <Button onClick={handleSave} disabled={saving} size="sm">
                <Zap className="h-3.5 w-3.5 mr-1" />
                Verify & Save
              </Button>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={goBack} disabled={stepIndex === 0}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
          {step !== "Verify" && (
            <Button size="sm" onClick={goNext} disabled={!canNext()}>
              Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
