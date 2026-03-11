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
import { Globe, CheckCircle2, Copy, Loader2, AlertCircle, MessageCircle } from "lucide-react";

export const WebsiteChatSetup = () => {
  const { user } = useAuth();
  const { channels, addChannel } = useChannels();
  const chatChannels = channels.filter((c) => c.channel_type === "website_chat");

  const [config, setConfig] = useState({
    widgetColor: "#3b82f6",
    welcomeMessage: "Hi! How can we help you today?",
    businessName: "",
    channelName: "",
  });
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean } | null>(null);

  const webchatUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-ingest`;

  const embedSnippet = `<!-- LeadPulse Chat Widget -->
<script>
(function() {
  var s = document.createElement('script');
  s.src = '${window.location.origin}/chat-widget.js';
  s.setAttribute('data-user-id', '${user?.id || "YOUR_USER_ID"}');
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
    if (!user) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const { error } = await supabase.functions.invoke("webchat-ingest", {
        body: {
          user_id: user.id,
          visitor_name: "Test Visitor",
          visitor_email: "test@example.com",
          message: "This is a test message from the Website Chat setup page.",
          page_url: window.location.href,
        },
      });
      if (error) throw error;
      setTestResult({ ok: true });
      toast.success("Test message sent! Check your inbox.");
    } catch {
      setTestResult({ ok: false });
      toast.error("Test failed");
    }
    setTestSending(false);
  };

  const handleConnect = () => {
    const name = config.channelName.trim() || "Website Chat";
    const channelData: ChannelData = {
      channel_type: "website_chat",
      channel_name: name,
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
        {/* Status */}
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

        {/* Connected */}
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

        {/* Configuration */}
        <div className="space-y-3 rounded-lg border border-border p-4">
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

          {/* Embed snippet */}
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-foreground">Embed Snippet</p>
              <Button size="sm" variant="ghost" onClick={copySnippet}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Add this code to your website's HTML, before the closing &lt;/body&gt; tag.</p>
            <pre className="text-xs text-muted-foreground bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">{embedSnippet}</pre>
          </div>

          {/* Test */}
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
            <Button onClick={handleConnect} disabled={addChannel.isPending}>
              {addChannel.isPending ? "Connecting..." : "Connect Chat"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
