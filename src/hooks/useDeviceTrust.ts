// src/hooks/useDeviceTrust.ts
// ============================================================
// Thirret menjëherë pas login-it të suksesshëm
// Kontrollon pajisjen te backend dhe kthen statusin:
//   allowed → vazhdo normalisht
//   pending_approval → shfaq faqen e pritjes
//   blocked → çkyçe dhe shfaq mesazh bllokimi
// ============================================================

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

type DeviceTrustOutcome = "allowed" | "pending_approval" | "blocked" | "checking" | "idle";

export function useDeviceTrust() {
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<DeviceTrustOutcome>("idle");
  const [riskLevel, setRiskLevel] = useState<string>("");

  const checkDeviceTrust = useCallback(async () => {
    setOutcome("checking");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setOutcome("idle"); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-device-trust`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            user_agent: navigator.userAgent,
            platform: navigator.platform,
            ip_address: null, // lexohet nga headers te backend
          }),
        }
      );

      const data = await res.json() as {
        outcome: DeviceTrustOutcome;
        risk_level?: string;
        message?: string;
      };

      setOutcome(data.outcome);
      setRiskLevel(data.risk_level ?? "");

      if (data.outcome === "pending_approval") {
        // Ruaj gjendjen te localStorage për faqen e pritjes
        localStorage.setItem("device_trust_pending", "true");
        navigate("/waiting-approval");
      } else if (data.outcome === "blocked") {
        toast({
          title: "Hyrja u bllokua",
          description: data.message ?? "Kontaktoni administratorin.",
          variant: "destructive",
        });
        await supabase.auth.signOut();
        navigate("/login?blocked=true");
      }
      // "allowed" → vazhdo normalisht (nuk bën asgjë)

    } catch (err) {
      // Nëse kontrolli dështon, lejo hyrjen (mos bloko për gabim teknik)
      console.warn("Device trust check failed, allowing:", err);
      setOutcome("allowed");
    }
  }, [navigate]);

  return { outcome, riskLevel, checkDeviceTrust };
}
