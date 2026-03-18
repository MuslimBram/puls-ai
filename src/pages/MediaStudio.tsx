import { useState } from "react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MediaUsageDashboard } from "@/components/MediaUsageDashboard";
import { MediaAddonCheckout } from "@/components/MediaAddonCheckout";
import { useCreateMediaGeneration, useMediaGenerations, useMediaUsage } from "@/hooks/useMediaGeneration";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  Image,
  Video,
  Sparkles,
  Loader2,
  AlertTriangle,
  Zap,
  Download,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Search,
  LayoutTemplate,
  Palette,
  PlayCircle,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";

const statusConfig: Record<string, { icon: React.ReactNode; label: string }> = {
  queued: { icon: <Clock className="h-3 w-3" />, label: "Queued" },
  pending: { icon: <Clock className="h-3 w-3" />, label: "Queued" },
  generating: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Generating" },
  processing: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Generating" },
  completed: { icon: <CheckCircle2 className="h-3 w-3" />, label: "Completed" },
  failed: { icon: <XCircle className="h-3 w-3" />, label: "Failed" },
};

const PROMPT_TEMPLATES = [
  { category: "Product", name: "Product Hero Shot", prompt: "A professional product photography shot of {product} on a clean white surface with soft studio lighting, high detail, commercial quality" },
  { category: "Product", name: "Product Promo Video", prompt: "A cinematic 10-second product promo video of {product} with soft motion, elegant camera sweep, premium lighting, and a strong brand reveal" },
  { category: "Social", name: "Instagram Post", prompt: "A vibrant, eye-catching Instagram-ready image about {topic}, modern design aesthetic, bold colors, 1:1 square format" },
  { category: "Social", name: "Story Reel", prompt: "A vertical short-form brand reel for {topic} with energetic transitions, bold typography moments, and social-first pacing" },
  { category: "Marketing", name: "Banner Ad", prompt: "A professional marketing banner for {business}, featuring clean typography space, modern design, corporate positioning" },
  { category: "Content", name: "Blog Thumbnail", prompt: "An engaging blog post thumbnail about {topic}, modern flat illustration style, vibrant colors, informative and professional" },
];

const STYLE_PRESETS = [
  { value: "photorealistic", label: "Photorealistic", suffix: ", ultra-realistic photography, premium commercial lighting" },
  { value: "illustration", label: "Illustration", suffix: ", refined illustration style, clean lines, editorial composition" },
  { value: "3d-render", label: "3D Render", suffix: ", 3D rendered, studio lighting, polished materials" },
  { value: "minimal", label: "Minimal", suffix: ", minimalist composition, intentional spacing, premium design language" },
  { value: "none", label: "No Style", suffix: "" },
];

const VIDEO_DURATION_OPTIONS = [5, 10, 15, 30, 60];

