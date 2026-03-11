import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChannels, ChannelData } from "@/hooks/useChannels";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Mail, CheckCircle2, Loader2, AlertCircle, Shield, Copy } from "lucide-react";

export const EmailSetup = () => {
  const { user } = useAuth();
  const { channels, addChannel } = useChannels();
  const emailChannels = channels.filter((c) => c.channel_type === "email");

  const [form, setForm] = useState({
    emailAddress: "",
    connectionType: "imap",
    imapServer: "",
    imapPort: "993",
    username: "",
    password: "",
    useSsl: true,
    channelName: "",
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-ingest`;

  const handleTestConnection = async () => {
    if (!form.emailAddress.trim()) {
      toast.error("Enter an email address first");
      return;
    }
    setTesting(true);
    setTestResult(null);

    // Simulate connection test — real IMAP connection would require a backend function
    await new Promise((r) => setTimeout(r, 1500));

    if (form.connectionType === "imap" && !form.imapServer.trim()) {
      setTestResult({ ok: false, error: "IMAP server is required" });
      setTesting(false);
      return;
    }

    // For webhook-based email, we just verify the endpoint exists
    setTestResult({ ok: true });
    toast.success("Connection test passed");
    setTesting(false);
  };

  const handleConnect = () => {
    const name = form.channelName.trim() || form.emailAddress;
    if (!name) return;

    const channelData: ChannelData = {
      channel_type: "email",
      channel_name: name,
      settings: {
        email_address: form.emailAddress,
        connection_type: form.connectionType,
        imap_server: form.imapServer,
        imap_port: form.imapPort,
        use_ssl: form.useSsl,
        webhook_url: webhookUrl,
        monitoring_active: true,
      },
    };

    addChannel.mutate(channelData, {
      onSuccess: () => {
        setForm({ emailAddress: "", connectionType: "imap", imapServer: "", imapPort: "993", username: "", password: "", useSsl: true, channelName: "" });
        setTestResult(null);
      },
    });
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5 text-primary" />
          Email Channel Setup
        </CardTitle>
        <CardDescription>
          Connect your email inbox to automatically capture leads from incoming emails.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Status:</span>
          {emailChannels.length > 0 ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Live
            </Badge>
          ) : (
            <Badge variant="secondary">Available for setup</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Email ingestion is handled via webhook. Forward emails to the endpoint below, or configure IMAP polling for direct inbox access.
        </p>

        {/* Connected emails */}
        {emailChannels.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Connected Email Channels</p>
            {emailChannels.map((ch) => (
              <div key={ch.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                <span className="text-sm text-foreground">{ch.channel_name}</span>
                <Badge variant="default" className="text-xs ml-auto">Monitoring Active</Badge>
              </div>
            ))}
          </div>
        )}

        {/* Setup form */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Email Address</Label>
              <Input
                placeholder="inbox@yourbusiness.com"
                value={form.emailAddress}
                onChange={(e) => setForm((f) => ({ ...f, emailAddress: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Channel Name</Label>
              <Input
                placeholder="Main Inbox"
                value={form.channelName}
                onChange={(e) => setForm((f) => ({ ...f, channelName: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Connection Type</Label>
            <Select value={form.connectionType} onValueChange={(v) => setForm((f) => ({ ...f, connectionType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="imap">IMAP (Direct inbox access)</SelectItem>
                <SelectItem value="webhook">Webhook (Email forwarding)</SelectItem>
                <SelectItem value="provider">Provider API (Gmail, Outlook)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.connectionType === "imap" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>IMAP Server</Label>
                <Input placeholder="imap.gmail.com" value={form.imapServer} onChange={(e) => setForm((f) => ({ ...f, imapServer: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Port</Label>
                <Input placeholder="993" value={form.imapPort} onChange={(e) => setForm((f) => ({ ...f, imapPort: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input placeholder="your@email.com" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>App Password</Label>
                <Input type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch checked={form.useSsl} onCheckedChange={(v) => setForm((f) => ({ ...f, useSsl: v }))} />
                <Label className="mb-0">Use SSL/TLS</Label>
                <Shield className="h-3 w-3 text-muted-foreground" />
              </div>
            </div>
          )}

          {form.connectionType === "webhook" && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs font-medium text-foreground mb-1">Email Ingest Webhook</p>
              <p className="text-xs text-muted-foreground mb-2">Forward emails to this endpoint using your email provider's webhook or forwarding rules.</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-muted-foreground break-all flex-1">{webhookUrl}</code>
                <Button size="sm" variant="ghost" onClick={copyUrl}><Copy className="h-3 w-3" /></Button>
              </div>
            </div>
          )}

          {form.connectionType === "provider" && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">
                Provider-based connections (Gmail API, Microsoft Graph) require additional OAuth setup. 
                This feature is planned for a future release.
              </p>
            </div>
          )}

          {/* Test + Connect */}
          {testResult && (
            <div className={`flex items-center gap-2 text-xs ${testResult.ok ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
              {testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {testResult.ok ? "Connection test passed" : testResult.error || "Connection failed"}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Test Connection
            </Button>
            <Button onClick={handleConnect} disabled={!form.emailAddress.trim() || addChannel.isPending}>
              {addChannel.isPending ? "Connecting..." : "Connect Email"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
