import { Megaphone, DollarSign, Target, AlertTriangle } from "lucide-react";
import type { Competitor } from "@/hooks/useCompetitors";

export const CATEGORIES = [
  { value: "direct", label: "Direct Competitor" },
  { value: "indirect", label: "Indirect Competitor" },
  { value: "aspirational", label: "Aspirational" },
];

export const SCAN_FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "manual", label: "Manual Only" },
];

export const SEVERITY_STYLES: Record<string, string> = {
  high: "border-destructive/50 bg-destructive/5",
  medium: "border-yellow-500/50 bg-yellow-500/5",
  low: "border-border bg-background",
  info: "border-primary/30 bg-primary/5",
};

export const ALERT_ICONS: Record<string, React.ElementType> = {
  promotion: Megaphone,
  pricing_change: DollarSign,
  new_service: Target,
  campaign: Megaphone,
  general: AlertTriangle,
};

export const getDueStatus = (competitor: Competitor) => {
  if (!competitor.last_scanned_at) return "due";
  const hoursSince = (Date.now() - new Date(competitor.last_scanned_at).getTime()) / (1000 * 60 * 60);
  if (competitor.scan_frequency === "daily") return hoursSince >= 24 ? "due" : "healthy";
  if (competitor.scan_frequency === "weekly") return hoursSince >= 168 ? "due" : "healthy";
  return "manual";
};
