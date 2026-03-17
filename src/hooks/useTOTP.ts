import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export const useTOTP = () => {
  const queryClient = useQueryClient();
  const [enrollData, setEnrollData] = useState<{ secret: string; otpauthUrl: string } | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["totp-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "status" },
      });
      if (error) throw error;
      return data as { enrolled: boolean; verified: boolean; enrolledAt: string | null };
    },
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "enroll" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { secret: string; otpauthUrl: string };
    },
    onSuccess: (data) => {
      setEnrollData(data);
      toast.success("Scan the QR code with your authenticator app");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "verify", token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("2FA enabled successfully!");
      setEnrollData(null);
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const disable = useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "disable", token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("2FA disabled");
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    status,
    isLoading,
    enrollData,
    enroll,
    verify,
    disable,
  };
};
