import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Creates a conversation thread in the inbox when a call starts,
 * linking the call record to the thread for unified view.
 */
export const useCallInboxIntegration = () => {
  const { user } = useAuth();

  const createThreadForCall = useMutation({
    mutationFn: async (params: {
      callRecordId: string;
      contactPhone: string;
      contactName?: string;
      direction: "inbound" | "outbound";
    }) => {
      const { data: callRecord, error: callRecordError } = await supabase
        .from("call_records")
        .select("workspace_id")
        .eq("id", params.callRecordId)
        .single();
      if (callRecordError) throw callRecordError;

      const workspaceId = (callRecord as { workspace_id: string | null }).workspace_id;
      if (!workspaceId) throw new Error("Call record is not linked to a workspace.");

      // The browser uses a caller-bound SECURITY INVOKER RPC. Service-side channel
      // functions continue using the explicit-user, service-role-only RPC.
      const { data: threadId, error } = await (supabase.rpc as any)("upsert_my_conversation_thread", {
        _workspace_id: workspaceId,
        _channel_type: "voice",
        _contact_identifier: params.contactPhone,
        _contact_name: params.contactName || params.contactPhone,
        _message_preview: `${params.direction === "inbound" ? "📞 Incoming" : "📤 Outgoing"} call`,
        _direction: params.direction,
      });
      if (error) throw error;

      // Link only the call record from the same authoritative workspace.
      if (threadId) {
        const { error: linkError } = await supabase
          .from("call_records")
          .update({ thread_id: threadId } as any)
          .eq("id", params.callRecordId)
          .eq("workspace_id", workspaceId);
        if (linkError) throw linkError;
      }

      return threadId;
    },
  });

  return { createThreadForCall };
};
