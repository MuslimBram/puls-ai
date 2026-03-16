import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MediaUsageDashboard } from "@/components/MediaUsageDashboard";
import { MediaAddonCheckout } from "@/components/MediaAddonCheckout";
import { useMediaUsage, useCreateMediaGeneration, useMediaGenerations } from "@/hooks/useMediaGeneration";
import { UpgradeModal } from "@/components/UpgradeModal";
import { Image, Video, Sparkles, Loader2, AlertTriangle, Zap } from "lucide-react";
import { toast } from "@/components/ui/sonner";

const MediaStudio = () => {
  const usage = useMediaUsage();
  const createMedia = useCreateMediaGeneration();
  const { data: generations } = useMediaGenerations();
  const [prompt, setPrompt] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [duration, setDuration] = useState("30");
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const canGenerate =
    mediaType === "image"
      ? !usage.isImageLimitReached && usage.canGenerateImages
      : !usage.isVideoLimitReached && usage.canGenerateVideos;

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    if (!canGenerate) {
      setUpgradeOpen(true);
      return;
    }
    createMedia.mutate({
      mediaType,
      prompt: prompt.trim(),
      durationSeconds: mediaType === "video" ? Number(duration) : undefined,
    });
    setPrompt("");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Media Studio</h1>
            <p className="text-sm text-muted-foreground">Generate images and videos with AI</p>
          </div>
        </div>

        <MediaUsageDashboard onUpgrade={() => setUpgradeOpen(true)} />

        <Tabs defaultValue="generate">
          <TabsList>
            <TabsTrigger value="generate">
              <Sparkles className="h-3 w-3 mr-1" /> Generate
            </TabsTrigger>
            <TabsTrigger value="addons">
              <Zap className="h-3 w-3 mr-1" /> Buy Credits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create New Media</CardTitle>
                <CardDescription>Describe what you want to generate</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Button
                    variant={mediaType === "image" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMediaType("image")}
                  >
                    <Image className="h-4 w-4 mr-1" /> Image
                  </Button>
                  <Button
                    variant={mediaType === "video" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMediaType("video")}
                    disabled={!usage.canGenerateVideos}
                  >
                    <Video className="h-4 w-4 mr-1" /> Video
                  </Button>
                  {mediaType === "video" && (
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 seconds</SelectItem>
                        {usage.videoMaxSeconds >= 60 && <SelectItem value="60">60 seconds</SelectItem>}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <Textarea
                  placeholder={
                    mediaType === "image"
                      ? "Describe the image you want to create..."
                      : "Describe the video you want to create..."
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />

                {!canGenerate && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {mediaType === "image"
                      ? "Image generation limit reached."
                      : "Video generation limit reached or not available on your plan."}
                  </div>
                )}

                <Button onClick={handleGenerate} disabled={!prompt.trim() || createMedia.isPending}>
                  {createMedia.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate {mediaType === "image" ? "Image" : "Video"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="addons">
            <MediaAddonCheckout />
          </TabsContent>
        </Tabs>

        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} targetPlan="professional" />
      </div>
    </DashboardLayout>
  );
};

export default MediaStudio;
