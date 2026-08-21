// src/components/leads/PublicLeadForm.tsx
// ============================================================
// Formë publike e kapjes së leads — pa auth
// Mund të embedohet te çdo faqe: landing page, pricing, etj.
// Thirret: supabase/functions/public-lead-capture
// ============================================================
import { useMemo, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
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

export function PublicLeadForm({
  targetWorkspaceId,
  source = "website",
  showPlanSelect = true,
  title = "Start your 7-day free trial",
  subtitle = "No credit card required. Set up in 15 minutes.",
  onSuccess,
}: PublicLeadFormProps) {
  const { t } = useTranslation();
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

  const plans = useMemo(
    () => [
      { value: "standard", label: t("leadForm.plans.standard") },
      { value: "professional", label: t("leadForm.plans.professional") },
      { value: "advanced", label: t("leadForm.plans.advanced") },
      { value: "enterprise", label: t("leadForm.plans.enterprise") },
    ],
    [t],
  );

  const teamSizes = useMemo(
    () => [
      { value: "1", label: t("leadForm.teamSizes.one") },
      { value: "2-5", label: t("leadForm.teamSizes.twoToFive") },
      { value: "6-15", label: t("leadForm.teamSizes.sixToFifteen") },
      { value: "16-50", label: t("leadForm.teamSizes.sixteenToFifty") },
      { value: "50+", label: t("leadForm.teamSizes.fiftyPlus") },
    ],
    [t],
  );

  const set = (field: string) => (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async () => {
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError(t("leadForm.errors.required"));
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
      setError(err instanceof Error ? err.message : t("leadForm.errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle className="h-12 w-12 text-green-500" />
        <h3 className="text-lg font-medium text-foreground">
          {t("leadForm.success.title")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("leadForm.success.description")}
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
            {t("leadForm.fields.fullName")} *
          </label>
          <Input
            placeholder={t("leadForm.placeholders.fullName")}
            value={form.name}
            onChange={set("name")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("leadForm.fields.email")} *</label>
          <Input
            type="email"
            placeholder={t("leadForm.placeholders.email")}
            value={form.email}
            onChange={set("email")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("leadForm.fields.phone")}</label>
          <Input
            type="tel"
            placeholder={t("leadForm.placeholders.phone")}
            value={form.phone}
            onChange={set("phone")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("leadForm.fields.businessName")}</label>
          <Input
            placeholder={t("leadForm.placeholders.businessName")}
            value={form.business_name}
            onChange={set("business_name")}
          />
        </div>
      </div>

      {showPlanSelect && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {t("leadForm.fields.interestedPlan")}
            </label>
            <Select
              value={form.interested_plan}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, interested_plan: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("leadForm.placeholders.interestedPlan")} />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {t("leadForm.fields.teamSize")}
            </label>
            <Select
              value={form.team_size}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, team_size: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("leadForm.placeholders.teamSize")} />
              </SelectTrigger>
              <SelectContent>
                {teamSizes.map((size) => (
                  <SelectItem key={size.value} value={size.value}>
                    {size.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          {t("leadForm.fields.message")}
        </label>
        <Textarea
          placeholder={t("leadForm.placeholders.message")}
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
            {t("leadForm.submitting")}
          </>
        ) : (
          t("leadForm.submit")
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {t("leadForm.legalPrefix")}{" "}
        <a href="/privacy" className="underline">
          {t("leadForm.privacyPolicy")}
        </a>
        .
      </p>
    </div>
  );
}
