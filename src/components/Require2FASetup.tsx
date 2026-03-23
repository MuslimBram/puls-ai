import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { ShieldCheck, KeyRound, Loader2, Copy, Check, QrCode } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

export const Require2FASetup = ({ children }: Props) => {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [has2FA, setHas2FA] = useState(false);
  const [enrollData, setEnrollData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    check2FAStatus();
  }, [user]);

  const check2FAStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "status" },
      });
      if (!error && data?.verified) {
        setHas2FA(true);
      }
    } catch {
      // If check fails, allow access (don't lock users out)
      setHas2FA(true);
    }
    setChecking(false);
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "enroll" },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Dështoi krijimi i 2FA");
      } else {
        setEnrollData(data);
        toast.success("Skano QR kodin me aplikacionin e autentikimit");
      }
    } catch {
      toast.error("Gabim");
    }
    setEnrolling(false);
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "verify", token: verifyCode },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Kodi i gabuar");
      } else {
        toast.success("2FA u aktivizua me sukses!");
        setHas2FA(true);
        setEnrollData(null);
      }
    } catch {
      toast.error("Gabim gjatë verifikimit");
    }
    setVerifying(false);
  };

  const copySecret = () => {
    if (enrollData?.secret) {
      navigator.clipboard.writeText(enrollData.secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (has2FA) {
    return <>{children}</>;
  }

  // 2FA setup required
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Kërkohet 2FA</CardTitle>
          <CardDescription>
            Për sigurinë, duhet të aktivizosh autentikimin me dy faktorë para se të vazhdosh.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!enrollData ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="h-5 w-5 text-primary mt-0.5" />
                  <div className="text-sm text-foreground">
                    <p className="font-medium mb-1">Si funksionon?</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
                      <li>Shkarko Google Authenticator ose Authy</li>
                      <li>Skano QR kodin me aplikacionin</li>
                      <li>Fut kodin 6-shifror për të verifikuar</li>
                    </ol>
                  </div>
                </div>
              </div>
              <Button className="w-full" onClick={handleEnroll} disabled={enrolling}>
                {enrolling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                Fillo konfigurimin e 2FA
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
                <QrCode className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground mb-2">Skano këtë QR kod</p>
                <div className="mx-auto w-fit rounded-lg bg-background p-3 border border-border">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(enrollData.otpauthUrl)}`}
                    alt="TOTP QR Code"
                    className="h-48 w-48"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-3">Ose fut manualisht:</p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <code className="rounded bg-muted px-2 py-1 text-xs font-mono tracking-wider text-foreground">
                    {enrollData.secret}
                  </code>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={copySecret}>
                    {secretCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Kodi 6-shifror</Label>
                <Input
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  className="text-center text-xl font-mono tracking-[0.5em]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && verifyCode.length === 6) handleVerify();
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>

        {enrollData && (
          <CardFooter>
            <Button
              className="w-full"
              onClick={handleVerify}
              disabled={verifyCode.length !== 6 || verifying}
            >
              {verifying ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Po verifikon...</>
              ) : (
                <><ShieldCheck className="h-4 w-4 mr-2" /> Verifiko & Aktivizo</>
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
};
