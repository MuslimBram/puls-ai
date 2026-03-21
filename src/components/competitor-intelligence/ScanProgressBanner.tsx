import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface ScanProgressBannerProps {
  isScanPending: boolean;
  isAutoAnalyzePending: boolean;
  isScheduledPending: boolean;
}

export const ScanProgressBanner = ({ isScanPending, isAutoAnalyzePending, isScheduledPending }: ScanProgressBannerProps) => {
  if (!isScanPending && !isAutoAnalyzePending && !isScheduledPending) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-center gap-3 py-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div>
          <p className="text-sm font-medium">
            {isScheduledPending
              ? "Running scheduled competitor scans..."
              : isAutoAnalyzePending
                ? "Generating AI insights..."
                : "Scanning competitor..."}
          </p>
          <p className="text-xs text-muted-foreground">
            {isScheduledPending
              ? "Checking all due competitors and generating alerts"
              : isAutoAnalyzePending
                ? "Creating preliminary competitive analysis from available data"
                : "Crawling website, detecting changes, and generating AI analysis"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
