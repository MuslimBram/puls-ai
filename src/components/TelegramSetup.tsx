import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useChannels, ChannelData } from "@/hooks/useChannels";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { CheckCircle2, Loader2, Send, AlertCircle, Radio } from "lucide-react";

export const TelegramSetup = () => {
  const { channels, addChannel } = useChannels();
  const telegramChannels = channels.filter((c) => c.channel_type === "telegram");
  const [botToken, setBotToken] = useState("");
  const [channelName, setChannelName] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; botName?: string } | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`;

  const handleTestConnection = async () => {
    if (!botToken.trim()) {
      toast.error("Enter a bot token first");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, botName: data.result.username });
        if (!channelName) setChannelName(`@${data.result.username}`);
      } else {
        setTestResult({ ok: false });
        toast.error("Invalid bot token");
      }
    } catch {
      setTestResult({ ok: false });
      toast.error("Connection failed");
    }
    setTesting(false);
  };

  const handleSetupWebhook = async () => {
    if (!botToken.trim()) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Webhook configured successfully");
      } else {
        toast.error("Failed to set webhook: " + (data.description || "Unknown error"));
      }
    } catch {
      toast.error("Failed to set webhook");
    }
  };

  const handleAddChannel = () => {
    if (!channelName.trim()) return;
    const channelData: ChannelData = {
      channel_type: "telegram",
      channel_name: channelName,
      settings: {
        bot_token_configured: !!botToken,
        bot_username: testResult?.botName || "",
        webhook_url: webhookUrl,
      },
    };
    addChannel.mutate(channelData, {
      onSuccess: () => {
        setBotToken("");
        setChannelName("");
        setTestResult(null);
      },
    });
  };

  const handleFullSetup = async () => {
    await handleSetupWebhook();
    handleAddChannel();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-5 w-5 text-primary" />
          Telegram Setup
        </CardTitle>
        <CardDescription>
          Connect your Telegram bot to start monitoring groups for leads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connected channels */}
        {telegramChannels.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Connected Telegram Channels</p>
            {telegramChannels.map((ch) => (
              <div key={ch.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                <span className="text-sm text-foreground">{ch.channel_name}</span>
                <Badge variant={ch.is_enabled ? "default" : "secondary"} className="text-xs ml-auto">
                  {ch.is_enabled ? "Active" : "Disabled"}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Setup form */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <label className="text-sm font-medium text-foreground">Bot Token</label>
            <p className="text-xs text-muted-foreground mb-1">
              Get this from <span className="font-medium">@BotFather</span> on Telegram
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
              <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
              </Button>
            </div>
            {testResult && (
              <div className={`flex items-center gap-2 mt-2 text-xs ${testResult.ok ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                {testResult.ok ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Connected as @{testResult.botName}
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3" />
                    Connection failed. Check your token.
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Channel Name</label>
            <Input
              placeholder="e.g. My Telegram Group"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs font-medium text-foreground mb-1">Webhook URL</p>
            <code className="text-xs text-muted-foreground break-all">{webhookUrl}</code>
          </div>

          <Button
            onClick={handleFullSetup}
            disabled={!channelName.trim() || addChannel.isPending}
            className="w-full"
          >
            <Radio className="h-4 w-4 mr-2" />
            {addChannel.isPending ? "Connecting..." : "Connect & Set Webhook"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
