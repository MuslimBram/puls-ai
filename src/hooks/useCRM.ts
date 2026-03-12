import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface PipelineStage {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  is_default: boolean;
}

export interface Deal {
  id: string;
  title: string;
  stage_id: string | null;
  lead_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  source_channel: string;
  deal_value: number;
  currency: string;
  expected_close_date: string | null;
  priority: string;
  tags: string[];
  lost_reason: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  won_at: string | null;
  lost_at: string | null;
  user_id: string;
  workspace_id: string | null;
}

export interface DealNote {
  id: string;
  deal_id: string;
  content: string;
  is_ai_generated: boolean;
  created_at: string;
}

export interface DealTask {
  id: string;
  deal_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  priority: string;
  created_at: string;
}

export interface DealActivity {
  id: string;
  deal_id: string;
  activity_type: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const DEFAULT_STAGES = [
  { name: "New Lead", sort_order: 0, color: "#6366f1" },
  { name: "Contacted", sort_order: 1, color: "#3b82f6" },
  { name: "Qualified", sort_order: 2, color: "#8b5cf6" },
  { name: "Proposal Sent", sort_order: 3, color: "#f59e0b" },
  { name: "Negotiation", sort_order: 4, color: "#f97316" },
  { name: "Won", sort_order: 5, color: "#22c55e" },
  { name: "Lost", sort_order: 6, color: "#ef4444" },
];

export const usePipelineStages = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pipeline-stages", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("user_id", user!.id)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as PipelineStage[];
    },
    enabled: !!user,
  });

  const initStages = useMutation({
    mutationFn: async () => {
      const rows = DEFAULT_STAGES.map((s) => ({
        ...s,
        user_id: user!.id,
        is_default: true,
      }));
      const { error } = await supabase.from("pipeline_stages").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] }),
  });

  return { stages: query.data ?? [], isLoading: query.isLoading, initStages };
};

export const useDeals = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["deals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Deal[];
    },
    enabled: !!user,
  });

  const addDeal = useMutation({
    mutationFn: async (deal: Partial<Deal>) => {
      const { error } = await supabase.from("deals").insert({
        ...deal,
        user_id: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Deal created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateDeal = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Deal> & { id: string }) => {
      const { error } = await supabase
        .from("deals")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
    onError: (e) => toast.error(e.message),
  });

  const deleteDeal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Deal deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return { deals: query.data ?? [], isLoading: query.isLoading, addDeal, updateDeal, deleteDeal };
};

export const useDealNotes = (dealId: string | null) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["deal-notes", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_notes")
        .select("*")
        .eq("deal_id", dealId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DealNote[];
    },
    enabled: !!dealId && !!user,
  });

  const addNote = useMutation({
    mutationFn: async ({ content, is_ai_generated }: { content: string; is_ai_generated?: boolean }) => {
      const { error } = await supabase.from("deal_notes").insert({
        deal_id: dealId,
        user_id: user!.id,
        content,
        is_ai_generated: is_ai_generated ?? false,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deal-notes", dealId] }),
    onError: (e) => toast.error(e.message),
  });

  return { notes: query.data ?? [], addNote };
};

export const useDealTasks = (dealId: string | null) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["deal-tasks", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_tasks")
        .select("*")
        .eq("deal_id", dealId!)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as DealTask[];
    },
    enabled: !!dealId && !!user,
  });

  const addTask = useMutation({
    mutationFn: async (task: { title: string; due_date?: string; priority?: string; description?: string }) => {
      const { error } = await supabase.from("deal_tasks").insert({
        deal_id: dealId,
        user_id: user!.id,
        ...task,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal-tasks", dealId] });
      toast.success("Task added");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase
        .from("deal_tasks")
        .update({
          is_completed,
          completed_at: is_completed ? new Date().toISOString() : null,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deal-tasks", dealId] }),
  });

  return { tasks: query.data ?? [], addTask, toggleTask };
};

export const useDealActivities = (dealId: string | null) => {
  const query = useQuery({
    queryKey: ["deal-activities", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_activities")
        .select("*")
        .eq("deal_id", dealId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as DealActivity[];
    },
    enabled: !!dealId,
  });

  return { activities: query.data ?? [] };
};

export const useAllTasks = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["all-deal-tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_tasks")
        .select("*, deals(title)")
        .eq("user_id", user!.id)
        .eq("is_completed", false)
        .order("due_date", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });
};

export const usePipelineStats = () => {
  const { deals } = useDeals();
  const { stages } = usePipelineStages();

  const stageStats = stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stage_id === stage.id);
    return {
      name: stage.name,
      color: stage.color,
      count: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
    };
  });

  const totalValue = deals.reduce((sum, d) => sum + (d.deal_value || 0), 0);
  const wonDeals = deals.filter((d) => d.won_at);
  const lostDeals = deals.filter((d) => d.lost_at);
  const winRate = wonDeals.length + lostDeals.length > 0
    ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
    : 0;

  return { stageStats, totalValue, wonDeals: wonDeals.length, lostDeals: lostDeals.length, winRate, totalDeals: deals.length };
};
