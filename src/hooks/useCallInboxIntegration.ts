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
      // Use the existing upsert function to create/update thread
      const { data: threadId, error } = await supabase.rpc("upsert_conversation_thread", {
        _user_id: user!.id,
        _channel_type: "voice",
        _contact_identifier: params.contactPhone,
        _contact_name: params.contactName || params.contactPhone,
        _message_preview: `${params.direction === "inbound" ? "📞 Incoming" : "📤 Outgoing"} call`,
        _direction: params.direction,
      });
      if (error) throw error;

      // Link call record to thread
      if (threadId) {
        await supabase
          .from("call_records")
          .update({ thread_id: threadId } as any)
          .eq("id", params.callRecordId);
      }

      return threadId;
    },
  });

  return { createThreadForCall };
};
