import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MediaUsageDashboard } from "@/components/MediaUsageDashboard";
import { MediaAddonCheckout } from "@/components/MediaAddonCheckout";
import { useMediaUsage, useCreateMediaGeneration, useMediaGenerations } from "@/hooks/useMediaGeneration";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  Image, Video, Sparkles, Loader2, AlertTriangle, Zap, Download, ExternalLink,
  Clock, CheckCircle2, XCircle, Copy, Search, LayoutTemplate, Palette,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pending: { icon: <Clock className="h-3 w-3" />, label: "Queued", color: "bg-muted text-muted-foreground" },
  processing: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Generating", color: "bg-primary/10 text-primary" },
  completed: { icon: <CheckCircle2 className="h-3 w-3" />, label: "Completed", color: "bg-emerald-500/10 text-emerald-600" },
  failed: { icon: <XCircle className="h-3 w-3" />, label: "Failed", color: "bg-destructive/10 text-destructive" },
};

const PROMPT_TEMPLATES = [
  { category: "Product", name: "Product Hero Shot", prompt: "A professional product photography shot of {product} on a clean white surface with soft studio lighting, high detail, commercial quality" },
  { category: "Product", name: "Lifestyle Context", prompt: "A lifestyle photo showing {product} being used naturally in a modern home setting, warm natural lighting, aspirational feel" },
  { category: "Social", name: "Instagram Post", prompt: "A vibrant, eye-catching Instagram-ready image about {topic}, modern design aesthetic, bold colors, 1:1 square format" },
  { category: "Social", name: "Story Background", prompt: "A beautiful gradient background with subtle geometric shapes for a social media story about {topic}, 9:16 portrait format" },
  { category: "Marketing", name: "Banner Ad", prompt: "A professional marketing banner for {business}, featuring clean typography space, modern design, corporate blue and white color scheme" },
  { category: "Marketing", name: "Email Header", prompt: "A sleek email header image for {topic}, minimalist design, professional tone, 600x200 dimensions feel" },
  { category: "Content", name: "Blog Thumbnail", prompt: "An engaging blog post thumbnail about {topic}, modern flat illustration style, vibrant colors, informative and professional" },
  { category: "Content", name: "Infographic Base", prompt: "A clean infographic background layout about {topic}, with placeholder areas for data visualization, modern business style" },
];

const STYLE_PRESETS = [
  { value: "photorealistic", label: "Photorealistic", suffix: ", ultra-realistic photography, DSLR quality, 8K" },
  { value: "illustration", label: "Illustration", suffix: ", modern flat illustration, vector style, clean lines" },
  { value: "3d-render", label: "3D Render", suffix: ", 3D rendered, Cinema 4D style, smooth materials, studio lighting" },
  { value: "watercolor", label: "Watercolor", suffix: ", watercolor painting style, soft edges, artistic" },
  { value: "minimal", label: "Minimal", suffix: ", minimalist design, clean, lots of white space, simple shapes" },
  { value: "none", label: "No Style", suffix: "" },
];

const MediaStudio = () => {
  const usage = useMediaUsage();
  const createMedia = useCreateMediaGeneration();
  const { data: generations, isLoading: genLoading } = useMediaGenerations();
  const [prompt, setPrompt] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [style, setStyle] = useState("none");
  const [gallerySearch, setGallerySearch] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [variations, setVariations] = useState(1);

  const canGenerate =
    mediaType === "image"
      ? !usage.isImageLimitReached && usage.canGenerateImages
      : !usage.isVideoLimitReached && usage.canGenerateVideos;

  const getStyledPrompt = (basePrompt: string) => {
    const preset = STYLE_PRESETS.find((s) => s.value === style);
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
    const styledPrompt = getStyledPrompt(prompt.trim());
    for (let i = 0; i < variations; i++) {
      const variationPrompt = variations > 1 ? `${styledPrompt} (variation ${i + 1})` : styledPrompt;
      createMedia.mutate({ mediaType, prompt: variationPrompt });
    }
    setPrompt("");
  };

  const applyTemplate = (template: typeof PROMPT_TEMPLATES[0]) => {
    setPrompt(template.prompt);
    toast.success(`Template "${template.name}" applied — replace {placeholders} with your content`);
  };

  const reusePrompt = (p: string) => {
    setPrompt(p || "");
    toast.success("Prompt loaded");
  };

  const filteredGenerations = (generations || []).filter((g: any) =>
    !gallerySearch || (g.prompt || "").toLowerCase().includes(gallerySearch.toLowerCase())
  );

  const templateCategories = [...new Set(PROMPT_TEMPLATES.map((t) => t.category))];

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
            <TabsTrigger value="templates">
              <LayoutTemplate className="h-3 w-3 mr-1" /> Templates
            </TabsTrigger>
            <TabsTrigger value="gallery">
              <Image className="h-3 w-3 mr-1" /> Gallery ({generations?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="addons">
              <Zap className="h-3 w-3 mr-1" /> Buy Credits
            </TabsTrigger>
          </TabsList>

          {/* Generate Tab */}
          <TabsContent value="generate">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create New Media</CardTitle>
                <CardDescription>Describe what you want — be specific for best results</CardDescription>
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

                {/* Style & Variations Row */}
                <div className="flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      <Palette className="h-3 w-3 inline mr-1" /> Style Preset
                    </label>
                    <Select value={style} onValueChange={setStyle}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STYLE_PRESETS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Variations</label>
                    <Select value={String(variations)} onValueChange={(v) => setVariations(Number(v))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="4">4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {style !== "none" && (
                  <p className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
                    <span className="font-medium">Style applied:</span> {STYLE_PRESETS.find((s) => s.value === style)?.suffix}
                  </p>
                )}

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
                  {createMedia.isPending ? "Generating..." : `Generate ${variations > 1 ? `${variations} Variations` : "Image"}`}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prompt Templates</CardTitle>
                <CardDescription>Pre-built prompts for common business media — click to use and customize placeholders</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {templateCategories.map((cat) => (
                    <div key={cat}>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat}</h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {PROMPT_TEMPLATES.filter((t) => t.category === cat).map((tpl) => (
                          <div
                            key={tpl.name}
                            className="rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => applyTemplate(tpl)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                              <Badge variant="secondary" className="text-[10px]">{tpl.category}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{tpl.prompt}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Gallery Tab */}
          <TabsContent value="gallery">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Generated Media</CardTitle>
                    <CardDescription>Your recent AI-generated images</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search prompts..."
                      value={gallerySearch}
                      onChange={(e) => setGallerySearch(e.target.value)}
                      className="w-48 h-8 text-xs"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {genLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !filteredGenerations.length ? (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    {gallerySearch ? "No matching images found" : "No generations yet. Create your first image above!"}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredGenerations.map((gen: any) => {
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
                                    <Download className="h-3 w-3 mr-1" /> Save
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
                            <p className="text-xs text-muted-foreground line-clamp-2">{gen.prompt}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs w-full"
                              onClick={() => reusePrompt(gen.prompt)}
                            >
                              <Copy className="h-3 w-3 mr-1" /> Reuse Prompt
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
