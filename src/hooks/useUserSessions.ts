import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface UserSession {
  id: string;
  user_id: string;
  device_info: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
  last_active_at: string;
  created_at: string;
}

export const useUserSessions = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-sessions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("*")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .order("last_active_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as UserSession[];
    },
    enabled: !!user,
  });
};

export const useRegisterSession = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("user_sessions").insert({
        user_id: user.id,
        user_agent: navigator.userAgent,
        device_info: {
          platform: navigator.platform,
          language: navigator.language,
          screen: `${screen.width}x${screen.height}`,
        },
      } as any);
      if (error) console.error("Session register error:", error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-sessions"] }),
  });
};

export const useRevokeSession = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("user_sessions")
        .update({ is_active: false } as any)
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-sessions"] });
      toast({ title: "Session revoked" });
    },
  });
};
