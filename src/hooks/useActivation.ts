import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import confetti from "canvas-confetti";
import { toast } from "sonner";

export interface ActivationStep {
  key: string;
  label: string;
  description: string;
  href: string;
  cta: string;
  estMinutes: number;
  completed: boolean;
}

const STEP_DEFS: Omit<ActivationStep, "completed">[] = [
  { key: "verify_email",     label: "Verify your email",          description: "Confirm your email to secure your account.",                href: "/session-security", cta: "Verify",       estMinutes: 1 },
  { key: "business_profile", label: "Complete business profile",  description: "So the AI knows your business, services and audience.",     href: "/business-profile", cta: "Set up",       estMinutes: 2 },
  { key: "keywords",         label: "Add monitoring keywords",    description: "Capture leads from conversations across channels.",         href: "/keywords",         cta: "Add",          estMinutes: 1 },
  { key: "channel",          label: "Connect a channel",          description: "WhatsApp, Telegram, Email, or Website Chat.",               href: "/connections",      cta: "Connect",      estMinutes: 2 },
  { key: "knowledge",        label: "Train the AI",               description: "Add your website or documents to the knowledge base.",      href: "/knowledge-base",   cta: "Train",        estMinutes: 3 },
  { key: "first_reply",      label: "Send your first reply",      description: "Reply to a message from the unified inbox.",                href: "/inbox",            cta: "Open inbox",   estMinutes: 1 },
  { key: "automation",       label: "Create your first automation", description: "Auto-reply, route messages, or follow up leads.",         href: "/automations",      cta: "Create",       estMinutes: 2 },
];

export const useActivation = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const prevCompletedRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);

  // Persisted state (dismissal + cached completion)
  const progress = useQuery({
    queryKey: ["activation-progress", user?.id, workspace?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("onboarding_progress")
        .select("*")
        .eq("user_id", user!.id)
        .eq("workspace_id", workspace!.id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!user && !!workspace,
  });

  // Live signals — recomputed in real time
  const signals = useQuery({
    queryKey: ["activation-signals", user?.id],
    queryFn: async () => {
      const uid = user!.id;
      const [profile, kw, ch, kn, msg, au] = await Promise.all([
        supabase.from("business_profiles").select("id,business_name,industry,main_services").eq("user_id", uid).limit(1).maybeSingle(),
        supabase.from("keywords").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("unified_connections").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("knowledge_sources").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("inbox_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("direction", "outbound"),
        supabase.from("automation_workflows").select("id", { count: "exact", head: true }).eq("user_id", uid),
      ]);
      const p: any = profile.data;
      return {
        verify_email: !!user?.email_confirmed_at,
        business_profile: !!(p?.business_name && p?.industry && p?.main_services),
        keywords: (kw.count ?? 0) > 0,
        channel: (ch.count ?? 0) > 0,
        knowledge: (kn.count ?? 0) > 0,
        first_reply: (msg.count ?? 0) > 0,
        automation: (au.count ?? 0) > 0,
      } as Record<string, boolean>;
    },
    enabled: !!user,
    staleTime: 15_000,
  });

  // Realtime subscriptions: invalidate signals on any change to source tables
  useEffect(() => {
    if (!user) return;
    const tables = [
      "business_profiles", "keywords", "unified_connections",
      "knowledge_sources", "inbox_messages", "automation_workflows",
    ];
    const channel = supabase.channel(`activation-${user.id}`);
    tables.forEach((t) => {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: t, filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["activation-signals", user.id] }),
      );
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

  const steps: ActivationStep[] = useMemo(() => {
    const live = signals.data || {};
    return STEP_DEFS.map((s) => ({ ...s, completed: !!live[s.key] }));
  }, [signals.data]);

  const completed = steps.filter((s) => s.completed).length;
  const total = steps.length;
  const percent = Math.round((completed / total) * 100);
  const nextStep = steps.find((s) => !s.completed) ?? null;
  const isComplete = completed === total;

  // Persist + celebrate when completion advances
  const persist = useMutation({
    mutationFn: async (stepsCompletedMap: Record<string, boolean>) => {
      if (!user || !workspace) return;
      await supabase.from("onboarding_progress").upsert({
        user_id: user.id,
        workspace_id: workspace.id,
        steps_completed: stepsCompletedMap,
        completion_score: percent,
        last_seen_step: nextStep?.key ?? "complete",
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id,workspace_id" });
    },
  });

  useEffect(() => {
    if (!signals.data) return;
    const currentSet = new Set(steps.filter((s) => s.completed).map((s) => s.key));
    if (!initRef.current) {
      prevCompletedRef.current = currentSet;
      initRef.current = true;
      return;
    }
    const newlyDone: string[] = [];
    currentSet.forEach((k) => { if (!prevCompletedRef.current.has(k)) newlyDone.push(k); });
    if (newlyDone.length > 0) {
      const def = STEP_DEFS.find((s) => s.key === newlyDone[0]);
      const remaining = total - currentSet.size;
      toast.success(`✅ ${def?.label ?? "Step complete"}`, {
        description: remaining > 0
          ? `${remaining} step${remaining === 1 ? "" : "s"} to go to your first lead.`
          : "Activation complete — you're ready to grow!",
      });
      try {
        confetti({
          particleCount: currentSet.size === total ? 160 : 60,
          spread: 70,
          origin: { y: 0.3 },
        });
      } catch { /* noop */ }
      persist.mutate(Object.fromEntries(steps.map((s) => [s.key, s.completed])));
    }
    prevCompletedRef.current = currentSet;
  }, [signals.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useMutation({
    mutationFn: async () => {
      if (!user || !workspace) return;
      await supabase.from("onboarding_progress").upsert({
        user_id: user.id,
        workspace_id: workspace.id,
        is_dismissed: true,
        steps_completed: Object.fromEntries(steps.map((s) => [s.key, s.completed])),
        completion_score: percent,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id,workspace_id" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activation-progress"] }),
  });

  const reopen = useMutation({
    mutationFn: async () => {
      if (!user || !workspace) return;
      await supabase.from("onboarding_progress").upsert({
        user_id: user.id,
        workspace_id: workspace.id,
        is_dismissed: false,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id,workspace_id" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activation-progress"] }),
  });

  const isDismissed = !!progress.data?.is_dismissed;

  return {
    steps, completed, total, percent, nextStep, isComplete,
    isDismissed, dismiss, reopen,
    isLoading: signals.isLoading || progress.isLoading,
  };
};
