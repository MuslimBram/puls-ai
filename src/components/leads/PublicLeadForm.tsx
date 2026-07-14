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
  { value: "starter", label: "Starter — Bazik" },
  { value: "growth", label: "Growth — Biznese në rritje" },
  { value: "pro", label: "Pro — Agjenci & Ekipe" },
  { value: "enterprise", label: "Enterprise — Zgjidhje e personalizuar" },
];

const TEAM_SIZES = [
  { value: "1", label: "Vetëm unë" },
  { value: "2-5", label: "2–5 persona" },
  { value: "6-15", label: "6–15 persona" },
  { value: "16-50", label: "16–50 persona" },
  { value: "50+", label: "Mbi 50 persona" },
];

export function PublicLeadForm({
  targetWorkspaceId,
  source = "website",
  showPlanSelect = true,
  title = "Fillo provën falas 7-ditore",
  subtitle = "Pa kartë krediti. Konfigurohesh në 15 minuta.",
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
      setError("Emri dhe emaili janë të detyrueshëm.");
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
      if (!res.ok) throw new Error(data.error ?? "Gabim i panjohur");
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gabim. Provo sërish.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle className="h-12 w-12 text-green-500" />
        <h3 className="text-lg font-medium text-foreground">
          Faleminderit! Do t'ju kontaktojmë brenda 24 orëve.
        </h3>
        <p className="text-sm text-muted-foreground">
          Kontrolloni emailin tuaj për konfirmim.
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
            Emri i plotë *
          </label>
          <Input
            placeholder="Erion Hoxha"
            value={form.name}
            onChange={set("name")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Email *</label>
          <Input
            type="email"
            placeholder="erion@kompania.al"
            value={form.email}
            onChange={set("email")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Telefon</label>
          <Input
            type="tel"
            placeholder="+355 69 xxx xxxx"
            value={form.phone}
            onChange={set("phone")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Emri i biznesit</label>
          <Input
            placeholder="Kompania SH.P.K."
            value={form.business_name}
            onChange={set("business_name")}
          />
        </div>
      </div>

      {showPlanSelect && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Paketa e interesuar
            </label>
            <Select
              value={form.interested_plan}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, interested_plan: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Zgjedh paketën" />
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
              Madhësia e ekipit
            </label>
            <Select
              value={form.team_size}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, team_size: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sa persona?" />
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
          Mesazhi (opsional)
        </label>
        <Textarea
          placeholder="Çfarë dëshironi të automatizoni? Çfarë problemi po zgjidhni?"
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
            Duke dërguar...
          </>
        ) : (
          "Fillo provën falas"
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Duke klikuar, pranoni{" "}
        <a href="/privacy" className="underline">
          Politikën e Privatësisë
        </a>
        .
      </p>
    </div>
  );
}
