import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface VisitorProfile {
  id: string;
  user_id: string;
  workspace_id: string | null;
  visitor_identifier: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  classification: string;
  intent_score: number;
  total_visits: number;
  total_time_seconds: number;
  total_conversations: number;
  total_pages_viewed: number;
  last_visit_at: string | null;
  first_seen_at: string;
  tags: string[];
  metadata: Record<string, unknown>;
  lead_id: string | null;
  deal_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VisitorEvent {
  id: string;
  user_id: string;
  visitor_id: string;
  event_type: string;
  event_title: string | null;
  event_description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ReengagementTask {
  id: string;
  user_id: string;
  visitor_id: string;
  task_type: string;
  channel: string;
  suggested_message: string | null;
  status: string;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const CLASSIFICATION_ORDER = [
  "curious_visitor",
  "interested_lead",
  "potential_buyer",
  "high_value_prospect",
  "promoter",
];

export const classificationLabel = (c: string) => {
  const map: Record<string, string> = {
    curious_visitor: "Curious Visitor",
    interested_lead: "Interested Lead",
    potential_buyer: "Potential Buyer",
    high_value_prospect: "High-Value Prospect",
    promoter: "Promoter / Loyal",
  };
  return map[c] ?? c;
};

export const classificationColor = (c: string) => {
  const map: Record<string, string> = {
    curious_visitor: "secondary",
    interested_lead: "default",
    potential_buyer: "default",
    high_value_prospect: "destructive",
    promoter: "default",
  };
  return map[c] ?? "secondary";
};

export const useVisitorProfiles = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["visitor-profiles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitor_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .order("intent_score", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as VisitorProfile[];
    },
    enabled: !!user,
  });
};

export const useVisitorEvents = (visitorId: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["visitor-events", visitorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitor_events")
        .select("*")
        .eq("visitor_id", visitorId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as VisitorEvent[];
    },
    enabled: !!user && !!visitorId,
  });
};

export const useReengagementTasks = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["reengagement-tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reengagement_tasks")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ReengagementTask[];
    },
    enabled: !!user,
  });
};

export const useScoreVisitors = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("score-visitors");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["visitor-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["reengagement-tasks"] });
      toast({ title: "Visitor scoring complete", description: `${data?.scored ?? 0} visitors analyzed` });
    },
    onError: (e: any) => {
      toast({ title: "Scoring failed", description: e.message, variant: "destructive" });
    },
  });
};

export const useCompleteReengagement = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("reengagement_tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reengagement-tasks"] });
      toast({ title: "Task completed" });
    },
  });
};
