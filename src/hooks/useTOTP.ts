import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

interface TotpStatus {
  enrolled: boolean;
  verified: boolean;
  enrolledAt: string | null;
}

interface EnrollData {
  factorId: string;
  qrCode: string;
  secret: string;
  otpauthUrl: string;
}

interface VerifyResponse {
  verified?: boolean;
  enrolled?: boolean;
  restart_required?: boolean;
  reason?: string;
  message?: string;
  factorId?: string;
  qrCode?: string;
  secret?: string;
  otpauthUrl?: string;
}

export const useTOTP = () => {
  const queryClient = useQueryClient();
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);

  const { data: status, isLoading } = useQuery<TotpStatus>({
    queryKey: ["totp-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "status" },
      });
      if (error) throw error;
      return data as TotpStatus;
    },
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "enroll" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as EnrollData;
    },
    onSuccess: (data) => {
      setEnrollData(data);
      toast.success("Scan the QR code with your authenticator app");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: async (token: string): Promise<VerifyResponse> => {
      if (!enrollData?.factorId) throw new Error("No pending authenticator enrollment");
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "verify_enroll", token, factor_id: enrollData.factorId },
      });
      if (error) {
        const context = (error as { context?: Response }).context;
        if (context) {
          try {
            const payload = await context.clone().json();
            if (payload?.error) throw new Error(payload.error);
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message !== "Unexpected end of JSON input") throw parseError;
          }
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      return data as VerifyResponse;
    },
    onSuccess: (data) => {
      if (data?.restart_required && data.factorId && data.qrCode && data.secret && data.otpauthUrl) {
        setEnrollData({ factorId: data.factorId, qrCode: data.qrCode, secret: data.secret, otpauthUrl: data.otpauthUrl });
        toast.warning(data.message || "Rrjeti ndryshoi gjatë konfigurimit. Skano QR-në e re dhe provo përsëri.");
        return;
      }
      toast.success("2FA enabled successfully!");
      setEnrollData(null);
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
    onError: (e: Error) => toast.error(e.message),
  });

  return { status, isLoading, enrollData, enroll, verify, disable };
};
