import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Mail, Lock, Zap, ShieldCheck, Loader2, RefreshCw, Smartphone, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type TwoFAMethod = "choose" | "authenticator" | "authenticator_enroll" | "email";
type LoginStep = "credentials" | "security_code" | "2fa";

const Login = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextRaw = searchParams.get("next");
  const safeNext = nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : null;
  const postAuthTarget = safeNext ?? "/dashboard";
  const oauthRedirect = safeNext
    ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    : window.location.origin;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [needs2FA, setNeeds2FA] = useState(false);
  const [loginStep, setLoginStep] = useState<LoginStep>("credentials");
  const [twoFAMethod, setTwoFAMethod] = useState<TwoFAMethod>("choose");
  const [otpCode, setOtpCode] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [securityCode, setSecurityCode] = useState("");
  const [verifyingSecCode, setVerifyingSecCode] = useState(false);

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

  if (user && !needs2FA && loginStep === "credentials") {
    return <Navigate to={postAuthTarget} replace />;
  }

  const sendOTPCode = async () => {
    const { data, error } = await supabase.functions.invoke("totp-manage", {
      body: { action: "send_code" },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Failed to send code");
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

    // Check if user has a security code set
    try {
      const { data: codeCheck } = await supabase.functions.invoke("security-code-manage", {
        body: { action: "has_code" },
      });

      if (codeCheck?.has_code) {
        setLoginStep("security_code");
        setLoading(false);
        return;
      }

      // Check if there's a pending security code from registration
      const pendingCode = localStorage.getItem("pending_security_code");
      if (pendingCode) {
        await supabase.functions.invoke("security-code-manage", {
          body: { action: "set_code", code: pendingCode },
        });
        localStorage.removeItem("pending_security_code");
      }
    } catch {
      // If security code check fails, proceed to 2FA
    }

    setNeeds2FA(true);
    setLoginStep("2fa");
    setTwoFAMethod("choose");
    setLoading(false);
  };

  const handleSecurityCodeVerify = async () => {
    setVerifyingSecCode(true);
    try {
      const { data, error } = await supabase.functions.invoke("security-code-manage", {
        body: { action: "verify_code", code: securityCode },
      });

      if (error || !data?.verified) {
        toast.error("Wrong security code!");
        setVerifyingSecCode(false);
        return;
      }

      // Security code verified, proceed to 2FA
      setNeeds2FA(true);
      setLoginStep("2fa");
      setTwoFAMethod("choose");
    } catch {
      toast.error("Error verifying code");
    }
    setVerifyingSecCode(false);
  };

  const handleChooseAuthenticator = async () => {
    setEnrolling(true);
    try {
      const { data: statusData } = await supabase.functions.invoke("totp-manage", {
        body: { action: "check_totp_status" },
      });

      if (statusData?.enrolled) {
        setTwoFAMethod("authenticator");
        setOtpCode("");
      } else {
        const { data: enrollData, error: enrollError } = await supabase.functions.invoke("totp-manage", {
          body: { action: "enroll" },
        });

        if (enrollError || enrollData?.error) {
          toast.error(enrollData?.error || "Error during Authenticator setup");
          setEnrolling(false);
          return;
        }

        setQrCode(enrollData.qrCode);
        setTotpSecret(enrollData.secret);
        setTwoFAMethod("authenticator_enroll");
      }
    } catch {
      toast.error("Error checking Authenticator");
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
        toast.success("Code sent to your email");
      } else {
        toast.error("Email was not sent. Check email configuration.");
      }
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    const result = await sendOTPCode();
    if (result?.sent) {
      toast.success("New code sent to email");
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
        toast.error(data?.error || "Wrong code");
        setVerifying2FA(false);
        return;
      }

      toast.success("Verification successful!");
      navigate(postAuthTarget);
    } catch {
      toast.error("Verification error");
    }
    setVerifying2FA(false);
  };

  const handleCancel2FA = async () => {
    await supabase.auth.signOut();
    setNeeds2FA(false);
    setLoginStep("credentials");
    setTwoFAMethod("choose");
    setOtpCode("");
    setMaskedEmail("");
    setQrCode("");
    setTotpSecret("");
    setSecurityCode("");
  };

  // Security code verification screen
  if (loginStep === "security_code") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Security Code</CardTitle>
            <CardDescription>
              Enter your personal security code to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sec-code">Your code</Label>
              <Input
                id="sec-code"
                placeholder="e.g. Aabc@.123"
                value={securityCode}
                onChange={(e) => setSecurityCode(e.target.value)}
                maxLength={9}
                className="text-center text-xl font-mono tracking-wider"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && securityCode.length >= 9) handleSecurityCodeVerify();
                }}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={handleSecurityCodeVerify}
              disabled={securityCode.length < 9 || verifyingSecCode}
            >
              {verifyingSecCode ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Verifying...</>
              ) : (
                "Verify"
              )}
            </Button>
            <Button variant="ghost" className="w-full" onClick={handleCancel2FA}>
              Cancel
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 2FA method chooser
  if (needs2FA && twoFAMethod === "choose") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Two-Factor Verification</CardTitle>
            <CardDescription>Choose verification method</CardDescription>
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
                  Use the Authenticator app on your phone
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <ShieldCheck className="h-3 w-3 text-green-500" />
                  <span className="text-[10px] text-green-600 font-medium">Recommended · More secure</span>
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
                <p className="text-sm font-semibold text-foreground">Email Code</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Send a 6-digit code to your email
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                  <span className="text-[10px] text-orange-600 font-medium">Less secure</span>
                </div>
              </div>
            </Button>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" className="w-full" onClick={handleCancel2FA}>
              Cancel
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
            <CardTitle className="text-xl">Setup Google Authenticator</CardTitle>
            <CardDescription>
              Scan the QR code with Google Authenticator app or enter the manual code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {qrCode && (
              <div className="flex justify-center">
                <div className="rounded-xl border border-border bg-white p-4">
                  <img src={qrCode} alt="QR Code for Authenticator" className="h-48 w-48" />
                </div>
              </div>
            )}

            {totpSecret && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Manual code:</p>
                <p className="font-mono text-sm font-bold text-foreground tracking-wider break-all select-all">
                  {totpSecret}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="enroll-otp">Enter the 6-digit code from Authenticator</Label>
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
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Verifying...</>
              ) : (
                "Verify & Activate"
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setTwoFAMethod("choose")}>
              ← Back to methods
            </Button>
            <Button variant="ghost" className="w-full" onClick={handleCancel2FA}>
              Cancel
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
            <CardTitle className="text-2xl">Security Verification</CardTitle>
            <CardDescription>
              {isEmail ? (
                <>We sent a 6-digit code to <strong>{maskedEmail}</strong></>
              ) : (
                <>Enter the 6-digit code from Google Authenticator app</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">
                {isEmail ? "Code from Email" : "Code from Authenticator"}
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
                  <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Sending...</>
                ) : (
                  <><RefreshCw className="h-3 w-3 mr-1" /> Resend code</>
                )}
              </Button>
            )}

            {isEmail && (
              <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                <p className="text-xs text-orange-700 dark:text-orange-400">
                  Email code is less secure than Google Authenticator. We recommend using Authenticator for maximum security.
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
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Verifying...</>
              ) : (
                "Verify & Sign In"
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setTwoFAMethod("choose")}>
              ← Back to methods
            </Button>
            <Button variant="ghost" className="w-full" onClick={handleCancel2FA}>
              Cancel
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
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <CardDescription>Enter your credentials to sign in</CardDescription>
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
                  placeholder="email@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
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
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
            </div>

            {/* Google button */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={async () => {
                try {
                  const { error } = await lovable.auth.signInWithOAuth("google", {
                    redirect_uri: oauthRedirect,
                  });
                  if (error) {
                    toast.error("Google login failed: " + String(error));
                  }
                } catch (err) {
                  console.error("Google OAuth error:", err);
                  toast.error("Could not connect to Google. Please try again.");
                }
              }}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </Button>

            {/* Apple button */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={async () => {
                try {
                  const { error } = await lovable.auth.signInWithOAuth("apple", {
                    redirect_uri: oauthRedirect,
                  });
                  if (error) {
                    toast.error("Apple login failed: " + String(error));
                  }
                } catch (err) {
                  console.error("Apple OAuth error:", err);
                  toast.error("Could not connect to Apple. Please try again.");
                }
              }}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </Button>

            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/register" className="text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Login;
