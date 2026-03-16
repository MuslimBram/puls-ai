import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useMediaUsage, useMediaGenerations } from "@/hooks/useMediaGeneration";
import { Image, Video, Zap, AlertTriangle } from "lucide-react";
import { formatLimit } from "@/config/plans";

interface MediaUsageDashboardProps {
  onUpgrade?: () => void;
}

export const MediaUsageDashboard = ({ onUpgrade }: MediaUsageDashboardProps) => {
  const usage = useMediaUsage();
  const { data: generations } = useMediaGenerations();

  const imagePercent = usage.imagesLimit === -1 ? 0 : Math.min(100, Math.round((usage.imagesUsed / usage.imagesLimit) * 100));
  const videoPercent = usage.videosLimit === -1 ? 0 : Math.min(100, Math.round((usage.videosUsed / usage.videosLimit) * 100));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Image Usage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="h-4 w-4 text-primary" />
              Image Generation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {usage.imagesUsed} / {formatLimit(usage.imagesLimit)} used
              </span>
              {usage.isImageLimitReached && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Limit reached
                </Badge>
              )}
            </div>
            <Progress value={imagePercent} className="h-2" />
            {usage.isImageLimitReached && onUpgrade && (
              <Button size="sm" variant="outline" onClick={onUpgrade} className="w-full">
                <Zap className="h-3 w-3 mr-1" /> Upgrade for more
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Video Usage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              Video Generation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {usage.videosLimit === 0 ? (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">Not available on your plan</p>
                {onUpgrade && (
                  <Button size="sm" variant="outline" onClick={onUpgrade} className="mt-2">
                    <Zap className="h-3 w-3 mr-1" /> Upgrade
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {usage.videosUsed} / {formatLimit(usage.videosLimit)} used
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Max {usage.videoMaxSeconds === -1 ? "unlimited" : `${usage.videoMaxSeconds}s`}
                  </span>
                </div>
                <Progress value={videoPercent} className="h-2" />
                {usage.isVideoLimitReached && onUpgrade && (
                  <Button size="sm" variant="outline" onClick={onUpgrade} className="w-full">
                    <Zap className="h-3 w-3 mr-1" /> Upgrade for more
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Generations */}
      {generations && generations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Generations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {generations.slice(0, 10).map((gen) => (
                <div key={gen.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    {gen.media_type === "image" ? (
                      <Image className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Video className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm text-foreground line-clamp-1">{gen.prompt || "No prompt"}</p>
                      <p className="text-xs text-muted-foreground">
                        {gen.media_type}{gen.duration_seconds ? ` · ${gen.duration_seconds}s` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">{gen.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
