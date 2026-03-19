import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface WorkspaceBranding {
  id: string;
  workspace_id: string;
  business_name: string | null;
  tagline: string | null;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  primary_foreground: string;
  accent_color: string;
  accent_foreground: string;
  brand_gradient_from: string | null;
  brand_gradient_to: string | null;
  heading_font: string;
  body_font: string;
  chat_widget_position: string;
  chat_widget_greeting: string;
  chat_widget_avatar_url: string | null;
  chat_widget_bubble_color: string | null;
  email_header_html: string | null;
  email_footer_html: string | null;
  email_from_name: string | null;
  login_background_url: string | null;
  login_welcome_text: string | null;
  custom_css: string | null;
  powered_by_visible: boolean;
  created_at: string;
  updated_at: string;
}

export const useWorkspaceBranding = () => {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const brandingQuery = useQuery({
    queryKey: ["workspace-branding", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_branding")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .maybeSingle();
      if (error) throw error;
      return data as WorkspaceBranding | null;
    },
    enabled: !!workspace,
  });

  const upsertBranding = useMutation({
    mutationFn: async (updates: Partial<WorkspaceBranding>) => {
      const { error } = await supabase
        .from("workspace_branding")
        .upsert({
          workspace_id: workspace!.id,
          ...updates,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "workspace_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-branding"] });
      toast.success("Branding saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadLogo = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: "logo" | "logo_dark" | "favicon" | "login_bg" | "chat_avatar" }) => {
      const ext = file.name.split(".").pop();
      const path = `branding/${workspace!.id}/${type}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("generated-media")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("generated-media")
        .getPublicUrl(path);

      const fieldMap: Record<string, string> = {
        logo: "logo_url",
        logo_dark: "logo_dark_url",
        favicon: "favicon_url",
        login_bg: "login_background_url",
        chat_avatar: "chat_widget_avatar_url",
      };

      await upsertBranding.mutateAsync({ [fieldMap[type]]: urlData.publicUrl } as any);
      return urlData.publicUrl;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    branding: brandingQuery.data,
    isLoading: brandingQuery.isLoading,
    upsertBranding,
    uploadLogo,
  };
};
