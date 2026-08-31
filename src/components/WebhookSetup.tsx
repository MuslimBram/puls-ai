import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useChannels, ChannelData } from "@/hooks/useChannels";
import { toast } from "@/components/ui/sonner";
import { Webhook, CheckCircle2, Copy, Loader2, AlertCircle, RefreshCw, Send } from "lucide-react";

const EXAMPLE_PAYLOAD = `{
  "event_id": "evt_unique_from_your_system",
  "source_name": "My CRM",
  "sender_name": "John Doe",
  "sender_identifier": "john@example.com",
  "message_content": "I'm interested in your premium plan.",
  "timestamp": "2026-03-11T10:00:00Z",
  "metadata": { "source": "contact_form" }
}`;

const SIGNING_INSTRUCTIONS = `Headers:
X-Webhook-Timestamp: <unix-seconds>
X-Webhook-Event-Id: <same value as body.event_id>
X-Webhook-Signature: v1=<hex-hmac-sha256>

Signing payload (exact bytes):
<timestamp>.<event_id>.<raw JSON body>

HMAC key: your webhook secret
Replay window: 5 minutes`;

function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return Array.from(signed, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const WebhookSetup = () => {
  const { channels, addChannel } = useChannels();
  const webhookChannels = channels.filter((c) => c.channel_type === "custom_webhook");
  const existingWebhook = webhookChannels[0];

  const [channelName, setChannelName] = useState("");
  const [testPayload, setTestPayload] = useState(EXAMPLE_PAYLOAD);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; matched?: number; leadId?: string; duplicate?: boolean } | null>(null);
  const [sessionSecret, setSessionSecret] = useState<string | null>(null);
  const [sessionChannelId, setSessionChannelId] = useState<string | null>(null);

  const channelId = sessionChannelId || existingWebhook?.id || null;
  const webhookBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-ingest`;
  const webhookUrl = channelId
    ? `${webhookBaseUrl}?channel_id=${encodeURIComponent(channelId)}`
    : webhookBaseUrl;

  const copyUrl = () => {
    if (!channelId) {
      toast.error("Connect the webhook first to generate its channel-bound endpoint.");
      return;
    }
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  const copySecret = () => {
    if (!sessionSecret) {
      toast.error("The stored secret is never read back. Rotate it to reveal a new secret.");
      return;
    }
    navigator.clipboard.writeText(sessionSecret);
    toast.success("Secret copied");
  };

  const copyPayload = () => {
    navigator.clipboard.writeText(EXAMPLE_PAYLOAD);
    toast.success("Example payload copied");
  };

  const copySigning = () => {
    navigator.clipboard.writeText(SIGNING_INSTRUCTIONS);
    toast.success("Signing instructions copied");
  };

  const saveWebhookSecret = (secret: string, name: string) => {
    const channelData: ChannelData = {
      channel_type: "custom_webhook",
      channel_name: name,
      settings: {
        webhook_url: webhookBaseUrl,
        webhook_secret: secret,
        signature_version: "v1",
        configured: true,
      },
    };

    addChannel.mutate(channelData, {
      onSuccess: (data) => {
        setSessionSecret(secret);
        setSessionChannelId(data.channel_id);
        setChannelName("");
        setTestResult(null);
        toast.success("Webhook signing secret saved securely. Copy it now; it will not be shown again after reload.");
      },
    });
  };

  const handleConnect = () => {
    const name = channelName.trim() || existingWebhook?.channel_name || "Custom Webhook";
    saveWebhookSecret(generateWebhookSecret(), name);
  };

  const handleRotateSecret = () => {
    const name = existingWebhook?.channel_name || channelName.trim() || "Custom Webhook";
    saveWebhookSecret(generateWebhookSecret(), name);
  };

  const handleTestWebhook = async () => {
    setTestSending(true);
    setTestResult(null);
    try {
      if (!channelId) throw new Error("Connect the webhook first.");
      if (!sessionSecret) throw new Error("Rotate the webhook secret before testing from this browser session.");

      const parsed = JSON.parse(testPayload) as Record<string, unknown>;
      const eventId = `ui_test_${crypto.randomUUID()}`;
      parsed.event_id = eventId;
      const rawBody = JSON.stringify(parsed);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signingPayload = `${timestamp}.${eventId}.${rawBody}`;
      const signature = await hmacSha256Hex(sessionSecret, signingPayload);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Timestamp": timestamp,
          "X-Webhook-Event-Id": eventId,
          "X-Webhook-Signature": `v1=${signature}`,
        },
        body: rawBody,
      });
      const data = await response.json() as {
        error?: string;
        matched?: number;
        lead_id?: string | null;
        duplicate?: boolean;
      };
      if (!response.ok) throw new Error(data.error || `Webhook returned ${response.status}`);

      setTestResult({
        ok: true,
        matched: data.matched,
        leadId: data.lead_id || undefined,
        duplicate: data.duplicate,
      });
      toast.success(data.duplicate ? "Duplicate event was safely ignored." : `Signed test sent! ${data.matched || 0} keywords matched.`);
    } catch (error: unknown) {
      setTestResult({ ok: false });
      toast.error(error instanceof Error ? error.message : "Invalid payload or test failed");
    } finally {
      setTestSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Webhook className="h-5 w-5 text-primary" />
          Custom Webhook Setup
        </CardTitle>
        <CardDescription>
          Receive lead and message data through a workspace-bound webhook with timestamped HMAC-SHA256 request signing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Status:</span>
          {existingWebhook || sessionChannelId ? (
            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Live</Badge>
          ) : (
            <Badge variant="secondary">Available for setup</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Every request must use the channel-bound endpoint, a unique event_id, a current Unix timestamp, and an HMAC-SHA256 v1 signature. Workspace and user identity are always resolved server-side from the channel.
        </p>

        {webhookChannels.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Connected Webhooks</p>
            {webhookChannels.map((ch) => (
              <div key={ch.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                <span className="text-sm text-foreground">{ch.channel_name}</span>
                <Badge variant="default" className="text-xs ml-auto">Active</Badge>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="space-y-1.5">
            <Label>Channel Name</Label>
            <Input
              placeholder="e.g. CRM Webhook, Contact Form"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              disabled={Boolean(existingWebhook)}
            />
          </div>

          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-foreground">Webhook Endpoint</p>
              <Button size="sm" variant="ghost" onClick={copyUrl} disabled={!channelId}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <code className="text-xs text-muted-foreground break-all">
              {channelId ? webhookUrl : "Connect the webhook to generate a channel-bound endpoint."}
            </code>
          </div>

          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-medium text-foreground">Webhook Signing Secret</p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={copySecret} disabled={!sessionSecret}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
                {channelId && (
                  <Button size="sm" variant="ghost" onClick={handleRotateSecret} disabled={addChannel.isPending}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Rotate
                  </Button>
                )}
              </div>
            </div>
            <code className="text-xs text-muted-foreground break-all">
              {sessionSecret || (channelId ? "Stored encrypted — rotate to reveal a new secret once." : "Created when you connect the webhook.")}
            </code>
            <p className="text-xs text-muted-foreground mt-1">
              Use this key to compute HMAC-SHA256. Never send the secret itself in a request header.
            </p>
          </div>

          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-foreground">HMAC v1 Signing Contract</p>
              <Button size="sm" variant="ghost" onClick={copySigning}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <pre className="text-xs text-muted-foreground bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {SIGNING_INSTRUCTIONS}
            </pre>
          </div>

          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-foreground">Example Payload</p>
              <Button size="sm" variant="ghost" onClick={copyPayload}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <pre className="text-xs text-muted-foreground bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {EXAMPLE_PAYLOAD}
            </pre>
          </div>

          <div className="space-y-1.5">
            <Label>Test Payload</Label>
            <Textarea
              rows={6}
              className="font-mono text-xs"
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
            />
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 text-xs ${testResult.ok ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
              {testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {testResult.ok
                ? testResult.duplicate
                  ? "Test passed — duplicate safely ignored"
                  : `Test passed — ${testResult.matched || 0} keywords matched${testResult.leadId ? ", lead created" : ""}`
                : "Test failed — check the endpoint, signing secret, timestamp and payload"}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleTestWebhook} disabled={testSending || !channelId || !sessionSecret}>
              {testSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Send Signed Test
            </Button>
            {!channelId && (
              <Button onClick={handleConnect} disabled={addChannel.isPending}>
                {addChannel.isPending ? "Connecting..." : "Connect Webhook"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
