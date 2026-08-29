import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { validateInternalPath } from "@/lib/safeNavigate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface FactorState {
  factorId: string;
  verified: boolean;
  qrCode: string | null;
  secret: string | null;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [phase, setPhase] = useState<"loading" | "setup" | "verify" | "done">("loading");
  const [factor, setFactor] = useState<FactorState | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safeNext = validateInternalPath(params.get("next")) ?? "/dashboard";
  const registrationMfaRequired =
    typeof window !== "undefined" &&
    (localStorage.getItem("registration_mfa_required") === "1" ||
      localStorage.getItem("pending_security_code") !== null);

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const prepareRegistrationMfa = async () => {
      setError(null);
      try {
        const { data, error: factorError } = await supabase.auth.mfa.listFactors();
        if (factorError) throw factorError;

        const verified = data?.totp?.find((item) => item.status === "verified");
        if (verified) {
          setFactor({ factorId: verified.id, verified: true, qrCode: null, secret: null });
          setPhase("verify");
          return;
        }

        const pending = data?.totp?.find((item) => item.status === "unverified");
        if (pending) {
          setFactor({ factorId: pending.id, verified: false, qrCode: null, secret: null });
          setPhase("setup");
          return;
        }

        const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Pulse AI Authenticator",
        });
        if (enrollError) throw enrollError;

        setFactor({
          factorId: enrolled.id,
          verified: false,
          qrCode: enrolled.totp.qr_code,
          secret: enrolled.totp.secret,
        });
        setPhase("setup");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not prepare two-factor authentication");
        setPhase("setup");
      }
    };

    const routeSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionError) {
        setError(sessionError.message);
        setPhase("done");
        return;
      }

      const session = data.session;
      if (session) {
        if (registrationMfaRequired) {
          await prepareRegistrationMfa();
        } else {
          window.location.replace(safeNext);
        }
        return;
      }

      const sub = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        if (!nextSession || cancelled) return;
        sub.data.subscription.unsubscribe();
        unsubscribe = null;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (registrationMfaRequired) {
          await prepareRegistrationMfa();
        } else {
          window.location.replace(safeNext);
        }
      });
      unsubscribe = () => sub.data.subscription.unsubscribe();

      fallbackTimer = setTimeout(() => {
        if (cancelled) return;
        unsubscribe?.();
        unsubscribe = null;
        navigate(`/login?next=${encodeURIComponent(safeNext)}`, { replace: true });
      }, 5000);
    };

    void routeSession();

    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      unsubscribe?.();
    };
  }, [navigate, safeNext, registrationMfaRequired]);

  const verifyEnrollmentOrFactor = async () => {
    if (!factor?.factorId || code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      await supabase.auth.refreshSession();
      localStorage.removeItem("registration_mfa_required");
      localStorage.removeItem("pending_security_code");
      localStorage.removeItem("registration_source");
      toast.success("Two-factor authentication is enabled.");
      setPhase("done");
      window.location.replace(safeNext);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification failed");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "done") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </main>
    );
  }

  if (registrationMfaRequired && (phase === "setup" || phase === "verify")) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <Card className="w-full max-w-md border-border/80 bg-card/95 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">
              {phase === "setup" ? "Secure your account" : "Confirm your 2FA"}
            </CardTitle>
            <CardDescription>
              {phase === "setup"
                ? "Two-factor authentication is required to finish registration."
                : "Enter the code from your authenticator app to finish registration."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {phase === "setup" && (
              <>
                {factor?.qrCode && (
                  <div className="flex justify-center">
                    <div className="rounded-xl border border-border bg-white p-4">
                      <img src={factor.qrCode} alt="QR code for two-factor authentication" className="h-52 w-52" />
                    </div>
                  </div>
                )}
                {factor?.secret && (
                  <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Manual setup key</p>
                    <p className="font-mono text-sm font-bold tracking-wider break-all select-all">{factor.secret}</p>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="registration-mfa-code">Authenticator code</Label>
              <Input
                id="registration-mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-xl font-mono tracking-widest"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter" && code.length === 6 && !busy) void verifyEnrollmentOrFactor();
                }}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button className="w-full" onClick={() => void verifyEnrollmentOrFactor()} disabled={code.length !== 6 || busy}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : "Finish registration securely"}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </main>
  );
}
