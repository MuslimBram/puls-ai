// src/pages/WaitingApproval.tsx
// ============================================================
// Faqja që shfaqet kur hyrja pret miratimin e admin-it
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Clock, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WaitingApproval() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState(30);

  // Kontrollim periodik çdo 30 sekonda
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { checkApprovalStatus(); return 30; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const checkApprovalStatus = async () => {
    setChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }

      // Kontrollo nëse ka approval të re
      const { data: recentAttempt } = await supabase
        .from("login_attempts")
        .select("outcome")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentAttempt?.outcome === "approved") {
        localStorage.removeItem("device_trust_pending");
        navigate("/dashboard");
      } else if (recentAttempt?.outcome === "rejected") {
        await supabase.auth.signOut();
        navigate("/login?rejected=true");
      }
    } catch {
      // vazhdo pritjen
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        {/* Ikona */}
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
          <Shield className="h-8 w-8 text-amber-500" />
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-2">
          Pajisje e re e panjohur
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          Sistemi i sigurisë zbuloi se po hyni nga një pajisje ose vendndodhje
          e re. Administratori u njoftua dhe po shqyrton kërkesën tuaj.
        </p>

        {/* Info kartë */}
        <div className="bg-muted rounded-xl p-4 text-left space-y-3 mb-6">
          <div className="flex items-start gap-3">
            <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Administratori mori email me buton{" "}
              <strong className="text-foreground">APROVO / REFUZO</strong>.
              Pasi të veprojë, ju do të njoftoheni menjëherë.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Koha maksimale e pritjes:{" "}
              <strong className="text-foreground">2 orë</strong>. Pas kësaj
              kohe kërkesa skadon dhe duhet të provoni sërish.
            </p>
          </div>
        </div>

        {/* Buton refresh */}
        <Button
          variant="outline"
          className="w-full"
          onClick={checkApprovalStatus}
          disabled={checking}
        >
          {checking ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Kontrollo statusin {!checking && `(${countdown}s)`}
        </Button>

        <button
          className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate("/login");
          }}
        >
          Çkyçu dhe provo me llogari tjetër
        </button>
      </div>
    </div>
  );
}
