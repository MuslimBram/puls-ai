import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Mail, Lock, User, Zap, Building2, Briefcase, Check } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { cn } from "@/lib/utils";

type AccountType = "business" | "freelancer" | null;

const BILLING_PLANS = [
  { key: "trial", label: "7-ditore Provë", desc: "Provë falas", price: "€0", duration: "7 ditë" },
  { key: "monthly", label: "Mujore", desc: "Pa angazhim", price: "€49/muaj", duration: "1 muaj" },
  { key: "3-month", label: "3 Muaj", desc: "Kurseni 5%", price: "€46.55/muaj", duration: "3 muaj" },
  { key: "6-month", label: "6 Muaj", desc: "Kurseni 10%", price: "€44.10/muaj", duration: "6 muaj" },
  { key: "yearly", label: "Vjetore", desc: "Kurseni 15%", price: "€41.65/muaj", duration: "12 muaj" },
] as const;

const Register = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || "";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>(null);
  const [companyName, setCompanyName] = useState("");
  const [billingPlan, setBillingPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountType) {
      toast.error("Zgjidhni llojin e llogarisë");
      return;
    }
    if (!billingPlan) {
      toast.error("Zgjidhni një plan faturimi");
      return;
    }
    if (password.length < 6) {
      toast.error("Fjalëkalimi duhet të jetë të paktën 6 karaktere");
      return;
    }
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

      if (fraudError) {
        console.error("AI fraud check error:", fraudError);
      }

      if (fraudData?.blocked) {
        toast.error("Regjistrimi nuk mund të përfundonte. Kontaktoni mbështetjen.");
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
            billing_plan: billingPlan,
            ...(refCode ? { referral_code: refCode } : {}),
            ...(fraudData?.risk_score !== undefined ? { ai_risk_score: fraudData.risk_score } : {}),
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Kontrolloni email-in tuaj për të konfirmuar llogarinë");
        navigate("/login");
      }
    } catch (err) {
      toast.error("Regjistrimi dështoi. Provo përsëri.");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Krijo Llogari</CardTitle>
          <CardDescription>Filloni të zbuloni klientë me AI</CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            {/* Account Type Selection */}
            <div className="space-y-2">
              <Label>Lloji i llogarisë <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAccountType("business")}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all",
                    accountType === "business"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  <Building2 className="h-6 w-6" />
                  <span className="text-sm font-medium">Biznes</span>
                  <span className="text-xs opacity-70">Kam një kompani</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType("freelancer")}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all",
                    accountType === "freelancer"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  <Briefcase className="h-6 w-6" />
                  <span className="text-sm font-medium">Freelancer</span>
                  <span className="text-xs opacity-70">Punoj i pavarur</span>
                </button>
              </div>
            </div>

            {/* Billing Plan Selection */}
            <div className="space-y-2">
              <Label>Plani i faturimit <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BILLING_PLANS.map((plan) => (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setBillingPlan(plan.key)}
                    className={cn(
                      "relative flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all",
                      billingPlan === plan.key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {billingPlan === plan.key && (
                      <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />
                    )}
                    <span className="text-xs font-semibold text-foreground">{plan.label}</span>
                    <span className="text-[11px] text-muted-foreground">{plan.price}</span>
                    {plan.key !== "trial" && plan.key !== "monthly" && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{plan.desc}</Badge>
                    )}
                    {plan.key === "trial" && (
                      <Badge className="text-[9px] px-1.5 py-0">Falas</Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Emri i plotë <span className="text-destructive">*</span></Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  placeholder="Emri Mbiemri"
                  className="pl-9"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>

            {accountType === "business" && (
              <div className="space-y-2">
                <Label htmlFor="company">Emri i kompanisë</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company"
                    placeholder="Emri i biznesit tuaj"
                    className="pl-9"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="ju@shembull.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Fjalëkalimi <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 6 karaktere"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading || !accountType || !billingPlan}>
              {loading ? "Po analizon & krijon llogarinë..." : "Krijo Llogarinë"}
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
              Ke llogari?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Hyr
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Register;
