import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useContentPosts,
  useContentIdeas,
  useContentKnowledge,
  useScanWebsite,
  useGenerateContent,
  useUpdatePost,
  useDeletePost,
  ContentPost,
} from "@/hooks/useContentCalendar";
import {
  Calendar,
  Sparkles,
  Globe,
  Trash2,
  Check,
  Clock,
  Edit,
  FileText,
  Lightbulb,
  Loader2,
  Send,
  Image,
  Video,
  LayoutGrid,
  MessageCircle,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";

const CONTENT_TYPES = [
  { value: "promotional", label: "Promotional", icon: Send },
  { value: "educational", label: "Educational", icon: Lightbulb },
  { value: "engagement", label: "Engagement", icon: MessageCircle },
  { value: "seasonal", label: "Seasonal", icon: Calendar },
  { value: "testimonial", label: "Testimonial", icon: FileText },
];

const NETWORKS = ["facebook", "instagram", "linkedin", "tiktok", "twitter"];

const MEDIA_ICONS: Record<string, React.ElementType> = {
  image: Image,
  reel: Video,
  story: Clock,
  carousel: LayoutGrid,
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-primary/10 text-primary",
  scheduled: "bg-accent/10 text-accent-foreground",
  published: "bg-green-500/10 text-green-700",
};

const ContentCalendar = () => {
  const [statusFilter, setStatusFilter] = useState("all");
  const [scanUrl, setScanUrl] = useState("");
  const [genType, setGenType] = useState("promotional");
  const [genCount, setGenCount] = useState(5);
  const [customPrompt, setCustomPrompt] = useState("");
  const [editingPost, setEditingPost] = useState<ContentPost | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editNetworks, setEditNetworks] = useState<string[]>([]);
  const [calMonth, setCalMonth] = useState(new Date());

  const { data: posts, isLoading: postsLoading } = useContentPosts(statusFilter);
  const { data: ideas } = useContentIdeas();
  const { data: knowledge } = useContentKnowledge();
  const scanMutation = useScanWebsite();
  const generateMutation = useGenerateContent();
  const updateMutation = useUpdatePost();
  const deleteMutation = useDeletePost();

  const handleScan = () => {
    if (scanUrl.trim()) scanMutation.mutate(scanUrl.trim());
  };

  const handleGenerate = () => {
    generateMutation.mutate({ content_type: genType, count: genCount, custom_prompt: customPrompt || undefined });
  };

  const handleApprove = (post: ContentPost) => {
    updateMutation.mutate({ id: post.id, updates: { status: "approved", approved_at: new Date().toISOString() } as Partial<ContentPost> });
  };

  const handleSchedule = (post: ContentPost, date: string) => {
    updateMutation.mutate({ id: post.id, updates: { status: "scheduled", scheduled_at: date } as Partial<ContentPost> });
  };

  const openEdit = (post: ContentPost) => {
    setEditingPost(post);
    setEditCaption(post.caption);
    setEditNetworks(post.target_networks || []);
  };

  const saveEdit = () => {
    if (!editingPost) return;
    updateMutation.mutate({
      id: editingPost.id,
      updates: { caption: editCaption, target_networks: editNetworks } as Partial<ContentPost>,
    });
    setEditingPost(null);
  };

  // Calendar view
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const scheduledPosts = (posts || []).filter((p) => p.scheduled_at);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Content Calendar</h1>
        </div>

        <Tabs defaultValue="generate" className="space-y-4">
          <TabsList>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="posts">Posts ({posts?.length || 0})</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="ideas">Ideas ({ideas?.length || 0})</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
          </TabsList>

          {/* GENERATE TAB */}
          <TabsContent value="generate" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Scan website */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="h-4 w-4" /> Scan Website
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="https://yourbusiness.com"
                    value={scanUrl}
                    onChange={(e) => setScanUrl(e.target.value)}
                  />
                  <Button onClick={handleScan} disabled={scanMutation.isPending || !scanUrl.trim()} className="w-full">
                    {scanMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                    Scan & Extract
                  </Button>
                  {knowledge && knowledge.length > 0 && (
                    <p className="text-xs text-muted-foreground">{knowledge.length} source(s) scanned</p>
                  )}
                </CardContent>
              </Card>

              {/* Generate content */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" /> Generate Posts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select value={genType} onValueChange={setGenType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={genCount}
                      onChange={(e) => setGenCount(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="self-center text-sm text-muted-foreground">posts</span>
                  </div>
                  <Textarea
                    placeholder="Optional: custom instructions..."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={2}
                  />
                  <Button onClick={handleGenerate} disabled={generateMutation.isPending} className="w-full">
                    {generateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generate
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* POSTS TAB */}
          <TabsContent value="posts" className="space-y-4">
            <div className="flex gap-2">
              {["all", "draft", "approved", "scheduled", "published"].map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>

            {postsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !posts?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No posts yet. Generate some content!</CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => {
                  const MediaIcon = MEDIA_ICONS[post.media_type] || Image;
                  return (
                    <Card key={post.id} className="flex flex-col">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <MediaIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium truncate">{post.title || "Untitled"}</span>
                          </div>
                          <Badge className={STATUS_COLORS[post.status] || ""}>{post.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 space-y-3">
                        <p className="text-sm text-muted-foreground line-clamp-4">{post.caption}</p>

                        {post.hashtags?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {post.hashtags.slice(0, 5).map((h, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">#{h}</Badge>
                            ))}
                          </div>
                        )}

                        {post.target_networks?.length > 0 && (
                          <div className="flex gap-1">
                            {post.target_networks.map((n) => (
                              <Badge key={n} variant="outline" className="text-xs capitalize">{n}</Badge>
                            ))}
                          </div>
                        )}

                        {post.cta && (
                          <p className="text-xs text-primary">CTA: {post.cta}</p>
                        )}

                        <div className="flex gap-1 pt-2">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(post)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          {post.status === "draft" && (
                            <Button size="sm" variant="ghost" onClick={() => handleApprove(post)}>
                              <Check className="h-3 w-3" />
                            </Button>
                          )}
                          {(post.status === "draft" || post.status === "approved") && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="ghost"><Clock className="h-3 w-3" /></Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>Schedule Post</DialogTitle></DialogHeader>
                                <Input
                                  type="datetime-local"
                                  onChange={(e) => {
                                    if (e.target.value) handleSchedule(post, new Date(e.target.value).toISOString());
                                  }}
                                />
                              </DialogContent>
                            </Dialog>
                          )}
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(post.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* CALENDAR TAB */}
          <TabsContent value="calendar" className="space-y-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setCalMonth(subMonths(calMonth, 1))}>← Prev</Button>
              <h3 className="text-lg font-semibold">{format(calMonth, "MMMM yyyy")}</h3>
              <Button variant="outline" size="sm" onClick={() => setCalMonth(addMonths(calMonth, 1))}>Next →</Button>
            </div>

            <div className="grid grid-cols-7 gap-px rounded-lg border border-border bg-border overflow-hidden">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
              ))}
              {/* Offset for first day */}
              {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-card min-h-[80px]" />
              ))}
              {days.map((day) => {
                const dayPosts = scheduledPosts.filter((p) => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day));
                return (
                  <div key={day.toISOString()} className="bg-card min-h-[80px] p-1">
                    <div className="text-xs text-muted-foreground">{format(day, "d")}</div>
                    {dayPosts.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        className="mt-0.5 truncate rounded bg-primary/10 px-1 text-[10px] text-primary cursor-pointer"
                        title={p.title || p.caption.slice(0, 50)}
                        onClick={() => openEdit(p)}
                      >
                        {p.title || p.caption.slice(0, 20)}
                      </div>
                    ))}
                    {dayPosts.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">+{dayPosts.length - 3} more</div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* IDEAS TAB */}
          <TabsContent value="ideas" className="space-y-4">
            {!ideas?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No ideas yet. Generate content to populate ideas.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {ideas.map((idea) => (
                  <Card key={idea.id}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm">{idea.idea_text}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">{idea.content_type}</Badge>
                          {idea.suggested_media && <Badge variant="outline" className="text-xs">{idea.suggested_media}</Badge>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* KNOWLEDGE BASE TAB */}
          <TabsContent value="knowledge" className="space-y-4">
            {!knowledge?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No sources scanned yet. Scan your website to build your knowledge base.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {knowledge.map((k: any) => (
                  <Card key={k.id}>
                    <CardContent className="py-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{k.source_url || "Unknown source"}</p>
                        <span className="text-xs text-muted-foreground">Scanned {format(new Date(k.scanned_at), "MMM d, yyyy")}</span>
                      </div>
                      <pre className="overflow-auto rounded bg-muted p-2 text-xs max-h-40">
                        {JSON.stringify(k.extracted_data, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={!!editingPost} onOpenChange={(open) => !open && setEditingPost(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Post</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                rows={6}
                placeholder="Post caption..."
              />
              <div>
                <p className="text-sm font-medium mb-2">Target Networks</p>
                <div className="flex flex-wrap gap-3">
                  {NETWORKS.map((n) => (
                    <label key={n} className="flex items-center gap-1.5 text-sm capitalize">
                      <Checkbox
                        checked={editNetworks.includes(n)}
                        onCheckedChange={(checked) => {
                          setEditNetworks(checked ? [...editNetworks, n] : editNetworks.filter((x) => x !== n));
                        }}
                      />
                      {n}
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={saveEdit} disabled={updateMutation.isPending} className="w-full">
                {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ContentCalendar;
