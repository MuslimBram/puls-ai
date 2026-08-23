import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ModuleStatus =
  | "connected"
  | "missing"
  | "error"
  | "needs_config"
  | "connected_no_activity"
  | "not_tested";

export interface ModuleActivation {
  key: string;
  label: string;
  category: string;
  status: ModuleStatus;
  lastTest: string | null;
  lastActivity: string | null;
  errorMessage: string | null;
  configCompletePct: number;
  fixSuggestion: string | null;
  blockerLevel: "blocker" | "warning" | "ok";
}

export interface ActivationSummary {
  modules: ModuleActivation[];
  globalScore: number;
  blockers: ModuleActivation[];
  warnings: ModuleActivation[];
}

export const useActivationStatus = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["activation-status", user?.id],
    queryFn: async (): Promise<ActivationSummary> => {
      // Fetch data in parallel
      const [
        connectionsRes,
        inboxRes,
        threadsRes,
        leadsRes,
        subsRes,
        channelsRes,
        n8nRes,
        logsRes,
      ] = await Promise.all([
        supabase
          .from("unified_connections" as any)
          .select("*")
          .eq("user_id", user!.id),
        supabase
          .from("inbox_messages")
          .select("id, message_timestamp")
          .eq("user_id", user!.id)
          .order("message_timestamp", { ascending: false })
          .limit(1),
        supabase
          .from("conversation_threads")
          .select("id, created_at")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("leads")
          .select("id, created_at")
          .eq("user_id", user!.id)
          .limit(1),
        supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase
          .from("channels")
          .select("*")
          .eq("user_id", user!.id),
        supabase
          .from("n8n_configurations" as any)
          .select("*")
          .limit(1),
        supabase
          .from("connection_logs" as any)
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const connections = (connectionsRes.data || []) as any[];
      const lastInbox = inboxRes.data?.[0] as any;
      const lastThread = threadsRes.data?.[0] as any;
      const hasLeads = (leadsRes.data?.length || 0) > 0;
      const sub = subsRes.data as any;
      const channels = (channelsRes.data || []) as any[];
      const n8nConfigs = (n8nRes.data || []) as any[];
      const logs = (logsRes.data || []) as any[];

      const getConnectionForProvider = (provider: string) =>
        connections.find((c: any) => c.provider === provider);

      const getLastLog = (provider?: string) => {
        if (!provider) return logs[0];
        return logs.find((l: any) => (l.metadata as any)?.provider === provider);
      };

      const modules: ModuleActivation[] = [];

      // 1. Inbox / Messaging
      const hasInboxMessages = !!lastInbox;
      const inboxStatus: ModuleStatus = hasInboxMessages
        ? "connected"
        : channels.length > 0
        ? "connected_no_activity"
        : "missing";
      modules.push({
        key: "inbox",
        label: "Inbox & Messaging",
        category: "core",
        status: inboxStatus,
        lastTest: null,
        lastActivity: lastInbox?.message_timestamp || null,
        errorMessage: inboxStatus === "missing" ? "No channels connected" : null,
        configCompletePct: hasInboxMessages ? 100 : channels.length > 0 ? 60 : 0,
        fixSuggestion:
          inboxStatus === "missing"
            ? "Connect at least one messaging channel (Telegram, WhatsApp, Email)"
            : inboxStatus === "connected_no_activity"
            ? "Channel connected but no messages received. Send a test message to verify."
            : null,
        blockerLevel: inboxStatus === "missing" ? "blocker" : inboxStatus === "connected_no_activity" ? "warning" : "ok",
      });

      // 2. Billing / Subscription
      const billingOk = sub && sub.payment_status === "active";
      const billingTrial = sub && sub.payment_status === "trial";
      const billingStatus: ModuleStatus = billingOk
        ? "connected"
        : billingTrial
        ? "needs_config"
        : "error";
      modules.push({
        key: "billing",
        label: "Billing & Subscription",
        category: "core",
        status: billingStatus,
        lastTest: null,
        lastActivity: sub?.updated_at || null,
        errorMessage: !billingOk && !billingTrial ? "No active subscription" : null,
        configCompletePct: billingOk ? 100 : billingTrial ? 50 : 0,
        fixSuggestion: billingTrial
          ? "Trial active — choose a plan before it expires."
          : !billingOk
          ? "Subscription inactive. Update billing to continue."
          : null,
        blockerLevel: !billingOk && !billingTrial ? "blocker" : billingTrial ? "warning" : "ok",
      });

      // 3. CRM / Leads
      modules.push({
        key: "crm",
        label: "CRM & Leads",
        category: "core",
        status: hasLeads ? "connected" : "connected_no_activity",
        lastTest: null,
        lastActivity: leadsRes.data?.[0]?.created_at || null,
        errorMessage: null,
        configCompletePct: hasLeads ? 100 : 40,
        fixSuggestion: !hasLeads ? "No leads yet. Import leads or connect a channel to capture them." : null,
        blockerLevel: hasLeads ? "ok" : "warning",
      });

      // 4. Conversation Threads
      modules.push({
        key: "threads",
        label: "Conversation Threads",
        category: "core",
        status: lastThread ? "connected" : "connected_no_activity",
        lastTest: null,
        lastActivity: lastThread?.created_at || null,
        errorMessage: null,
        configCompletePct: lastThread ? 100 : 30,
        fixSuggestion: !lastThread ? "No conversation threads. Threads are auto-created from inbound messages." : null,
        blockerLevel: "ok",
      });

      // 5. Telegram
      const telegramConn = getConnectionForProvider("telegram");
      const telegramChannel = channels.find((c: any) => c.channel_type === "telegram");
      const tgStatus: ModuleStatus = telegramConn?.status === "connected"
        ? "connected"
        : telegramConn
        ? telegramConn.status === "error"
          ? "error"
          : "not_tested"
        : telegramChannel
        ? "needs_config"
        : "missing";
      modules.push({
        key: "telegram",
        label: "Telegram",
        category: "channels",
        status: tgStatus,
        lastTest: telegramConn?.last_tested_at || null,
        lastActivity: null,
        errorMessage: telegramConn?.last_error || null,
        configCompletePct: telegramConn?.status === "connected" ? 100 : telegramConn ? 50 : 0,
        fixSuggestion:
          tgStatus === "missing"
            ? "Add a Telegram bot token in Connections Hub."
            : tgStatus === "error"
            ? `Fix error: ${telegramConn?.last_error || "Unknown"}`
            : tgStatus === "not_tested"
            ? "Connection exists but not tested. Click Test Connection."
            : null,
        blockerLevel: "ok",
      });

      // 6. WhatsApp / Twilio
      const twilioConn = getConnectionForProvider("twilio");
      const waChannel = channels.find((c: any) => c.channel_type === "whatsapp");
      const twStatus: ModuleStatus = twilioConn?.status === "connected"
        ? "connected"
        : twilioConn
        ? twilioConn.status === "error" ? "error" : "not_tested"
        : waChannel ? "needs_config" : "missing";
      modules.push({
        key: "whatsapp",
        label: "WhatsApp / Twilio",
        category: "channels",
        status: twStatus,
        lastTest: twilioConn?.last_tested_at || null,
        lastActivity: null,
        errorMessage: twilioConn?.last_error || null,
        configCompletePct: twilioConn?.status === "connected" ? 100 : twilioConn ? 50 : 0,
        fixSuggestion:
          twStatus === "missing" ? "Add Twilio credentials in Connections Hub." : null,
        blockerLevel: "ok",
      });

      // 7. OpenAI
      const openaiConn = getConnectionForProvider("openai");
      const oaStatus: ModuleStatus = openaiConn?.status === "connected"
        ? "connected"
        : openaiConn
        ? openaiConn.status === "error" ? "error" : "not_tested"
        : "missing";
      modules.push({
        key: "openai",
        label: "OpenAI / AI Engine",
        category: "ai",
        status: oaStatus,
        lastTest: openaiConn?.last_tested_at || null,
        lastActivity: null,
        errorMessage: openaiConn?.last_error || null,
        configCompletePct: openaiConn?.status === "connected" ? 100 : 0,
        fixSuggestion:
          oaStatus === "missing"
            ? "Platform uses the canonical AI router by default. Add provider keys for custom models."
            : null,
        blockerLevel: "ok",
      });

      // 8. n8n Automation
      const n8n = n8nConfigs[0];
      const n8nStatus: ModuleStatus = n8n?.status === "connected"
        ? "connected"
        : n8n
        ? n8n.status === "error" ? "error" : "needs_config"
        : "missing";
      modules.push({
        key: "n8n",
        label: "n8n Automation",
        category: "automation",
        status: n8nStatus,
        lastTest: n8n?.last_tested_at || null,
        lastActivity: null,
        errorMessage: n8n?.last_error || null,
        configCompletePct: n8n?.status === "connected" ? 100 : n8n ? 40 : 0,
        fixSuggestion:
          n8nStatus === "missing"
            ? "Set up n8n in Admin Integration Hub to automate workflows."
            : n8nStatus === "needs_config"
            ? "n8n configured but not tested. Click Test Connection."
            : null,
        blockerLevel: "ok",
      });

      // Calculate scores
      const connectedCount = modules.filter((m) => m.status === "connected").length;
      const globalScore = Math.round((connectedCount / modules.length) * 100);
      const blockers = modules.filter((m) => m.blockerLevel === "blocker");
      const warnings = modules.filter((m) => m.blockerLevel === "warning");

      return { modules, globalScore, blockers, warnings };
    },
    enabled: !!user,
    staleTime: 60000,
  });
};
