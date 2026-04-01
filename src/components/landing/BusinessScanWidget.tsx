import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight, ArrowLeft, Rocket, CheckCircle2, AlertTriangle,
  TrendingUp, Target, Zap, BarChart3,
} from "lucide-react";

type Step = "intro" | "business" | "state" | "goals" | "problems" | "budget" | "result";

interface Answers {
  businessName: string;
  industry: string;
  location: string;
  website: string;
  instagram: string;
  facebook: string;
  hasWebsite: boolean;
  getsClientsFromIG: boolean;
  usesCRM: boolean;
  usesAds: boolean;
  goals: string[];
  problems: string[];
  budget: string;
  email: string;
}

const GOALS = [
  "More clients", "More online sales", "Automation",
  "Branding", "Marketplace presence",
];

const PROBLEMS = [
  "No time", "No strategy", "Not converting clients",
  "No sales system", "No online presence",
];

const BUDGETS = ["< €50", "€50–150", "€150–500", "€500+"];

const STEP_ORDER: Step[] = ["intro", "business", "state", "goals", "problems", "budget", "result"];

function calcScore(a: Answers): number {
  let s = 0;
  if (a.hasWebsite) s += 3; else s += 1;
  if (a.getsClientsFromIG) s += 3; else s += 1;
  if (a.usesCRM) s += 4; else s += 1;
  if (a.usesAds) s += 3; else s += 1;
  s += a.goals.length * 2;
  s += a.problems.length * 2;
  if (a.budget === "€500+") s += 4;
  else if (a.budget === "€150–500") s += 3;
  else if (a.budget === "€50–150") s += 2;
  else s += 1;
  if (a.website) s += 2;
  if (a.instagram || a.facebook) s += 2;
  return Math.min(s, 40);
}

function getLevel(score: number) {
  if (score <= 15) return { level: "Beginner", color: "text-orange-500" };
  if (score <= 30) return { level: "Intermediate", color: "text-yellow-500" };
  return { level: "Growth-Ready", color: "text-green-500" };
}

function getRoute(a: Answers): { route: string; message: string; cta: string } {
  // Route to Pulse AI in most cases — no external service names exposed
  if ((a.getsClientsFromIG || a.usesCRM) && a.goals.includes("Automation") && a.budget !== "< €50") {
    return {
      route: "pulse_ai",
      message: "Your business is ready for automation and growth with AI-powered tools.",
      cta: "Create Account",
    };
  }
  if (a.goals.includes("More online sales") && !a.hasWebsite) {
    return {
      route: "ecommerce",
      message: "You can start selling online directly through our marketplace platform.",
      cta: "Get Started",
    };
  }
  if (!a.hasWebsite && a.problems.includes("No online presence")) {
    return {
      route: "web_presence",
      message: "Your business needs a professional online presence to grow.",
      cta: "Build Your Website",
    };
  }
  if (a.hasWebsite && (a.problems.includes("No strategy") || a.problems.includes("Not converting clients"))) {
    return {
      route: "support",
      message: "You need technical support and a growth strategy to scale.",
      cta: "Get Support",
    };
  }
  return {
    route: "pulse_ai",
    message: "Start with our AI platform to discover your growth potential.",
    cta: "Start Free Trial",
  };
}

const initial: Answers = {
  businessName: "", industry: "", location: "", website: "",
  instagram: "", facebook: "",
  hasWebsite: false, getsClientsFromIG: false, usesCRM: false, usesAds: false,
  goals: [], problems: [], budget: "", email: "",
};

