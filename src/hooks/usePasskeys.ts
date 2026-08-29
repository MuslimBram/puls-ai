import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface PasskeySummary {
  id: string;
  friendly_name?: string | null;
  created_at: string;
  last_used_at?: string | null;
}

export const usePasskeys = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["auth-passkeys"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.passkey.list();
      if (error) throw error;
      return (data ?? []) as PasskeySummary[];
    },
  });

  const register = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      return data as PasskeySummary;
    },
    onSuccess: () => {
      toast.success("Passkey registered on this device");
      queryClient.invalidateQueries({ queryKey: ["auth-passkeys"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rename = useMutation({
    mutationFn: async ({ passkeyId, friendlyName }: { passkeyId: string; friendlyName: string }) => {
      const { error } = await supabase.auth.passkey.update({ passkeyId, friendlyName });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Passkey name updated");
      queryClient.invalidateQueries({ queryKey: ["auth-passkeys"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (passkeyId: string) => {
      const { error } = await supabase.auth.passkey.delete({ passkeyId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Passkey removed");
      queryClient.invalidateQueries({ queryKey: ["auth-passkeys"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const signIn = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      return data;
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    passkeys: query.data ?? [],
    isLoading: query.isLoading,
    register,
    rename,
    remove,
    signIn,
  };
};
