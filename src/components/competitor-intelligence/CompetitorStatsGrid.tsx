import { Shield, Clock3, Bell, DollarSign } from "lucide-react";
import { SummaryCard } from "./SummaryCard";

interface CompetitorStatsGridProps {
  total: number;
  monitored: number;
  due: number;
  unreadAlerts: number;
  priced: number;
}

export const CompetitorStatsGrid = ({ total, monitored, due, unreadAlerts, priced }: CompetitorStatsGridProps) => (
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <SummaryCard icon={Shield} label="Tracked competitors" value={total} helper={`${monitored} analyzed`} />
    <SummaryCard icon={Clock3} label="Due for scan" value={due} helper="Based on scan frequency" />
    <SummaryCard icon={Bell} label="Unread alerts" value={unreadAlerts} helper="New market changes" />
    <SummaryCard icon={DollarSign} label="Pricing detected" value={priced} helper="Competitors with visible pricing" />
  </div>
);