export const BusinessScanWidget = () => {
  const [step, setStep] = useState<Step>("intro");
  const [answers, setAnswers] = useState<Answers>(initial);
  const [score, setScore] = useState(0);
  const [saving, setSaving] = useState(false);

  const stepIdx = STEP_ORDER.indexOf(step);
  const progress = Math.round((stepIdx / (STEP_ORDER.length - 1)) * 100);

  const next = useCallback(() => {
    if (stepIdx < STEP_ORDER.length - 1) {
      const nextStep = STEP_ORDER[stepIdx + 1];
      if (nextStep === "result") {
        const s = calcScore(answers);
        setScore(s);
        saveSubmission(answers, s);
      }
      setStep(nextStep);
    }
  }, [stepIdx, answers]);

  const prev = useCallback(() => {
    if (stepIdx > 0) setStep(STEP_ORDER[stepIdx - 1]);
  }, [stepIdx]);

  const saveSubmission = async (a: Answers, s: number) => {
    setSaving(true);
    try {
      const lvl = getLevel(s);
      const rt = getRoute(a);
      await supabase.from("business_scan_submissions" as any).insert({
        business_name: a.businessName,
        industry: a.industry,
        location: a.location,
        website: a.website,
        social_profiles: { instagram: a.instagram, facebook: a.facebook },
        current_state: {
          hasWebsite: a.hasWebsite,
          getsClientsFromIG: a.getsClientsFromIG,
          usesCRM: a.usesCRM,
          usesAds: a.usesAds,
        },
        goals: a.goals,
        problems: a.problems,
        budget: a.budget,
        score: s,
        level: lvl.level,
        route: rt.route,
        answers_json: a,
        email: a.email,
      } as any);
    } catch (e) {
      console.error("Failed to save scan submission:", e);
    } finally {
      setSaving(false);
    }
  };

  const toggleArray = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const upd = (patch: Partial<Answers>) => setAnswers((p) => ({ ...p, ...patch }));

  if (step === "intro") {
    return (
      <section className="border-t border-border relative overflow-hidden" id="business-scan">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
        <div className="container relative mx-auto px-4 py-20 text-center">
          <Badge className="mb-4">Free Business Scan</Badge>
          <h2 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
            Discover Why Your Business Isn't Growing Online
          </h2>
          <p className="mx-auto mb-6 max-w-lg text-muted-foreground">
            Get a personalized growth plan in seconds. No login required.
          </p>
          <Button size="lg" className="hover-lift" onClick={next}>
            Start Analysis <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </section>
    );
  }

  if (step === "result") {
    const lvl = getLevel(score);
    const rt = getRoute(answers);
    return (
      <section className="border-t border-border" id="business-scan">
        <div className="container mx-auto px-4 py-16">
          <Card className="mx-auto max-w-lg">
            <CardContent className="pt-6 space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-foreground">Your Result</h2>
                <div className="relative mx-auto my-6 flex h-32 w-32 items-center justify-center">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--primary))" strokeWidth="8"
                      strokeDasharray={`${(score / 40) * 264} 264`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute text-2xl font-bold text-foreground">{score}/40</span>
                </div>
                <Badge className={`text-sm ${lvl.color}`}>{lvl.level}</Badge>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <BarChart3 className="mt-0.5 h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">Diagnosis</p>
                    <p className="text-xs text-muted-foreground">{rt.message}</p>
                  </div>
                </div>

                {answers.problems.length > 0 && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Key Issues</p>
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {answers.problems.map((p) => <li key={p}>• {p}</li>)}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <TrendingUp className="mt-0.5 h-5 w-5 text-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">Growth Potential</p>
                    <p className="text-xs text-muted-foreground">
                      {score <= 15 ? "High potential for improvement with the right tools." :
                       score <= 30 ? "Good foundation — automation will accelerate growth." :
                       "Strong position — scale with advanced AI features."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Input placeholder="Your email (optional)" value={answers.email}
                  onChange={(e) => upd({ email: e.target.value })} />
                <Button className="w-full" size="lg" onClick={() => window.location.href = "/register"}>
                  {rt.cta} <Rocket className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-border" id="business-scan">
      <div className="container mx-auto px-4 py-16">
        <Card className="mx-auto max-w-lg">
          <CardContent className="pt-6 space-y-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Step {stepIdx} of {STEP_ORDER.length - 2}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />

            {step === "business" && (
              <div className="space-y-3">
                <h3 className="font-semibold text-foreground">Business Information</h3>
                <div className="space-y-2">
                  <Label>Business Name *</Label>
                  <Input value={answers.businessName} onChange={(e) => upd({ businessName: e.target.value })} placeholder="e.g. Acme Corp" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Industry</Label>
                    <Input value={answers.industry} onChange={(e) => upd({ industry: e.target.value })} placeholder="e.g. Retail" />
                  </div>
                  <div className="space-y-1">
                    <Label>Location</Label>
                    <Input value={answers.location} onChange={(e) => upd({ location: e.target.value })} placeholder="e.g. Tirana" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Website (optional)</Label>
                  <Input value={answers.website} onChange={(e) => upd({ website: e.target.value })} placeholder="https://..." />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Instagram</Label>
                    <Input value={answers.instagram} onChange={(e) => upd({ instagram: e.target.value })} placeholder="@handle" />
                  </div>
                  <div className="space-y-1">
                    <Label>Facebook</Label>
                    <Input value={answers.facebook} onChange={(e) => upd({ facebook: e.target.value })} placeholder="Page name" />
                  </div>
                </div>
              </div>
            )}

            {step === "state" && (
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Current State</h3>
                {[
                  { key: "hasWebsite" as const, label: "Do you have a website?" },
                  { key: "getsClientsFromIG" as const, label: "Do you get clients from Instagram?" },
                  { key: "usesCRM" as const, label: "Do you use a CRM?" },
                  { key: "usesAds" as const, label: "Do you use paid advertising?" },
                ].map((q) => (
                  <div key={q.key} className="flex items-center gap-3">
                    <Checkbox checked={answers[q.key]} onCheckedChange={(v) => upd({ [q.key]: !!v })} />
                    <Label className="cursor-pointer">{q.label}</Label>
                  </div>
                ))}
              </div>
            )}

            {step === "goals" && (
              <div className="space-y-3">
                <h3 className="font-semibold text-foreground">What are your goals?</h3>
                <p className="text-xs text-muted-foreground">Select all that apply</p>
                {GOALS.map((g) => (
                  <div key={g} className="flex items-center gap-3">
                    <Checkbox checked={answers.goals.includes(g)}
                      onCheckedChange={() => upd({ goals: toggleArray(answers.goals, g) })} />
                    <Label className="cursor-pointer">{g}</Label>
                  </div>
                ))}
              </div>
            )}

            {step === "problems" && (
              <div className="space-y-3">
                <h3 className="font-semibold text-foreground">What challenges do you face?</h3>
                <p className="text-xs text-muted-foreground">Select all that apply</p>
                {PROBLEMS.map((p) => (
                  <div key={p} className="flex items-center gap-3">
                    <Checkbox checked={answers.problems.includes(p)}
                      onCheckedChange={() => upd({ problems: toggleArray(answers.problems, p) })} />
                    <Label className="cursor-pointer">{p}</Label>
                  </div>
                ))}
              </div>
            )}

            {step === "budget" && (
              <div className="space-y-3">
                <h3 className="font-semibold text-foreground">Monthly budget for growth?</h3>
                <RadioGroup value={answers.budget} onValueChange={(v) => upd({ budget: v })}>
                  {BUDGETS.map((b) => (
                    <div key={b} className="flex items-center gap-3">
                      <RadioGroupItem value={b} id={`budget-${b}`} />
                      <Label htmlFor={`budget-${b}`} className="cursor-pointer">{b}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={prev} disabled={stepIdx <= 1}>
                <ArrowLeft className="mr-1 h-3 w-3" /> Back
              </Button>
              <Button size="sm" onClick={next}
                disabled={step === "business" && !answers.businessName}>
                {step === "budget" ? "See Results" : "Next"} <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
