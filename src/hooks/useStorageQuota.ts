import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export const useStorageQuota = () => {
  const { workspace } = useWorkspace();

  const { data: quota } = useQuery({
    queryKey: ["storage-quota", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return null;
      const { data, error } = await supabase
        .from("workspace_storage_quotas")
        .select("*")
        .eq("workspace_id", workspace.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id,
  });

  const checkUploadAllowed = (resourceType: "messages" | "documents" | "media" = "media"): boolean => {
    if (!quota) return true; // No quota set = allow

    let blocked = false;
    switch (resourceType) {
      case "messages":
        blocked = quota.messages_count >= quota.max_messages;
        break;
      case "documents":
        blocked = quota.documents_count >= quota.max_documents;
        break;
      case "media":
        blocked = quota.media_size_mb >= quota.max_media_mb;
        break;
    }

    if (blocked) {
      toast.error(`Storage quota exceeded for ${resourceType}. Please upgrade your plan or free up space.`);
    }

    return !blocked;
  };

  return {
    quota,
    isQuotaExceeded: quota?.is_quota_exceeded ?? false,
    checkUploadAllowed,
  };
};
