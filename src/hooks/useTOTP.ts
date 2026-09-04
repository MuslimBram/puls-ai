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

export const useTOTP = () => {
  const queryClient = useQueryClient();
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);

  const { data: status, isLoading } = useQuery<TotpStatus>({
    queryKey: ["totp-status"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verified = data?.totp?.some((factor) => factor.status === "verified") ?? false;
      return { enrolled: verified, verified, enrolledAt: null };
    },
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const verified = factors?.totp?.find((factor) => factor.status === "verified");
      if (verified) throw new Error("TOTP tashmë i konfiguruar");

      const pending = factors?.totp?.find((factor) => factor.status === "unverified");
      if (pending) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: pending.id });
        if (error) throw error;
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Pulse AI Authenticator",
      });
      if (error) throw error;

      return {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        otpauthUrl: data.totp.uri,
      } as EnrollData;
    },
    onSuccess: (data) => {
      setEnrollData(data);
      toast.success("Scan the QR code with your authenticator app");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: async (token: string) => {
      const factorId = enrollData?.factorId;
      if (!factorId) throw new Error("No pending authenticator enrollment");
      if (!/^\d{6}$/.test(token)) throw new Error("Kodi duhet të jetë 6 shifra");

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: token,
      });
      if (verifyError) throw verifyError;

      await supabase.auth.refreshSession();
      return { verified: true, enrolled: true };
    },
    onSuccess: () => {
      toast.success("2FA enabled successfully!");
      setEnrollData(null);
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disable = useMutation({
    mutationFn: async (token: string) => {
      if (!/^\d{6}$/.test(token)) throw new Error("Kodi duhet të jetë 6 shifra");

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factor = factors?.totp?.find((item) => item.status === "verified");
      if (!factor) throw new Error("TOTP nuk është konfiguruar");

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: token,
      });
      if (verifyError) throw verifyError;

      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) throw unenrollError;
      return true;
    },
    onSuccess: () => {
      toast.success("2FA disabled");
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { status, isLoading, enrollData, enroll, verify, disable };
};
