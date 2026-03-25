import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Mail, Lock, Zap, ShieldCheck, Loader2, RefreshCw, Smartphone, AlertTriangle } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/contexts/AuthContext";

type TwoFAMethod = "choose" | "authenticator" | "authenticator_enroll" | "email";

const Login = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<TwoFAMethod>("choose");
  const [otpCode, setOtpCode] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [resending, setResending] = useState(false);

  // TOTP enrollment state
  const [qrCode, setQrCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user && !needs2FA) {
    return <Navigate to="/dashboard" replace />;
  }

  const sendOTPCode = async () => {
    const { data, error } = await supabase.functions.invoke("totp-manage", {
      body: { action: "send_code" },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Dërgimi i kodit dështoi");
      return null;
    }
    return data;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setNeeds2FA(true);
    setTwoFAMethod("choose");
    setLoading(false);
  };

  const handleChooseAuthenticator = async () => {
    setEnrolling(true);
    try {
      // Check if TOTP is already enrolled
      const { data: statusData } = await supabase.functions.invoke("totp-manage", {
        body: { action: "check_totp_status" },
      });

      if (statusData?.enrolled) {
        // Already enrolled, go to code input
        setTwoFAMethod("authenticator");
        setOtpCode("");
      } else {
        // Not enrolled, start enrollment
        const { data: enrollData, error: enrollError } = await supabase.functions.invoke("totp-manage", {
          body: { action: "enroll" },
        });

        if (enrollError || enrollData?.error) {
          toast.error(enrollData?.error || "Gabim gjatë regjistrimit të Authenticator");
          setEnrolling(false);
          return;
        }

        setQrCode(enrollData.qrCode);
        setTotpSecret(enrollData.secret);
        setTwoFAMethod("authenticator_enroll");
      }
    } catch {
      toast.error("Gabim gjatë kontrollit të Authenticator");
    }
    setEnrolling(false);
    setOtpCode("");
  };

  const handleChooseEmail = async () => {
    setTwoFAMethod("email");
    setOtpCode("");
    const result = await sendOTPCode();
    if (result) {
      setMaskedEmail(result.email || email);
      if (result.sent) {
        toast.success("Kodi u dërgua në email-in tuaj");
      } else {
        toast.error("Email nuk u dërgua. Kontrolloni konfigurimin e email-it.");
      }
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    const result = await sendOTPCode();
    if (result?.sent) {
      toast.success("Kodi i ri u dërgua në email");
    }
    setResending(false);
  };

  const handle2FAVerify = async () => {
    setVerifying2FA(true);
    try {
      let action: string;
      if (twoFAMethod === "authenticator_enroll") {
        action = "verify_enroll";
      } else if (twoFAMethod === "authenticator") {
        action = "verify_totp";
      } else {
        action = "verify_code";
      }

      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action, token: otpCode },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Kodi i gabuar");
        setVerifying2FA(false);
        return;
      }

      toast.success("Verifikimi u krye me sukses!");
      navigate("/dashboard");
    } catch {
      toast.error("Gabim gjatë verifikimit");
    }
    setVerifying2FA(false);
  };

  const handleCancel2FA = async () => {
    await supabase.auth.signOut();
    setNeeds2FA(false);
    setTwoFAMethod("choose");
    setOtpCode("");
    setMaskedEmail("");
    setQrCode("");
    setTotpSecret("");
  };

  // 2FA method chooser
  if (needs2FA && twoFAMethod === "choose") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Verifikimi 2-Faktorësh</CardTitle>
            <CardDescription>Zgjidhni metodën e verifikimit</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full h-auto py-4 flex items-start gap-4 justify-start text-left"
              onClick={handleChooseAuthenticator}
              disabled={enrolling}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                {enrolling ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                ) : (
                  <Smartphone className="h-5 w-5 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Google Authenticator</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Përdorni aplikacionin Authenticator në telefonin tuaj
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <ShieldCheck className="h-3 w-3 text-green-500" />
                  <span className="text-[10px] text-green-600 font-medium">E rekomanduar · Më e sigurt</span>
                </div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full h-auto py-4 flex items-start gap-4 justify-start text-left"
              onClick={handleChooseEmail}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                <Mail className="h-5 w-5 text-orange-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Kod me Email</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Dërgoni një kod 6-shifror në email-in tuaj
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                  <span className="text-[10px] text-orange-600 font-medium">Më pak e sigurt</span>
                </div>
              </div>
            </Button>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" className="w-full" onClick={handleCancel2FA}>
              Anullo
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // TOTP enrollment screen - show QR code
  if (needs2FA && twoFAMethod === "authenticator_enroll") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-xl">Konfiguro Google Authenticator</CardTitle>
            <CardDescription>
              Skanoni kodin QR me aplikacionin Google Authenticator ose futni kodin manual
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* QR Code */}
            {qrCode && (
              <div className="flex justify-center">
                <div className="rounded-xl border border-border bg-white p-4">
                  <img src={qrCode} alt="QR Code për Authenticator" className="h-48 w-48" />
                </div>
              </div>
            )}

            {/* Manual secret */}
            {totpSecret && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Kodi manual:</p>
                <p className="font-mono text-sm font-bold text-foreground tracking-wider break-all select-all">
                  {totpSecret}
                </p>
              </div>
            )}

            {/* Verification code input */}
            <div className="space-y-2">
              <Label htmlFor="enroll-otp">Futni kodin 6-shifror nga Authenticator</Label>
              <Input
                id="enroll-otp"
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                className="text-center text-xl font-mono tracking-[0.5em]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && otpCode.length === 6) handle2FAVerify();
                }}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={handle2FAVerify}
              disabled={otpCode.length !== 6 || verifying2FA}
            >
              {verifying2FA ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Po verifikon...</>
              ) : (
                "Verifiko & Aktivizo"
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setTwoFAMethod("choose")}>
              ← Kthehu te metodat
            </Button>
            <Button variant="ghost" className="w-full" onClick={handleCancel2FA}>
              Anullo
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 2FA code input (authenticator or email)
  if (needs2FA && (twoFAMethod === "authenticator" || twoFAMethod === "email")) {
    const isEmail = twoFAMethod === "email";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Verifikimi i Sigurisë</CardTitle>
            <CardDescription>
              {isEmail ? (
                <>Kemi dërguar një kod 6-shifror te <strong>{maskedEmail}</strong></>
              ) : (
                <>Futni kodin 6-shifror nga aplikacioni Google Authenticator</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">
                {isEmail ? "Kodi nga Email-i" : "Kodi nga Authenticator"}
              </Label>
              <Input
                id="otp"
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                className="text-center text-xl font-mono tracking-[0.5em]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && otpCode.length === 6) handle2FAVerify();
                }}
              />
            </div>

            {isEmail && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={handleResendCode}
                disabled={resending}
              >
                {resending ? (
                  <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Po dërgohet...</>
                ) : (
                  <><RefreshCw className="h-3 w-3 mr-1" /> Dërgo kodin përsëri</>
                )}
              </Button>
            )}

            {isEmail && (
              <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                <p className="text-xs text-orange-700 dark:text-orange-400">
                  Kodi me email është më pak i sigurt se Google Authenticator. Rekomandojmë të përdorni Authenticator për siguri maksimale.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={handle2FAVerify}
              disabled={otpCode.length !== 6 || verifying2FA}
            >
              {verifying2FA ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Po verifikon...</>
              ) : (
                "Verifiko & Hyr"
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setTwoFAMethod("choose")}>
              ← Kthehu te metodat
            </Button>
            <Button variant="ghost" className="w-full" onClick={handleCancel2FA}>
              Anullo
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Hyr në Llogari</CardTitle>
          <CardDescription>Fut kredencialet për të hyrë në panel</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="email@shembull.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Fjalëkalimi</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Harrove fjalëkalimin?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Po hyn..." : "Hyr"}
            </Button>
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">ose</span></div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={async () => {
                const { error } = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin,
                });
                if (error) toast.error(String(error));
              }}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Vazhdo me Google
            </Button>
            <p className="text-sm text-muted-foreground">
              Nuk ke llogari?{" "}
              <Link to="/register" className="text-primary hover:underline">
                Regjistrohu
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Login;
