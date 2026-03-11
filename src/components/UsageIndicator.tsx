import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface UsageIndicatorProps {
  label: string;
  current: number;
  limit: number;
  className?: string;
}

export const UsageIndicator = ({ label, current, limit, className }: UsageIndicatorProps) => {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : Math.min(Math.round((current / limit) * 100), 100);
  const isNear = percentage >= 80;
  const isAt = percentage >= 100;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(
          "font-medium",
          isAt ? "text-destructive" : isNear ? "text-warning" : "text-foreground"
        )}>
          {isUnlimited ? `${current} / ∞` : `${current} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={percentage}
          className={cn(
            "h-2",
            isAt && "[&>[role=progressbar]]:bg-destructive",
            isNear && !isAt && "[&>[role=progressbar]]:bg-warning"
          )}
        />
      )}
      {isAt && (
        <Badge variant="destructive" className="text-xs">Limit reached</Badge>
      )}
    </div>
  );
};
