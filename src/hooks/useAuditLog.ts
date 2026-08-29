import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCallback } from "react";

export const useAuditLog = () => {
  const { user } = useAuth();

  const log = useCallback(
    async (action: string, targetType?: string, targetId?: string, metadata?: Record<string, unknown>) => {
      if (!user) return;
      const { error } = await (supabase as any).rpc("record_client_audit_event", {
        _action: action,
        _target_type: targetType ?? null,
        _target_id: targetId ?? null,
        _metadata: metadata ?? {},
      });
      if (error) console.warn("[Audit] Client audit event rejected:", error.message);
    },
    [user],
  );

  return { log };
};
