import { formatDistanceToNowStrict } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useMediaUsage, useMediaGenerations, useMediaUsageAnalytics } from "@/hooks/useMediaGeneration";
import { Image, Video, Zap, AlertTriangle, Clock3, CheckCircle2, Activity } from "lucide-react";

interface MediaUsageDashboardProps {
  onUpgrade?: () => void;
}

const statusLabel: Record<string, string> = {
  queued: "Queued",
  pending: "Queued",
  generating: "Generating",
  processing: "Generating",
  completed: "Completed",
  failed: "Failed",
};

export const MediaUsageDashboard = ({ onUpgrade }: MediaUsageDashboardProps) => {
  const usage = useMediaUsage();
  const analytics = useMediaUsageAnalytics();
  const { data: generations } = useMediaGenerations();

  const imagePercent = usage.imagesLimit === -1 ? 0 : Math.min(100, Math.round((usage.imagesUsedToday / Math.max(usage.imagesLimit, 1)) * 100));
  const videoPercent = usage.videosLimit === -1 ? 0 : Math.min(100, Math.round((usage.videosUsedToday / Math.max(usage.videosLimit, 1)) * 100));
  const resetLabel = usage.resetsAt ? formatDistanceToNowStrict(new Date(usage.resetsAt), { addSuffix: true }) : "in 24 hours";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Image className="h-4 w-4 text-primary" />
              Image credits today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {usage.imagesUsedToday} used · {usage.imagesRemaining === Number.POSITIVE_INFINITY ? "Unlimited" : `${usage.imagesRemaining} left`}
              </span>
              {usage.isImageLimitReached ? (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Daily limit reached
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  resets {resetLabel}
                </Badge>
              )}
            </div>
            <Progress value={imagePercent} className="h-2" />
            {usage.isImageLimitReached && onUpgrade ? (
              <Button size="sm" variant="outline" onClick={onUpgrade} className="w-full">
                <Zap className="mr-1 h-3 w-3" /> Increase daily image credits
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Video className="h-4 w-4 text-primary" />
              Video credits today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {usage.videosUsedToday} used · {usage.videosRemaining === Number.POSITIVE_INFINITY ? "Unlimited" : `${usage.videosRemaining} left`}
              </span>
              <Badge variant="outline" className="text-xs">
                max {usage.videoMaxSeconds === -1 ? "Unlimited" : `${usage.videoMaxSeconds}s`}
              </Badge>
            </div>
            <Progress value={videoPercent} className="h-2" />
            {usage.isVideoLimitReached && onUpgrade ? (
              <Button size="sm" variant="outline" onClick={onUpgrade} className="w-full">
                <Zap className="mr-1 h-3 w-3" /> Increase daily video credits
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Activity className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">{analytics.totalRequests}</p>
              <p className="text-xs text-muted-foreground">Requests logged</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Clock3 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">{analytics.activeJobs}</p>
              <p className="text-xs text-muted-foreground">Active jobs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">{analytics.totalCompleted}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">{analytics.totalFailed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {generations && generations.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent media jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {generations.slice(0, 8).map((generation) => (
                <div key={generation.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    {generation.media_type === "image" ? (
                      <Image className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Video className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="line-clamp-1 text-sm text-foreground">{generation.prompt || "No prompt"}</p>
                      <p className="text-xs text-muted-foreground">
                        {generation.media_type}
                        {generation.duration_seconds ? ` · ${generation.duration_seconds}s` : ""}
                        {generation.provider_key ? ` · ${generation.provider_key}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge variant={generation.status === "failed" ? "destructive" : generation.status === "completed" ? "default" : "outline"} className="text-xs">
                    {statusLabel[generation.status] || generation.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
