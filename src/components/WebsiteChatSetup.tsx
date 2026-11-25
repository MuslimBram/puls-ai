import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useChannels, ChannelData } from "@/hooks/useChannels";
import { toast } from "@/components/ui/sonner";
import { Globe, CheckCircle2, Copy, Loader2, AlertCircle, MessageCircle } from "lucide-react";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useChannelRegistry } from "@/hooks/useChannelRegistry";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const WebsiteChatSetup = () => {
  const { channels, addChannel } = useChannels();
  const { profiles } = useBusinessProfile();
  const { effectivePlanKey, planOrder } = useFeatureGating();
  const { registry } = useChannelRegistry();
  const { isAdmin, isSuperAdmin } = useRolePermissions();
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const chatChannels = channels.filter((c) => c.channel_type === "website_chat");
  const webchatProxyUrl = (import.meta.env.VITE_WEBCHAT_PROXY_URL as string | undefined)
    || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-proxy`;

  const [config, setConfig] = useState({
    widgetColor: "#3b82f6",
    welcomeMessage: "Hi! How can we help you today?",
    businessName: "",
    channelName: "",
  });
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean } | null>(null);

  const webchatUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-ingest`;
  const activeChannelId = chatChannels[0]?.id;
  const websiteRegistry = registry.find((item) => item.id === "website_chat");
  const currentPlanIdx = planOrder.indexOf(effectivePlanKey as any);
  const requiredPlanIdx = planOrder.indexOf((websiteRegistry?.min_plan || "standard") as any);
  const isInternalOperator = isAdmin || isSuperAdmin;
  const canConnectWebsiteChat = isInternalOperator || (currentPlanIdx >= 0 && requiredPlanIdx >= 0 && currentPlanIdx >= requiredPlanIdx);

  useEffect(() => {
    if (profiles.length === 1) setSelectedBusinessId(profiles[0].id);
  }, [profiles]);

  const embedSnippet = `<!-- Pulse AI Chat Widget -->
<script>
(function() {
  var s = document.createElement('script');
  s.src = '${window.location.origin}/chat-widget.js';
  s.setAttribute('data-channel-id', '${activeChannelId || "YOUR_CHANNEL_ID"}');
  s.setAttribute('data-proxy-url', '${webchatProxyUrl}');
  s.setAttribute('data-color', '${config.widgetColor}');
  s.setAttribute('data-welcome', '${config.welcomeMessage}');
  s.setAttribute('data-name', '${config.businessName}');
  document.body.appendChild(s);
})();
</script>`;

  const copySnippet = () => {
    navigator.clipboard.writeText(embedSnippet);
    toast.success("Snippet copied to clipboard");
  };

  const handleTestChat = async () => {
    if (!activeChannelId) {
      toast.error("Connect a Website Chat channel first");
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const response = await fetch(webchatProxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_name: "Test Visitor",
          visitor_email: "test@example.com",
          message: "This is a test message from the Website Chat setup page.",
          page_url: window.location.href,
          channel_id: activeChannelId,
          event_id: `wc:${crypto.randomUUID()}`,
        }),
      });
      if (!response.ok) throw new Error("Test request failed");
      setTestResult({ ok: true });
      toast.success("Test message sent! Check your inbox.");
    } catch {
      setTestResult({ ok: false });
      toast.error("Test failed");
    }
    setTestSending(false);
  };

  const handleConnect = () => {
    if (!canConnectWebsiteChat) {
      toast.error(`Website Chat requires the ${websiteRegistry?.min_plan || "standard"} plan or higher.`);
      return;
    }
    const businessId = selectedBusinessId.trim();
    if (!businessId) {
      toast.error("Select a business before connecting Website Chat.");
      return;
    }
    if (profiles.length > 1 && !profiles.some((profile) => profile.id === businessId)) {
      toast.error("Selected business is not authorized.");
      return;
    }
    const name = config.channelName.trim() || "Website Chat";
    const channelData: ChannelData = {
      channel_type: "website_chat",
      channel_name: name,
      business_id: businessId,
      settings: {
        widget_color: config.widgetColor,
        welcome_message: config.welcomeMessage,
        business_name: config.businessName,
        webhook_url: webchatUrl,
        installed: false,
      },
    };
    addChannel.mutate(channelData, {
      onSuccess: () => {
        setConfig({ widgetColor: "#3b82f6", welcomeMessage: "Hi! How can we help you today?", businessName: "", channelName: "" });
        setTestResult(null);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Globe className="h-5 w-5 text-primary" />
          Website Chat Setup
        </CardTitle>
        <CardDescription>
          Add a chat widget to your website and capture visitor messages as leads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Status:</span>
          {chatChannels.length > 0 ? (
            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Live</Badge>
          ) : (
            <Badge variant="secondary">Available for setup</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Embed a lightweight chat widget on your website. Messages are processed through keyword matching and AI analysis.
        </p>

        {chatChannels.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Connected Chat Channels</p>
            {chatChannels.map((ch) => (
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
            <Label>Business</Label>
            {profiles.length === 1 ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{profiles[0].business_name}</div>
            ) : profiles.length > 1 ? (
              <Select value={selectedBusinessId} onValueChange={setSelectedBusinessId}>
                <SelectTrigger><SelectValue placeholder="Choose a business..." /></SelectTrigger>
                <SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.business_name}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">Create a business before connecting Website Chat.</div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Channel Name</Label>
              <Input placeholder="Website Chat" value={config.channelName} onChange={(e) => setConfig((c) => ({ ...c, channelName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Business Name</Label>
              <Input placeholder="Your Company" value={config.businessName} onChange={(e) => setConfig((c) => ({ ...c, businessName: e.target.value }))} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Widget Color</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={config.widgetColor} onChange={(e) => setConfig((c) => ({ ...c, widgetColor: e.target.value }))} className="h-9 w-12 rounded border border-input cursor-pointer" />
                <Input value={config.widgetColor} onChange={(e) => setConfig((c) => ({ ...c, widgetColor: e.target.value }))} className="flex-1" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Welcome Message</Label>
              <Input placeholder="Hi! How can we help?" value={config.welcomeMessage} onChange={(e) => setConfig((c) => ({ ...c, welcomeMessage: e.target.value }))} />
            </div>
          </div>

          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-foreground">Embed Snippet</p>
              <Button size="sm" variant="ghost" onClick={copySnippet}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Add this code to your website's HTML, before the closing &lt;/body&gt; tag. The widget routes messages through the tenant-safe Pulse AI proxy.</p>
            <pre className="text-xs text-muted-foreground bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">{embedSnippet}</pre>
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 text-xs ${testResult.ok ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
              {testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {testResult.ok ? "Test message sent — check your Inbox" : "Test failed"}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleTestChat} disabled={testSending}>
              {testSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MessageCircle className="h-4 w-4 mr-1" />}
              Send Test Message
            </Button>
            <Button onClick={handleConnect} disabled={addChannel.isPending || !canConnectWebsiteChat || !selectedBusinessId}>
              {addChannel.isPending ? "Connecting..." : "Connect Chat"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
