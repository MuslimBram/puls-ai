import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Mail, Lock, User, Zap, Building2, Briefcase, Check, ArrowLeft, ArrowRight, Crown, ShieldCheck, Users } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

type AccountType = "business" | "freelancer" | "ambassador" | null;
type Step = "account-type" | "plan-selection" | "credentials";

interface PlanTier {
  key: string;
  name: string;
  basePrice: number;
  highlighted?: boolean;
}

interface DurationOption {
  key: string;
  label: string;
  months: number;
  discountPercent: number;
}

const DURATION_OPTIONS: DurationOption[] = [
  { key: "trial", label: "7-Day Trial", months: 0, discountPercent: 0 },
  { key: "monthly", label: "Monthly", months: 1, discountPercent: 0 },
  { key: "3-month", label: "3 Months", months: 3, discountPercent: 5 },
  { key: "6-month", label: "6 Months", months: 6, discountPercent: 10 },
  { key: "yearly", label: "Yearly", months: 12, discountPercent: 15 },
];

const getDiscountedPrice = (base: number, discountPercent: number) =>
  Math.round(base * (1 - discountPercent / 100) * 100) / 100;

const formatPrice = (base: number, discountPercent: number) => {
  const price = getDiscountedPrice(base, discountPercent);
  return `€${price}`;
};

