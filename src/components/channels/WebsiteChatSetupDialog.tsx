import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Globe2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";

interface WebsiteChatSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WebsiteChatStatus = {
  configured?: boolean;
  configuration_valid?: boolean;
  channel_id?: string;
  allowed_origins?: string[];
  error?: string;
};

function normalizeOriginsInput(value: string): string[] {
  const raw = value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (raw.length < 1 || raw.length > 20) {
    throw new Error("Add between 1 and 20 website origins.");
  }

  const origins = new Set<string>();
  for (const item of raw) {
    const url = new URL(item);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(isLocalhost && url.protocol === "http:")) {
      throw new Error("Production Website Chat origins must use HTTPS.");
    }
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
      throw new Error("Enter an origin only, for example https://example.com — no path, query, or credentials.");
    }
    origins.add(url.origin);
  }
  return [...origins];
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export const WebsiteChatSetupDialog = ({ open, onOpenChange }: WebsiteChatSetupDialogProps) => {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [originsInput, setOriginsInput] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const proxyEndpoint = supabaseUrl ? `${supabaseUrl}/functions/v1/webchat-proxy` : "";

  const snippet = useMemo(() => {
    if (!channelId || !proxyEndpoint || typeof window === "undefined") return "";
    const scriptUrl = `${window.location.origin}/pulse-webchat.js`;
    return `<script\n  src="${escapeAttribute(scriptUrl)}"\n  data-channel-id="${escapeAttribute(channelId)}"\n  data-endpoint="${escapeAttribute(proxyEndpoint)}"\n  data-title="Chat with us"\n  defer\n></script>`;
  }, [channelId, proxyEndpoint]);

  useEffect(() => {
    if (!open) return;
    if (!workspace?.id) {
      setChannelId(null);
      setOriginsInput("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    supabase.functions.invoke("website-chat-manage", {
      body: { action: "status", workspace_id: workspace.id },
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        toast.error(error.message || "Could not load Website Chat setup.");
        return;
      }
      const status = (data || {}) as WebsiteChatStatus;
      setChannelId(status.configured && status.channel_id ? status.channel_id : null);
      setOriginsInput(Array.isArray(status.allowed_origins) ? status.allowed_origins.join("\n") : "");
      if (status.configured && status.configuration_valid === false) {
        toast.warning("Website Chat needs an allowed website origin before it can accept messages.");
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, workspace?.id]);

  const save = async () => {
    if (!workspace?.id) {
      toast.error("Select a workspace before configuring Website Chat.");
      return;
    }

    let allowedOrigins: string[];
    try {
      allowedOrigins = normalizeOriginsInput(originsInput);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid website origin.");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("website-chat-manage", {
        body: {
          action: "save",
          workspace_id: workspace.id,
          allowed_origins: allowedOrigins,
        },
      });
      if (error || !data?.ok || !data?.channel_id) {
        throw new Error(data?.error || error?.message || "Website Chat setup failed.");
      }

      setChannelId(String(data.channel_id));
      setOriginsInput((data.allowed_origins || allowedOrigins).join("\n"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["channels"] }),
        queryClient.invalidateQueries({ queryKey: ["connected-channels"] }),
        queryClient.invalidateQueries({ queryKey: ["channel-registry-modes"] }),
      ]);
      toast.success("Website Chat configured securely.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Website Chat setup failed.");
    } finally {
      setSaving(false);
    }
  };

  const copySnippet = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success("Widget snippet copied.");
    } catch {
      toast.error("Could not copy automatically. Select and copy the snippet manually.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-primary" />
            Website Chat
          </DialogTitle>
          <DialogDescription>
            Bind the public widget to your exact website origin. Pulse AI resolves the workspace server-side and scans every inbound message before Inbox processing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm flex gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div>
              The widget never contains a workspace ID, user ID, service key, or internal webhook secret. Only the public channel ID is embedded.
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website-chat-origins">Allowed website origin(s)</Label>
            <Textarea
              id="website-chat-origins"
              rows={4}
              value={originsInput}
              onChange={(event) => setOriginsInput(event.target.value)}
              placeholder={"https://example.com\nhttps://www.example.com"}
              disabled={loading || saving}
            />
            <p className="text-xs text-muted-foreground">
              One exact origin per line. Add both root and www if your site uses both. Production origins must use HTTPS.
            </p>
          </div>

          <Button onClick={save} disabled={loading || saving || !workspace?.id} className="w-full">
            {loading ? "Loading…" : saving ? "Saving…" : channelId ? "Save Website Chat settings" : "Create Website Chat channel"}
          </Button>

          {channelId && (
            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <h3 className="font-medium">Install the widget</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Paste this immediately before the closing &lt;/body&gt; tag on an allowed website. The widget sends messages only through the public webchat proxy.
                </p>
              </div>

              {!proxyEndpoint ? (
                <p className="text-sm text-destructive">VITE_SUPABASE_URL is missing, so an install snippet cannot be generated.</p>
              ) : (
                <>
                  <Textarea value={snippet} readOnly rows={7} className="font-mono text-xs" aria-label="Website Chat install snippet" />
                  <Button variant="outline" onClick={copySnippet} className="w-full">
                    <Copy className="h-4 w-4 mr-2" /> Copy install snippet
                  </Button>
                </>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                <p>After installation, send a real test message from one of the allowed origins.</p>
                <p>If the host site uses a strict CSP, allow the Pulse AI script origin in <code>script-src</code> and the Supabase project origin in <code>connect-src</code>.</p>
                <p>This widget currently provides secure inbound capture to Pulse AI Inbox; it does not claim to return an AI reply to the visitor.</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
