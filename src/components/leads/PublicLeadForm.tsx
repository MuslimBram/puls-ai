// src/components/leads/PublicLeadForm.tsx
// ============================================================
// Formë publike e kapjes së leads — pa auth
// Mund të embedohet te çdo faqe: landing page, pricing, etj.
// Thirret: supabase/functions/public-lead-capture
// ============================================================
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, Loader2 } from "lucide-react";

interface PublicLeadFormProps {
  targetWorkspaceId?: string;
  source?: string;
  showPlanSelect?: boolean;
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
}

const PLANS = [
  { value: "starter", label: "Starter — Basic" },
  { value: "growth", label: "Growth — Growing businesses" },
  { value: "pro", label: "Pro — Agencies & Teams" },
  { value: "enterprise", label: "Enterprise — Custom solution" },
];

const TEAM_SIZES = [
  { value: "1", label: "Just me" },
  { value: "2-5", label: "2–5 people" },
  { value: "6-15", label: "6–15 people" },
  { value: "16-50", label: "16–50 people" },
  { value: "50+", label: "More than 50 people" },
];

export function PublicLeadForm({
  targetWorkspaceId,
  source = "website",
  showPlanSelect = true,
  title = "Start your 7-day free trial",
  subtitle = "No credit card required. Set up in 15 minutes.",
  onSuccess,
}: PublicLeadFormProps) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    business_name: "",
    message: "",
    interested_plan: "",
    team_size: "",
    honeypot: "", // anti-spam
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const set = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async () => {
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setLoading(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/public-lead-capture`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            source,
            target_workspace_id: targetWorkspaceId,
            page_url: window.location.href,
            utm_source: new URLSearchParams(window.location.search).get("utm_source"),
            utm_medium: new URLSearchParams(window.location.search).get("utm_medium"),
            utm_campaign: new URLSearchParams(window.location.search).get("utm_campaign"),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle className="h-12 w-12 text-green-500" />
        <h3 className="text-lg font-medium text-foreground">
          Thanks! We'll contact you within 24 hours.
        </h3>
        <p className="text-sm text-muted-foreground">
          Please check your email for confirmation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(title || subtitle) && (
        <div className="space-y-1">
          {title && (
            <h2 className="text-xl font-medium text-foreground">{title}</h2>
          )}
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      )}

      {/* Honeypot anti-spam (i fshehur) */}
      <input
        type="text"
        tabIndex={-1}
        style={{ display: "none" }}
        value={form.honeypot}
        onChange={set("honeypot")}
        autoComplete="off"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Full name *
          </label>
          <Input
            placeholder="Jane Doe"
            value={form.name}
            onChange={set("name")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Email *</label>
          <Input
            type="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={set("email")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Phone</label>
          <Input
            type="tel"
            placeholder="+1 555 123 4567"
            value={form.phone}
            onChange={set("phone")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Business name</label>
          <Input
            placeholder="Acme Inc."
            value={form.business_name}
            onChange={set("business_name")}
          />
        </div>
      </div>

      {showPlanSelect && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Interested plan
            </label>
            <Select
              value={form.interested_plan}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, interested_plan: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a plan" />
              </SelectTrigger>
              <SelectContent>
                {PLANS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Team size
            </label>
            <Select
              value={form.team_size}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, team_size: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="How many people?" />
              </SelectTrigger>
              <SelectContent>
                {TEAM_SIZES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          Message (optional)
        </label>
        <Textarea
          placeholder="What would you like to automate? What problem are you trying to solve?"
          rows={3}
          value={form.message}
          onChange={set("message")}
        />
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          "Start free trial"
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        By clicking, you accept the{" "}
        <a href="/privacy" className="underline">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