const Register = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || "";
  const [step, setStep] = useState<Step>("account-type");

  // Fetch pricing from DB (single source of truth)
  const { data: dbPlans } = useQuery({
    queryKey: ["pricing-settings-register"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_settings" as any)
        .select("plan_key, plan_label, monthly_price, is_donation")
        .eq("is_donation", false)
        .order("monthly_price");
      if (error) throw error;
      return (data || []) as unknown as { plan_key: string; plan_label: string | null; monthly_price: number }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const PLAN_TIERS: PlanTier[] = (dbPlans || []).map((p, i) => ({
    key: p.plan_key,
    name: p.plan_label || p.plan_key,
    basePrice: Number(p.monthly_price),
    highlighted: i === 1,
  }));
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>(null);
  const [companyName, setCompanyName] = useState("");
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [securityCode, setSecurityCode] = useState("");
  const [securityCodeError, setSecurityCodeError] = useState("");

  const validateSecurityCode = (code: string): boolean => {
    const regex = /^[A-Z][a-zA-Z]{3}[!@#$%^&*+\-=~][.,;:!?'"]{1}\d{3}$/;
    return regex.test(code);
  };

  const handleAccountTypeNext = () => {
    if (!accountType) {
      toast.error("Select an account type");
      return;
    }
    // All account types start with 7-day free trial on the Start plan.
    // The user can pick/upgrade a plan later from the Subscription page.
    setSelectedTier("standard");
    setSelectedDuration("trial");
    setStep("credentials");
  };

  const handlePlanNext = () => {
    // Plan selection is optional during registration — default to Start + trial.
    if (!selectedTier) setSelectedTier("standard");
    if (!selectedDuration) setSelectedDuration("trial");
    setStep("credentials");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (!securityCode || !validateSecurityCode(securityCode)) {
      setSecurityCodeError("Format: 1 uppercase + 3 letters + 1 symbol (!@#$) + 1 punctuation (.,;:) + 3 digits (e.g. Aabc@.123)");
      return;
    }
    setSecurityCodeError("");
    setLoading(true);

    try {
      const { data: fraudData, error: fraudError } = await supabase.functions.invoke("ai-registration-check", {
        body: {
          full_name: fullName,
          email,
          account_type: accountType,
          company_name: companyName || null,
          referral_code: refCode || null,
        },
      });

      if (fraudError) console.error("AI fraud check error:", fraudError);

      if (fraudData?.blocked) {
        toast.error("Registration could not be completed. Contact support.");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            account_type: accountType,
            company_name: companyName || null,
            billing_plan: selectedTier,
            billing_duration: selectedDuration,
            ...(refCode ? { referral_code: refCode } : {}),
            ...(fraudData?.risk_score !== undefined ? { ai_risk_score: fraudData.risk_score } : {}),
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        toast.error(error.message);
      } else {
        localStorage.setItem("pending_security_code", securityCode);
        toast.success("Check your email to confirm your account");
        navigate("/login");
      }
    } catch {
      toast.error("Registration failed. Try again.");
    }
    setLoading(false);
  };

  const currentTier = PLAN_TIERS.find((t) => t.key === selectedTier);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>
            {step === "account-type" && "Choose your account type"}
            {step === "plan-selection" && "Choose your billing plan"}
            {step === "credentials" && "Fill in your details"}
          </CardDescription>
          <div className="mx-auto mt-3 flex items-center gap-2">
            {["account-type", "plan-selection", "credentials"].map((s, i) => (
              <div
                key={s}
                className={cn(
                  "h-2 rounded-full transition-all",
                  s === step ? "w-8 bg-primary" : "w-2 bg-muted",
                  (step === "credentials" && (accountType === "freelancer" || accountType === "ambassador") && s === "plan-selection") && "hidden"
                )}
              />
            ))}
          </div>
        </CardHeader>

        {/* STEP 1: Account Type */}
        {step === "account-type" && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setAccountType("business")}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all",
                  accountType === "business"
                    ? "border-primary bg-primary/5 text-primary shadow-md"
                    : "border-border text-muted-foreground hover:border-primary/50"
                )}
              >
                <Building2 className="h-9 w-9" />
                <span className="text-base font-semibold">Business</span>
                <span className="text-xs opacity-70 text-center">Manage your business — inbox, CRM, marketing, AI, telephony & analytics in one platform</span>
                <ul className="text-[10px] text-left opacity-60 space-y-0.5 w-full mt-1">
                  <li>✓ Unified inbox</li>
                  <li>✓ CRM & Pipeline</li>
                  <li>✓ Personal AI assistant</li>
                  <li>✓ Automated marketing</li>
                </ul>
              </button>
              <button
                type="button"
                onClick={() => setAccountType("freelancer")}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all",
                  accountType === "freelancer"
                    ? "border-primary bg-primary/5 text-primary shadow-md"
                    : "border-border text-muted-foreground hover:border-primary/50"
                )}
              >
                <Briefcase className="h-9 w-9" />
                <span className="text-base font-semibold">Freelancer</span>
                <span className="text-xs opacity-70 text-center">Manage client businesses — earn from referrals and management</span>
                <ul className="text-[10px] text-left opacity-60 space-y-0.5 w-full mt-1">
                  <li>✓ 35% referral commission</li>
                  <li>✓ 40% from management fee</li>
                  <li>✓ Purchase plan per business</li>
                  <li>✓ 7-day free trial</li>
                </ul>
              </button>
              <button
                type="button"
                onClick={() => setAccountType("ambassador")}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all",
                  accountType === "ambassador"
                    ? "border-primary bg-primary/5 text-primary shadow-md"
                    : "border-border text-muted-foreground hover:border-primary/50"
                )}
              >
                <Users className="h-9 w-9" />
                <span className="text-base font-semibold">Ambassador</span>
                <span className="text-xs opacity-70 text-center">Referrals only — earn lifetime commission without managing businesses</span>
                <ul className="text-[10px] text-left opacity-60 space-y-0.5 w-full mt-1">
                  <li>✓ 35% lifetime commission</li>
                  <li>✓ Min. 3 referrals/month</li>
                  <li>✓ No plan purchases needed</li>
                  <li>✓ 7-day free trial</li>
                </ul>
              </button>
            </div>
            <Button className="w-full" disabled={!accountType} onClick={handleAccountTypeNext}>
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        )}

        {/* STEP 2: Plan Selection (Business only) */}
        {step === "plan-selection" && (
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-base font-semibold">Choose Plan</Label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PLAN_TIERS.map((tier) => (
                  <button
                    key={tier.key}
                    type="button"
                    onClick={() => { setSelectedTier(tier.key); setSelectedDuration(null); }}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-xl border-2 p-4 transition-all",
                      selectedTier === tier.key
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border hover:border-primary/50",
                      tier.highlighted && selectedTier !== tier.key && "border-primary/30"
                    )}
                  >
                    {tier.highlighted && (
                      <Crown className="absolute -top-2 right-2 h-4 w-4 text-primary" />
                    )}
                    <span className="text-sm font-bold text-foreground">{tier.name}</span>
                    <span className="text-lg font-semibold text-primary">€{tier.basePrice}</span>
                    <span className="text-[10px] text-muted-foreground">/mo</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedTier && currentTier && (
              <div className="space-y-2">
                <Label className="text-base font-semibold">Choose Duration</Label>
                <div className="grid gap-2">
                  {DURATION_OPTIONS.map((dur) => {
                    const price = dur.key === "trial" ? 0 : getDiscountedPrice(currentTier.basePrice, dur.discountPercent);
                    const isTrial = dur.key === "trial";
                    return (
                      <button
                        key={dur.key}
                        type="button"
                        onClick={() => setSelectedDuration(dur.key)}
                        className={cn(
                          "flex items-center justify-between rounded-lg border-2 px-4 py-3 transition-all text-left",
                          selectedDuration === dur.key
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border-2",
                            selectedDuration === dur.key ? "border-primary bg-primary" : "border-muted-foreground/40"
                          )}>
                            {selectedDuration === dur.key && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <div>
                            <span className="text-sm font-medium text-foreground">{dur.label}</span>
                            {dur.discountPercent > 0 && (
                              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                                Save {dur.discountPercent}%
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {isTrial ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">€0</span>
                              <Badge className="text-[10px] px-1.5 py-0">Free</Badge>
                            </div>
                          ) : (
                            <span className="text-sm font-semibold text-foreground">€{price}/mo</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("account-type")} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedTier || !selectedDuration}
                onClick={handlePlanNext}
              >
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        )}

        {/* STEP 3: Credentials */}
        {step === "credentials" && (
          <form onSubmit={handleRegister}>
            <CardContent className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-medium text-foreground capitalize">{accountType}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-muted-foreground">Plan:</span>
                  <span className="font-medium text-foreground">
                    {currentTier?.name}
                    {selectedDuration === "trial" ? " — 7-Day Free" : ` — ${DURATION_OPTIONS.find(d => d.key === selectedDuration)?.label}`}
                  </span>
                </div>
                {selectedDuration && selectedDuration !== "trial" && currentTier && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-muted-foreground">Price:</span>
                    <span className="font-medium text-foreground">
                      {formatPrice(currentTier.basePrice, DURATION_OPTIONS.find(d => d.key === selectedDuration)?.discountPercent ?? 0)}/mo
                    </span>
                  </div>
                )}
              </div>

              {/* Trial: what's included + warning */}
              {selectedDuration === "trial" && (
                <div className="space-y-2">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                    <p className="text-xs font-medium text-foreground">✅ What's included in the 7-day trial:</p>
                    <ul className="text-[11px] text-muted-foreground space-y-0.5 list-none pl-1">
                      <li>✓ Full access to all features <span className="text-muted-foreground/70">(except Admin panel)</span></li>
                      <li>✓ Dedicated personal AI assistant</li>
                      <li>✓ Unified inbox — email, WhatsApp, Telegram</li>
                      <li>✓ CRM, pipeline and analytics</li>
                      <li>✓ Earn from referrals — 15% goes to your wallet</li>
                      <li>✓ 1 business profile allowed during trial</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                    <p className="text-xs font-medium text-destructive">⚠️ After the 7-day trial:</p>
                    <ul className="text-[11px] text-destructive/80 space-y-0.5 list-none pl-1">
                      <li>⚠ Access is blocked — you must choose a plan</li>
                      <li>⚠ If no payment within <strong>30 days</strong> — account is automatically deleted</li>
                      <li>💡 You can pay with PayPal, Payoneer or wallet balance</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Non-trial: direct payment notice */}
              {selectedDuration && selectedDuration !== "trial" && accountType === "business" && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">
                    💳 After registration you will be redirected to the payment page to activate your account and wallet.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="name" placeholder="First Last" className="pl-9" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              </div>

              {accountType === "business" && (
                <div className="space-y-2">
                  <Label htmlFor="company">Company Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="company" placeholder="Your business name" className="pl-9" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="you@example.com" className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type="password" placeholder="Min 6 characters" className="pl-9" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="security-code">
                  Security Code <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="security-code"
                    placeholder="e.g. Aabc@.123"
                    className="pl-9 font-mono"
                    value={securityCode}
                    onChange={(e) => {
                      setSecurityCode(e.target.value);
                      setSecurityCodeError("");
                    }}
                    required
                    maxLength={9}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Format: 1 uppercase + 3 letters + 1 symbol (!@#$) + 1 punctuation (.,;:) + 3 digits
                </p>
                {securityCodeError && (
                  <p className="text-xs text-destructive">{securityCodeError}</p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <div className="flex w-full gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep((accountType === "freelancer" || accountType === "ambassador") ? "account-type" : "plan-selection")}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </div>
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  const { error } = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
                  if (error) toast.error(String(error));
                }}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  const { error } = await lovable.auth.signInWithOAuth("apple", { redirect_uri: window.location.origin });
                  if (error) toast.error(String(error));
                }}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                Continue with Apple
              </Button>
              <p className="text-sm text-muted-foreground">
                Have an account?{" "}
                <Link to="/login" className="text-primary hover:underline">Sign in</Link>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
};

export default Register;
