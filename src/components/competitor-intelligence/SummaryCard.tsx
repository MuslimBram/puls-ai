import { Card, CardContent } from "@/components/ui/card";

interface SummaryCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  helper: string;
}

export const SummaryCard = ({ icon: Icon, label, value, helper }: SummaryCardProps) => (
  <Card>
    <CardContent className="flex items-start justify-between py-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </div>
      <div className="rounded-full border border-border p-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
    </CardContent>
  </Card>
);
