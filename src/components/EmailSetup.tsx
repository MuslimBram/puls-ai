import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useChannels, ChannelData } from "@/hooks/useChannels";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Mail, CheckCircle2, Loader2, AlertCircle, Shield } from "lucide-react";

const EMPTY_FORM = {
  emailAddress: "",
  imapHost: "",
  imapPort: "993",
  username: "",
  password: "",
  channelName: "",
};

export const EmailSetup = () => {
  const { channels, addChannel } = useChannels();
  const { workspace } = useWorkspace();
  const emailChannels = channels.filter((c) => c.channel_type === "email");

  const [form, setForm] = useState(EMPTY_FORM);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail?: string; error?: string } | null>(null);
  const [verifiedKey, setVerifiedKey] = useState<string | null>(null);

  const currentVerificationKey = useMemo(() => JSON.stringify([
    workspace?.id || "",
    form.imapHost.trim().toLowerCase(),
    form.imapPort.trim(),
    form.username.trim(),
    form.password,
  ]), [workspace?.id, form.imapHost, form.imapPort, form.username, form.password]);

  const updateForm = (patch: Partial<typeof EMPTY_FORM>) => {
    setForm((current) => ({ ...current, ...patch }));
    setTestResult(null);
    setVerifiedKey(null);
  };

  const hasRequiredFields = Boolean(
    workspace?.id
      && form.emailAddress.trim()
      && form.imapHost.trim()
      && form.username.trim()
      && form.password
      && form.imapPort.trim() === "993",
  );

  const handleTestConnection = async () => {
    if (!workspace?.id) {
      toast.error("Select a workspace first");
      return;
    }
    if (!hasRequiredFields) {
      toast.error("Email, IMAP host, username, app password and port 993 are required");
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("verify-email-connection", {
        body: {
          workspace_id: workspace.id,
          imap_host: form.imapHost.trim(),
          imap_port: 993,
          imap_user: form.username.trim(),
          imap_password: form.password,
        },
      });
      if (error) throw new Error(error.message || "IMAP verification failed");
      if (!data?.ok || !data?.verified) throw new Error(data?.error || "IMAP verification failed");

      setVerifiedKey(currentVerificationKey);
      setTestResult({ ok: true, detail: data.detail || "Secure IMAP connection verified" });
      toast.success("IMAP connection verified");
    } catch (error) {
      const message = error instanceof Error ? error.message : "IMAP verification failed";
      setVerifiedKey(null);
      setTestResult({ ok: false, error: message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = () => {
    if (!hasRequiredFields) {
      toast.error("Complete all required IMAP fields first");
      return;
    }
    if (!testResult?.ok || verifiedKey !== currentVerificationKey) {
      toast.error("Verify the current IMAP credentials before connecting");
      return;
    }

    const channelData: ChannelData = {
      channel_type: "email",
      channel_name: form.channelName.trim() || form.emailAddress.trim(),
      settings: {
        email_address: form.emailAddress.trim(),
        connection_type: "imap",
        imap_host: form.imapHost.trim().toLowerCase(),
        imap_port: 993,
        imap_user: form.username.trim(),
        imap_password: form.password,
        imap_tls: true,
        monitoring_active: true,
        verified: true,
        verified_at: new Date().toISOString(),
      },
    };

    addChannel.mutate(channelData, {
      onSuccess: () => {
        setForm(EMPTY_FORM);
        setTestResult(null);
        setVerifiedKey(null);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5 text-primary" />
          Email Channel Setup
        </CardTitle>
        <CardDescription>
          Connect a real IMAP inbox over TLS. Pulse AI verifies the server and credentials before activation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Status:</span>
          {emailChannels.length > 0 ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary">Available for setup</Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Only secure IMAP on port 993 is enabled in this flow. Webhook forwarding and provider OAuth are not advertised until they have a provider-authenticated ingress contract.
        </p>

        {emailChannels.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Connected Email Channels</p>
            {emailChannels.map((channel) => (
              <div key={channel.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                <span className="text-sm text-foreground">{channel.channel_name}</span>
                <Badge variant="default" className="text-xs ml-auto">Monitoring Active</Badge>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Email Address *</Label>
              <Input
                type="email"
                placeholder="inbox@yourbusiness.com"
                value={form.emailAddress}
                onChange={(event) => updateForm({ emailAddress: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Channel Name</Label>
              <Input
                placeholder="Main Inbox"
                value={form.channelName}
                onChange={(event) => updateForm({ channelName: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>IMAP Host *</Label>
              <Input
                placeholder="imap.gmail.com"
                value={form.imapHost}
                onChange={(event) => updateForm({ imapHost: event.target.value })}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Port *</Label>
              <Input
                value={form.imapPort}
                onChange={(event) => updateForm({ imapPort: event.target.value })}
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground">Secure IMAPS only: port 993.</p>
            </div>
            <div className="space-y-1.5">
              <Label>IMAP Username *</Label>
              <Input
                placeholder="your@email.com"
                value={form.username}
                onChange={(event) => updateForm({ username: event.target.value })}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>App Password *</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(event) => updateForm({ password: event.target.value })}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border p-3">
            <Shield className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Verification runs server-side. The app password is encrypted by the canonical channel credential writer and is never returned in browser channel reads.
            </p>
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 text-xs ${testResult.ok ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
              {testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {testResult.ok ? testResult.detail || "Connection verified" : testResult.error || "Connection failed"}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleTestConnection} disabled={testing || !hasRequiredFields}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Test Real IMAP Connection
            </Button>
            <Button
              onClick={handleConnect}
              disabled={addChannel.isPending || !testResult?.ok || verifiedKey !== currentVerificationKey}
            >
              {addChannel.isPending ? "Connecting..." : "Connect Email"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
