export const OBJECTIVES = [
  { value: "lead_generation", label: "Lead Generation" },
  { value: "sales", label: "Sales" },
  { value: "brand_awareness", label: "Brand Awareness" },
  { value: "traffic", label: "Website Traffic" },
];

export const CHANNELS = ["facebook", "instagram", "linkedin", "tiktok", "twitter", "email", "website"];

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  strategy_ready: "bg-primary/10 text-primary",
  active: "bg-green-500/10 text-green-700",
  paused: "bg-yellow-500/10 text-yellow-700",
  completed: "bg-accent/10 text-accent-foreground",
};

export const FUNNEL_COLORS: Record<string, string> = {
  awareness: "border-l-blue-500",
  consideration: "border-l-yellow-500",
  conversion: "border-l-green-500",
  retention: "border-l-purple-500",
};
