import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export type SendableChannel = "whatsapp" | "instagram" | "facebook" | "sms" | "email" | "telegram";

interface SendMessageParams {
  channel: SendableChannel;
  to: string; // phone, email, recipient_id, chat_id
  message: string;
  // WhatsApp-specific
  type?: "text" | "template" | "image" | "document";
  template_name?: string;
  template_language?: string;
  template_params?: string[];
  media_url?: string;
  media_caption?: string;
  // Email-specific
  subject?: string;
  reply_to_message_id?: string;
  // Telegram-specific
  chat_id?: string | number;
  parse_mode?: "HTML" | "Markdown";
  // SMS-specific
  from?: string;
  user_id?: string;
}

const CHANNEL_FUNCTION_MAP: Record<SendableChannel, string> = {
  whatsapp: "send-whatsapp",
  instagram: "send-meta-message",
  facebook: "send-meta-message",
  sms: "send-sms",
  email: "send-email",
  telegram: "send-telegram",
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendMessageParams) => {
      const fnName = CHANNEL_FUNCTION_MAP[params.channel];
      if (!fnName) throw new Error(`Unsupported channel: ${params.channel}`);

      let body: Record<string, any>;

      switch (params.channel) {
        case "whatsapp":
          body = {
            to: params.to,
            message: params.message,
            type: params.type || "text",
            template_name: params.template_name,
            template_language: params.template_language,
            template_params: params.template_params,
            media_url: params.media_url,
            media_caption: params.media_caption,
          };
          break;
        case "instagram":
        case "facebook":
          body = {
            channel: params.channel,
            recipient_id: params.to,
            message: params.message,
            media_url: params.media_url,
          };
          break;
        case "sms":
          body = {
            to: params.to,
            body: params.message,
            from: params.from,
            user_id: params.user_id,
          };
          break;
        case "email":
          body = {
            to: params.to,
            subject: params.subject || "",
            body: params.message,
            reply_to_message_id: params.reply_to_message_id,
          };
          break;
        case "telegram":
          body = {
            chat_id: params.chat_id || params.to,
            message: params.message,
            parse_mode: params.parse_mode,
          };
          break;
        default:
          throw new Error(`Unknown channel: ${params.channel}`);
      }

      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-threads"] });
      queryClient.invalidateQueries({ queryKey: ["thread-messages"] });
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      toast.success("Message sent");
    },
    onError: (e) => toast.error(e.message),
  });
};
