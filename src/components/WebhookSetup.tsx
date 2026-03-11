import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useChannels, ChannelData } from "@/hooks/useChannels";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Webhook, CheckCircle2, Copy, Loader2, AlertCircle, RefreshCw, Send } from "lucide-react";

const EXAMPLE_PAYLOAD = `{
  "user_id": "YOUR_USER_ID",
  "channel_type": "custom_webhook",
  "source_name": "My CRM",
  "sender_name": "John Doe",
  "sender_identifier": "john@example.com",
  "message_content": "I'm interested in your premium plan.",
  "timestamp": "2026-03-11T10:00:00Z",
  "metadata": { "source": "contact_form" }
}`;

export const WebhookSetup = () => {
  const { user } = useAuth();
  const { channels, addChannel } = useChannels();
  const webhookChannels = channels.filter((c) => c.channel_type === "custom_webhook");

  const [channelName, setChannelName] = useState("");
  const [testPayload, setTestPayload] = useState(
    EXAMPLE_PAYLOAD.replace("YOUR_USER_ID", user?.id || "YOUR_USER_ID")
  );
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; matched?: number; leadId?: string } | null>(null);
  const [webhookSecret] = useState(() => crypto.randomUUID().replace(/-/g, "").slice(0, 32));

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-ingest`;

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  const copySecret = () => {
    navigator.clipboard.writeText(webhookSecret);
    toast.success("Secret copied");
  };

  const copyPayload = () => {
    navigator.clipboard.writeText(EXAMPLE_PAYLOAD.replace("YOUR_USER_ID", user?.id || "YOUR_USER_ID"));
    toast.success("Example payload copied");
  };

  const handleTestWebhook = async () => {
    setTestSending(true);
    setTestResult(null);
    try {
      const parsed = JSON.parse(testPayload);
      // Ensure user_id is set
      parsed.user_id = user?.id;

      const { data, error } = await supabase.functions.invoke("webhook-ingest", {
        body: parsed,
      });
      if (error) throw error;
      setTestResult({ ok: true, matched: data?.matched, leadId: data?.lead_id });
      toast.success(`Test sent! ${data?.matched || 0} keywords matched.`);
    } catch (e: any) {
      setTestResult({ ok: false });
      toast.error(e?.message || "Invalid payload or test failed");
    }
    setTestSending(false);
  };

  const handleConnect = () => {
    const name = channelName.trim() || "Custom Webhook";
    const channelData: ChannelData = {
      channel_type: "custom_webhook",
      channel_name: name,
      settings: {
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret,
        configured: true,
      },
    };
    addChannel.mutate(channelData, {
      onSuccess: () => {
        setChannelName("");
        setTestResult(null);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Webhook className="h-5 w-5 text-primary" />
          Custom Webhook Setup
        </CardTitle>
        <CardDescription>
          Receive lead and message data from external systems via webhook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Status:</span>
          {webhookChannels.length > 0 ? (
            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Live</Badge>
          ) : (
            <Badge variant="secondary">Available for setup</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Send JSON payloads from any external system (CRM, forms, automations) to this endpoint. Messages are normalized, keyword-matched, and added to your inbox.
        </p>

        {/* Connected */}
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

        {/* Setup */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="space-y-1.5">
            <Label>Channel Name</Label>
            <Input placeholder="e.g. CRM Webhook, Contact Form" value={channelName} onChange={(e) => setChannelName(e.target.value)} />
          </div>

          {/* Endpoint URL */}
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-foreground">Webhook Endpoint</p>
              <Button size="sm" variant="ghost" onClick={copyUrl}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <code className="text-xs text-muted-foreground break-all">{webhookUrl}</code>
          </div>

          {/* Secret */}
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-foreground">Webhook Secret</p>
              <Button size="sm" variant="ghost" onClick={copySecret}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <code className="text-xs text-muted-foreground break-all">{webhookSecret}</code>
            <p className="text-xs text-muted-foreground mt-1">Include this in the request headers for authentication.</p>
          </div>

          {/* Example payload */}
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-foreground">Example Payload</p>
              <Button size="sm" variant="ghost" onClick={copyPayload}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <pre className="text-xs text-muted-foreground bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {EXAMPLE_PAYLOAD.replace("YOUR_USER_ID", user?.id || "YOUR_USER_ID")}
            </pre>
          </div>

          {/* Test tool */}
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
                ? `Test passed — ${testResult.matched || 0} keywords matched${testResult.leadId ? ", lead created" : ""}`
                : "Test failed — check your payload format"}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleTestWebhook} disabled={testSending}>
              {testSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Send Test
            </Button>
            <Button onClick={handleConnect} disabled={addChannel.isPending}>
              {addChannel.isPending ? "Connecting..." : "Connect Webhook"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
