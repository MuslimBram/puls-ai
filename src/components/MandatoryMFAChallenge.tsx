import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface Props {
  onVerified: () => void;
}

export const MandatoryMFAChallenge = ({ onVerified }: Props) => {
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;

        const verified = data.totp.find((factor) => factor.status === "verified");
        if (verified) {
          if (!cancelled) setFactorId(verified.id);
          return;
        }

        if (!cancelled) {
          navigate("/session-security?require_2fa=true&reason=mandatory_mfa", { replace: true });
        }
      } catch (error) {
        console.error("[Auth] Failed to load MFA factors:", error);
        if (!cancelled) toast.error("Nuk mund të ngarkohej verifikimi TOTP.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const verify = async () => {
    if (!factorId || !/^\d{6}$/.test(code)) return;

    setVerifying(true);
    try {
      const { data, error } = await supabase.auth.mfa.challenge({ factorId });
      if (error) throw error;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: data.id,
        code,
      });
      if (verifyError) throw verifyError;

      await supabase.auth.refreshSession();
      toast.success("TOTP u verifikua me sukses.");
      onVerified();
    } catch (error) {
      console.error("[Auth] TOTP challenge failed:", error);
      toast.error(error instanceof Error ? error.message : "Kodi TOTP është i gabuar ose ka skaduar.");
      setCode("");
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!factorId) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md border-border/80 bg-card/90 shadow-2xl backdrop-blur-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Verifikimi me TOTP</CardTitle>
          <CardDescription>
            Kjo verifikim është i detyrueshëm për të hyrë në Pulse AI. Hap Google Authenticator dhe vendos kodin 6-shifror.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(event) => {
              if (event.key === "Enter") void verify();
            }}
            className="text-center text-2xl font-mono tracking-[0.35em]"
            autoFocus
          />
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={verify} disabled={code.length !== 6 || verifying}>
            {verifying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Duke verifikuar...</> : "Verifiko dhe vazhdo"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
