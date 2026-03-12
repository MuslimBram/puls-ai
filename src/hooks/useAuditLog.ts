import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCallback } from "react";

export const useAuditLog = () => {
  const { user } = useAuth();

  const log = useCallback(
    async (action: string, targetType?: string, targetId?: string, metadata?: Record<string, unknown>) => {
      if (!user) return;
      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        action,
        target_type: targetType,
        target_id: targetId,
        metadata: metadata ?? {},
      } as any);
    },
    [user]
  );

  return { log };
};
