import { useSubscription } from "@/hooks/useSubscription";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { differenceInDays, differenceInHours } from "date-fns";

export const TrialCountdown = () => {
  const { stripeData } = useSubscription();

  if (stripeData?.status !== "trialing" || !stripeData.trial_end) return null;

  const end = new Date(stripeData.trial_end);
  const now = new Date();
  const daysLeft = differenceInDays(end, now);
  const hoursLeft = differenceInHours(end, now);

  const isUrgent = daysLeft <= 2;
  const label = daysLeft > 0 ? `${daysLeft}d left` : `${Math.max(hoursLeft, 0)}h left`;

  return (
    <Badge
      variant={isUrgent ? "destructive" : "secondary"}
      className="gap-1 text-xs"
    >
      <Clock className="h-3 w-3" />
      Trial: {label}
    </Badge>
  );
};
