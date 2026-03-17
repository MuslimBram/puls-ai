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
import { Image, Video, Sparkles, Loader2, AlertTriangle, Zap, Download, ExternalLink, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pending: { icon: <Clock className="h-3 w-3" />, label: "Queued", color: "bg-muted text-muted-foreground" },
  processing: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Generating", color: "bg-primary/10 text-primary" },
  completed: { icon: <CheckCircle2 className="h-3 w-3" />, label: "Completed", color: "bg-green-500/10 text-green-600" },
  failed: { icon: <XCircle className="h-3 w-3" />, label: "Failed", color: "bg-destructive/10 text-destructive" },
};

const MediaStudio = () => {
  const usage = useMediaUsage();
  const createMedia = useCreateMediaGeneration();
  const { data: generations, isLoading: genLoading } = useMediaGenerations();
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
            <p className="text-sm text-muted-foreground">Generate images with AI — powered by Gemini</p>
          </div>
        </div>

        <MediaUsageDashboard onUpgrade={() => setUpgradeOpen(true)} />

        <Tabs defaultValue="generate">
          <TabsList>
            <TabsTrigger value="generate">
              <Sparkles className="h-3 w-3 mr-1" /> Generate
            </TabsTrigger>
            <TabsTrigger value="gallery">
              <Image className="h-3 w-3 mr-1" /> Gallery ({generations?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="addons">
              <Zap className="h-3 w-3 mr-1" /> Buy Credits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create New Image</CardTitle>
                <CardDescription>Describe what you want to generate — be specific for best results</CardDescription>
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
                    <Badge variant="outline" className="ml-1 text-[10px]">Coming Soon</Badge>
                  </Button>
                </div>

                <Textarea
                  placeholder="A professional product photo of a modern smartwatch on a marble surface with soft lighting..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />

                {!canGenerate && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Image generation limit reached. Upgrade or buy credits.
                  </div>
                )}

                <Button onClick={handleGenerate} disabled={!prompt.trim() || createMedia.isPending}>
                  {createMedia.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {createMedia.isPending ? "Generating..." : "Generate Image"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gallery">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Generated Media</CardTitle>
                <CardDescription>Your recent AI-generated images</CardDescription>
              </CardHeader>
              <CardContent>
                {genLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !generations?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    No generations yet. Create your first image above!
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {generations.map((gen: any) => {
                      const st = statusConfig[gen.status] || statusConfig.pending;
                      return (
                        <Card key={gen.id} className="overflow-hidden">
                          {gen.status === "completed" && gen.result_url ? (
                            <div className="aspect-square bg-muted relative group">
                              <img
                                src={gen.result_url}
                                alt={gen.prompt || "Generated image"}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <a href={gen.result_url} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="secondary">
                                    <ExternalLink className="h-3 w-3 mr-1" /> Open
                                  </Button>
                                </a>
                                <a href={gen.result_url} download>
                                  <Button size="sm" variant="secondary">
                                    <Download className="h-3 w-3 mr-1" /> Download
                                  </Button>
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className="aspect-square bg-muted flex items-center justify-center">
                              {gen.status === "processing" ? (
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                              ) : gen.status === "failed" ? (
                                <XCircle className="h-8 w-8 text-destructive" />
                              ) : (
                                <Clock className="h-8 w-8 text-muted-foreground" />
                              )}
                            </div>
                          )}
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge className={`text-[10px] ${st.color}`}>
                                {st.icon} <span className="ml-1">{st.label}</span>
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(gen.created_at), "MMM d, HH:mm")}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {gen.prompt}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
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
