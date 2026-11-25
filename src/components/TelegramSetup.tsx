import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useChannels } from "@/hooks/useChannels";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { CheckCircle2, Loader2, Send, AlertCircle, Radio } from "lucide-react";

export const TelegramSetup = () => {
  const { channels } = useChannels();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const telegramChannels = channels.filter((c) => c.channel_type === "telegram");
  const [botToken, setBotToken] = useState("");
  const [channelName, setChannelName] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; botName?: string } | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`;

  const handleTestConnection = async () => {
    if (!botToken.trim()) {
      toast.error("Enter a bot token first");
      return;
    }
    if (!workspace?.id) {
      toast.error("Select a workspace first");
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("save-telegram-credentials", {
        body: {
          action: "verify",
          workspace_id: workspace.id,
          bot_token: botToken.trim(),
        },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Connection failed");

      const botName = String(data.bot_username || data.bot_name || "Telegram Bot");
      setTestResult({ ok: true, botName });
      if (!channelName) setChannelName(botName);
      toast.success(`Connected as ${botName}`);
    } catch (error) {
      setTestResult({ ok: false });
      toast.error(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  const handleFullSetup = async () => {
    if (!botToken.trim() || !workspace?.id) return;
    setSaving(true);
    try {
      if (telegramChannels.length === 0) {
        const { data: limitCheck, error: limitError } = await supabase.functions.invoke("enforce-limits", {
          body: { action: "add", resource: "channels" },
        });
        if (limitError) throw new Error(limitError.message || "Failed to check limits");
        if (limitCheck && !limitCheck.allowed) {
          throw new Error(limitCheck.error || "Channel limit reached. Please upgrade your plan.");
        }
      }

      const { data, error } = await supabase.functions.invoke("save-telegram-credentials", {
        body: {
          action: "save",
          workspace_id: workspace.id,
          bot_token: botToken.trim(),
          channel_name: channelName.trim() || undefined,
        },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Telegram setup failed");

      await queryClient.invalidateQueries({ queryKey: ["channels"] });
      await queryClient.invalidateQueries({ queryKey: ["connected-channels"] });
      setBotToken("");
      setChannelName("");
      setTestResult(null);
      toast.success("Telegram connected securely");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Telegram setup failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-5 w-5 text-primary" />
          Telegram Setup
        </CardTitle>
        <CardDescription>
          Connect your Telegram bot securely. The bot token is verified and encrypted server-side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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

        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <label className="text-sm font-medium text-foreground">Bot Token</label>
            <p className="text-xs text-muted-foreground mb-1">
              Get this from <span className="font-medium">@BotFather</span> on Telegram. It is never stored in plaintext.
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                autoComplete="off"
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
              <Button aria-label="Loading" variant="outline" onClick={handleTestConnection} disabled={testing || saving}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
              </Button>
            </div>
            {testResult && (
              <div className={`flex items-center gap-2 mt-2 text-xs ${testResult.ok ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                {testResult.ok ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Verified as {testResult.botName}
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
              placeholder="e.g. My Telegram Bot"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs font-medium text-foreground mb-1">Webhook Endpoint</p>
            <code className="text-xs text-muted-foreground break-all">{webhookUrl}</code>
          </div>

          <Button
            onClick={handleFullSetup}
            disabled={!botToken.trim() || !workspace?.id || saving || testing}
            className="w-full"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Radio className="h-4 w-4 mr-2" />}
            {saving ? "Connecting..." : "Connect & Set Webhook"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