const MediaStudio = () => {
  const usage = useMediaUsage();
  const createMedia = useCreateMediaGeneration();
  const { data: generations, isLoading: generationsLoading } = useMediaGenerations();
  const [prompt, setPrompt] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [style, setStyle] = useState("none");
  const [gallerySearch, setGallerySearch] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [variations, setVariations] = useState(1);
  const [videoDuration, setVideoDuration] = useState(10);

  const canGenerate = mediaType === "image" ? usage.canGenerateImages : usage.canGenerateVideos;

  const getStyledPrompt = (basePrompt: string) => {
    const preset = STYLE_PRESETS.find((item) => item.value === style);
    return basePrompt + (preset?.suffix || "");
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    if (!canGenerate) {
      setUpgradeOpen(true);
      return;
    }

    if (mediaType === "video" && videoDuration > usage.videoMaxSeconds && usage.videoMaxSeconds !== -1) {
      toast.error(`Your current plan supports videos up to ${usage.videoMaxSeconds} seconds`);
      return;
    }

    const styledPrompt = getStyledPrompt(prompt.trim());
    const count = mediaType === "video" ? 1 : variations;

    for (let index = 0; index < count; index += 1) {
      const variationPrompt = count > 1 ? `${styledPrompt} (variation ${index + 1})` : styledPrompt;
      createMedia.mutate({
        mediaType,
        prompt: variationPrompt,
        durationSeconds: mediaType === "video" ? videoDuration : undefined,
      });
    }

    setPrompt("");
  };

  const applyTemplate = (template: (typeof PROMPT_TEMPLATES)[number]) => {
    setPrompt(template.prompt);
    toast.success(`Template \"${template.name}\" applied — replace placeholders with your content`);
  };

  const filteredGenerations = (generations ?? []).filter((generation) => {
    const searchTarget = `${generation.prompt ?? ""} ${generation.media_type} ${generation.provider_key ?? ""}`.toLowerCase();
    return !gallerySearch || searchTarget.includes(gallerySearch.toLowerCase());
  });

  const templateCategories = [...new Set(PROMPT_TEMPLATES.map((template) => template.category))];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Media Studio</h1>
            <p className="text-sm text-muted-foreground">Queue image and video generation jobs with live status, daily credits, and provider-backed processing.</p>
          </div>
        </div>

        <MediaUsageDashboard onUpgrade={() => setUpgradeOpen(true)} />

        <Tabs defaultValue="generate">
          <TabsList>
            <TabsTrigger value="generate">
              <Sparkles className="mr-1 h-3 w-3" /> Generate
            </TabsTrigger>
            <TabsTrigger value="templates">
              <LayoutTemplate className="mr-1 h-3 w-3" /> Templates
            </TabsTrigger>
            <TabsTrigger value="gallery">
              <Image className="mr-1 h-3 w-3" /> Gallery ({generations?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="addons">
              <Zap className="mr-1 h-3 w-3" /> Buy Credits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create new media job</CardTitle>
                <CardDescription>Requests are validated, queued, processed by a provider layer, and tracked through completion or failure.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Button variant={mediaType === "image" ? "default" : "outline"} size="sm" onClick={() => setMediaType("image")}>
                    <Image className="mr-1 h-4 w-4" /> Image
                  </Button>
                  <Button variant={mediaType === "video" ? "default" : "outline"} size="sm" onClick={() => setMediaType("video")}>
                    <Video className="mr-1 h-4 w-4" /> Video
                  </Button>
                </div>

                <Textarea
                  placeholder={mediaType === "image" ? "A premium product photograph of a ceramic coffee cup on limestone with soft directional light..." : "A cinematic 10-second launch video of a smartwatch rotating slowly with dramatic studio light and clean branded end frame..."}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={4}
                />

                <div className="flex flex-wrap gap-3">
                  <div className="min-w-[180px] flex-1">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      <Palette className="mr-1 inline h-3 w-3" /> Style preset
                    </label>
                    <Select value={style} onValueChange={setStyle}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STYLE_PRESETS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {mediaType === "image" ? (
                    <div className="w-32">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Variations</label>
                      <Select value={String(variations)} onValueChange={(value) => setVariations(Number(value))}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="w-40">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Video duration</label>
                      <Select value={String(videoDuration)} onValueChange={(value) => setVideoDuration(Number(value))}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VIDEO_DURATION_OPTIONS.filter((seconds) => usage.videoMaxSeconds === -1 || seconds <= usage.videoMaxSeconds).map((seconds) => (
                            <SelectItem key={seconds} value={String(seconds)}>{seconds} seconds</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                  {mediaType === "image"
                    ? `${usage.imagesRemaining === Number.POSITIVE_INFINITY ? "Unlimited" : usage.imagesRemaining} image credits left today`
                    : `${usage.videosRemaining === Number.POSITIVE_INFINITY ? "Unlimited" : usage.videosRemaining} video credits left today · max ${usage.videoMaxSeconds === -1 ? "unlimited" : `${usage.videoMaxSeconds}s`}`}
                </div>

                {!canGenerate ? (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Daily {mediaType} credit limit reached. Increase limits from donation plans or admin policy.
                  </div>
                ) : null}

                <Button onClick={handleGenerate} disabled={!prompt.trim() || createMedia.isPending}>
                  {createMedia.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {createMedia.isPending ? "Submitting..." : mediaType === "image" ? `Queue ${variations > 1 ? `${variations} image jobs` : "image job"}` : "Queue video job"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prompt templates</CardTitle>
                <CardDescription>Pre-built prompts for image and video workflows.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {templateCategories.map((category) => (
                    <div key={category}>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {PROMPT_TEMPLATES.filter((template) => template.category === category).map((template) => (
                          <div
                            key={template.name}
                            className="cursor-pointer rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                            onClick={() => applyTemplate(template)}
                          >
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">{template.name}</span>
                              <Badge variant="secondary" className="text-[10px]">{template.category}</Badge>
                            </div>
                            <p className="line-clamp-2 text-xs text-muted-foreground">{template.prompt}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gallery">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Generated media</CardTitle>
                    <CardDescription>Live queue states: queued, generating, completed, failed.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search prompts..." value={gallerySearch} onChange={(event) => setGallerySearch(event.target.value)} className="h-8 w-52 text-xs" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {generationsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !filteredGenerations.length ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {gallerySearch ? "No matching media found" : "No generations yet. Queue your first job above."}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredGenerations.map((generation) => {
                      const state = statusConfig[generation.status] || statusConfig.queued;
                      const metadata = (generation.metadata ?? {}) as Record<string, unknown>;
                      const isVideo = generation.media_type === "video";
                      const isPlayableVideo = isVideo && typeof generation.result_url === "string" && /\.(mp4|webm|mov)(\?|$)/i.test(generation.result_url);

                      return (
                        <Card key={generation.id} className="overflow-hidden">
                          {generation.status === "completed" && generation.result_url ? (
                            isPlayableVideo ? (
                              <div className="relative aspect-video bg-muted">
                                <video src={generation.result_url} controls className="h-full w-full object-cover" preload="metadata" />
                              </div>
                            ) : (
                              <div className="group relative aspect-square bg-muted">
                                <img src={generation.result_url} alt={generation.prompt || "Generated media"} className="h-full w-full object-cover" loading="lazy" />
                                {isVideo ? (
                                  <div className="absolute inset-0 flex items-center justify-center bg-background/20">
                                    <PlayCircle className="h-10 w-10 text-foreground" />
                                  </div>
                                ) : null}
                                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 opacity-0 transition-opacity group-hover:opacity-100">
                                  <a href={generation.result_url} target="_blank" rel="noopener noreferrer">
                                    <Button size="sm" variant="secondary">
                                      <ExternalLink className="mr-1 h-3 w-3" /> Open
                                    </Button>
                                  </a>
                                  <a href={generation.result_url} download>
                                    <Button size="sm" variant="secondary">
                                      <Download className="mr-1 h-3 w-3" /> Save
                                    </Button>
                                  </a>
                                </div>
                              </div>
                            )
                          ) : (
                            <div className="flex aspect-square items-center justify-center bg-muted">
                              {generation.status === "generating" || generation.status === "processing" ? (
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                              ) : generation.status === "failed" ? (
                                <XCircle className="h-8 w-8 text-destructive" />
                              ) : (
                                <Clock className="h-8 w-8 text-muted-foreground" />
                              )}
                            </div>
                          )}
                          <CardContent className="space-y-2 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant={generation.status === "failed" ? "destructive" : generation.status === "completed" ? "default" : "outline"} className="text-[10px]">
                                {state.icon} <span className="ml-1">{state.label}</span>
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{format(new Date(generation.created_at), "MMM d, HH:mm")}</span>
                            </div>
                            <p className="line-clamp-2 text-xs text-muted-foreground">{generation.prompt}</p>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline" className="text-[10px]">{generation.media_type}</Badge>
                              {generation.duration_seconds ? <Badge variant="outline" className="text-[10px]">{generation.duration_seconds}s</Badge> : null}
                              {generation.provider_key ? <Badge variant="outline" className="text-[10px]">{generation.provider_key}</Badge> : null}
                              {metadata.mock === true ? <Badge variant="secondary" className="text-[10px]">mock</Badge> : null}
                            </div>
                            <Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={() => setPrompt(generation.prompt || "")}>
                              <Copy className="mr-1 h-3 w-3" /> Reuse prompt
                            </Button>
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
