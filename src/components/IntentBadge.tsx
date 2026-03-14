import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const INTENT_STYLES: Record<string, { label: string; class: string }> = {
  ready_to_buy: { label: "Ready to Buy", class: "bg-green-500/15 text-green-700 border-green-500/30" },
  comparison: { label: "Comparing", class: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  research: { label: "Researching", class: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" },
  curiosity: { label: "Curious", class: "bg-muted text-muted-foreground border-border" },
  complaint: { label: "Complaint", class: "bg-destructive/15 text-destructive border-destructive/30" },
  unknown: { label: "Unknown", class: "bg-muted text-muted-foreground border-border" },
};

const URGENCY_STYLES: Record<string, { label: string; dot: string }> = {
  high: { label: "High urgency", dot: "bg-destructive" },
  medium: { label: "Medium urgency", dot: "bg-yellow-500" },
  low: { label: "Low urgency", dot: "bg-muted-foreground" },
};

const ACTION_LABELS: Record<string, string> = {
  engage_direct: "Engage directly",
  engage_soft: "Soft engagement",
  monitor: "Monitor",
  ignore: "Ignore",
};

interface IntentBadgeProps {
  intentType?: string;
  urgencyLevel?: string;
  recommendedAction?: string;
  compact?: boolean;
}

export const IntentBadge = ({ intentType = "unknown", urgencyLevel = "medium", recommendedAction = "monitor", compact = false }: IntentBadgeProps) => {
  const intent = INTENT_STYLES[intentType] || INTENT_STYLES.unknown;
  const urgency = URGENCY_STYLES[urgencyLevel] || URGENCY_STYLES.medium;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`text-[10px] gap-1 ${intent.class}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
              {intent.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p>{urgency.label} · {ACTION_LABELS[recommendedAction] || recommendedAction}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className={`text-xs gap-1 ${intent.class}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
        {intent.label}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {ACTION_LABELS[recommendedAction] || recommendedAction}
      </Badge>
    </div>
  );
};

export const INTENT_TYPE_OPTIONS = [
  { value: "curiosity", label: "Curiosity" },
  { value: "research", label: "Research" },
  { value: "comparison", label: "Comparison" },
  { value: "ready_to_buy", label: "Ready to Buy" },
  { value: "complaint", label: "Complaint" },
  { value: "unknown", label: "Unknown" },
];

export const URGENCY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
