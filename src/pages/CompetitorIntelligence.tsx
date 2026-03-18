import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useCompetitors,
  useCompetitorScans,
  useMarketTrends,
  useAddCompetitor,
  useScanCompetitor,
  useDeleteCompetitor,
  useCompetitorAlerts,
  useMarkAlertRead,
  useAutoAnalyzeCompetitor,
  useUpdateCompetitorFrequency,
  useScheduledCompetitorScan,
  Competitor,
  CompetitorAlert,
} from "@/hooks/useCompetitors";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { competitorFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";
import {
  Plus,
  Loader2,
  Trash2,
  Eye,
  TrendingUp,
  Globe,
  Lightbulb,
  RefreshCw,
  Shield,
  BarChart3,
  Bell,
  AlertTriangle,
  DollarSign,
  Megaphone,
  Target,
  Calendar,
  Sparkles,
  Radar,
  Activity,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";

const CATEGORIES = [
  { value: "direct", label: "Direct Competitor" },
  { value: "indirect", label: "Indirect Competitor" },
  { value: "aspirational", label: "Aspirational" },
];

const SCAN_FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "manual", label: "Manual Only" },
];

const SEVERITY_STYLES: Record<string, string> = {
  high: "border-destructive/50 bg-destructive/5",
  medium: "border-yellow-500/50 bg-yellow-500/5",
  low: "border-border bg-background",
  info: "border-primary/30 bg-primary/5",
};

const ALERT_ICONS: Record<string, React.ElementType> = {
  promotion: Megaphone,
  pricing_change: DollarSign,
  new_service: Target,
  campaign: Megaphone,
  general: AlertTriangle,
};

const getDueStatus = (competitor: Competitor) => {
  if (!competitor.last_scanned_at) return "due";

  const hoursSince = (Date.now() - new Date(competitor.last_scanned_at).getTime()) / (1000 * 60 * 60);
  if (competitor.scan_frequency === "daily") return hoursSince >= 24 ? "due" : "healthy";
  if (competitor.scan_frequency === "weekly") return hoursSince >= 168 ? "due" : "healthy";
  return "manual";
};

const alertMatchesCompetitor = (alert: CompetitorAlert, competitorId: string) => alert.competitor_id === competitorId;

const CompetitorIntelligence = () => {
  const { data: competitors, isLoading } = useCompetitors();
  const { data: trends } = useMarketTrends();
  const { data: alerts } = useCompetitorAlerts();
  const addMutation = useAddCompetitor();
  const scanMutation = useScanCompetitor();
  const scheduledScanMutation = useScheduledCompetitorScan();
  const updateFrequencyMutation = useUpdateCompetitorFrequency();
  const deleteMutation = useDeleteCompetitor();
  const markReadMutation = useMarkAlertRead();
  const autoAnalyzeMutation = useAutoAnalyzeCompetitor();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedComp, setSelectedComp] = useState<Competitor | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formCategory, setFormCategory] = useState("direct");
  const [formFrequency, setFormFrequency] = useState("weekly");
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const { profile } = useBusinessProfile();

  const unreadAlerts = alerts?.filter((a) => !a.is_read).length || 0;
  const suggestedKeywords = trends?.filter((t) => t.trend_type === "suggested_keyword") || [];
  const keywordTrends = trends?.filter((t) => t.trend_type === "keyword") || [];

  const metrics = useMemo(() => {
    const total = competitors?.length || 0;
    const due = (competitors || []).filter((c) => getDueStatus(c) === "due").length;
    const monitored = (competitors || []).filter((c) => c.last_scanned_at).length;
    const priced = (competitors || []).filter((c) => c.pricing_snapshot?.has_pricing).length;

    return { total, due, monitored, priced };
  }, [competitors]);

  const handleAdd = async () => {
    const comp = await addMutation.mutateAsync({
      name: formName,
      website_url: formUrl || undefined,
      category: formCategory,
    });

    if (comp) {
      await updateFrequencyMutation.mutateAsync({ competitorId: comp.id, frequency: formFrequency });
    }

    setShowAdd(false);
    setFormName("");
    setFormUrl("");
    setFormCategory("direct");
    setFormFrequency("weekly");

    if (!comp) return;

    if (formUrl) {
      scanMutation.mutate(comp.id);
    } else {
      autoAnalyzeMutation.mutate(comp.id);
    }
  };

  const handleUpdateFrequency = async (compId: string, frequency: string) => {
    await updateFrequencyMutation.mutateAsync({ competitorId: compId, frequency });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Competitor Intelligence</h1>
            <p className="text-sm text-muted-foreground">Track scans, pricing signals, alerts, and opportunities in one workflow.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => scheduledScanMutation.mutate()} disabled={scheduledScanMutation.isPending}>
              {scheduledScanMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
              Run due scans
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Competitor
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={Shield} label="Tracked competitors" value={metrics.total} helper={`${metrics.monitored} analyzed`} />
          <SummaryCard icon={Clock3} label="Due for scan" value={metrics.due} helper="Based on scan frequency" />
          <SummaryCard icon={Bell} label="Unread alerts" value={unreadAlerts} helper="New market changes" />
          <SummaryCard icon={DollarSign} label="Pricing detected" value={metrics.priced} helper="Competitors with visible pricing" />
        </div>

        {(scanMutation.isPending || autoAnalyzeMutation.isPending || scheduledScanMutation.isPending) && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="text-sm font-medium">
                  {scheduledScanMutation.isPending
                    ? "Running scheduled competitor scans..."
                    : autoAnalyzeMutation.isPending
                      ? "Generating AI insights..."
                      : "Scanning competitor..."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {scheduledScanMutation.isPending
                    ? "Checking all due competitors and generating alerts"
                    : autoAnalyzeMutation.isPending
                      ? "Creating preliminary competitive analysis from available data"
                      : "Crawling website, detecting changes, and generating AI analysis"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="competitors" className="space-y-4">
          <TabsList>
            <TabsTrigger value="competitors">Competitors ({competitors?.length || 0})</TabsTrigger>
            <TabsTrigger value="alerts" className="relative">
              Alerts
              {unreadAlerts > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">{unreadAlerts}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="trends">Market Trends ({keywordTrends.length})</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="suggestions">AI Suggestions</TabsTrigger>
          </TabsList>

          <TabsContent value="competitors" className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !competitors?.length ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                  <p className="mb-2 text-lg font-medium">No competitors tracked</p>
                  <p className="mb-4 text-sm text-muted-foreground">Add competitors to monitor their strategy with daily or weekly scanning.</p>
                  <Button onClick={() => setShowAdd(true)}><Plus className="mr-2 h-4 w-4" /> Add Competitor</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {competitors.map((comp) => {
                  const dueStatus = getDueStatus(comp);
                  const relatedAlerts = (alerts || []).filter((alert) => alertMatchesCompetitor(alert, comp.id));
                  const unreadForCompetitor = relatedAlerts.filter((alert) => !alert.is_read).length;

                  return (
                    <Card key={comp.id} className="transition-colors hover:border-primary/20">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <Globe className="h-4 w-4 text-primary" />
                              <span className="truncate">{comp.name}</span>
                            </CardTitle>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="text-xs capitalize">{comp.category}</Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                <Calendar className="mr-1 h-3 w-3" />
                                {comp.scan_frequency}
                              </Badge>
                              <Badge variant={dueStatus === "due" ? "destructive" : "outline"} className="text-[10px] capitalize">
                                {dueStatus === "manual" ? "manual" : dueStatus}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setSelectedComp(comp)}><Eye className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => scanMutation.mutate(comp.id)} disabled={scanMutation.isPending}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(comp.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {comp.website_url && <p className="truncate text-xs text-muted-foreground">{comp.website_url}</p>}
                        {comp.ai_summary ? (
                          <p className="line-clamp-3 text-sm text-muted-foreground">{comp.ai_summary}</p>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">Not scanned yet</p>
                        )}

                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg border border-border p-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Alerts</p>
                            <p className="mt-1 text-sm font-medium text-foreground">{relatedAlerts.length}</p>
                            <p className="text-[10px] text-muted-foreground">{unreadForCompetitor} unread</p>
                          </div>
                          <div className="rounded-lg border border-border p-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pricing</p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {comp.pricing_snapshot?.has_pricing ? "Detected" : "Unknown"}
                            </p>
                            <p className="line-clamp-1 text-[10px] text-muted-foreground">{comp.pricing_snapshot?.pricing_summary || "Scan required"}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          {comp.last_scanned_at ? (
                            <p className="text-[10px] text-muted-foreground">Last scanned: {format(new Date(comp.last_scanned_at), "MMM d, yyyy HH:mm")}</p>
                          ) : <span />}
                          <Select value={comp.scan_frequency} onValueChange={(v) => handleUpdateFrequency(comp.id, v)}>
                            <SelectTrigger className="h-6 w-24 text-[10px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SCAN_FREQUENCIES.map((f) => (
                                <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="alerts" className="space-y-3">
            {!alerts?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Bell className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>No alerts yet. Alerts are generated when changes are detected during competitor scans.</p>
              </CardContent></Card>
            ) : (
              alerts.map((alert) => {
                const Icon = ALERT_ICONS[alert.alert_type] || AlertTriangle;
                return (
                  <Card key={alert.id} className={`${SEVERITY_STYLES[alert.severity] || ""} ${!alert.is_read ? "ring-1 ring-primary/20" : "opacity-75"}`}>
                    <CardContent className="flex items-start gap-3 py-3">
                      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${alert.severity === "high" ? "text-destructive" : alert.severity === "medium" ? "text-yellow-600" : "text-primary"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{alert.title}</p>
                          <Badge variant={alert.severity === "high" ? "destructive" : "secondary"} className="shrink-0 text-[10px]">{alert.severity}</Badge>
                          {!alert.is_read && <Badge className="shrink-0 text-[10px]">New</Badge>}
                        </div>
                        {alert.description && <p className="line-clamp-2 text-xs text-muted-foreground">{alert.description}</p>}
                        <p className="mt-1 text-[10px] text-muted-foreground">{format(new Date(alert.created_at), "MMM d, HH:mm")}</p>
                      </div>
                      {!alert.is_read && (
                        <Button size="sm" variant="ghost" className="shrink-0 text-xs" onClick={() => markReadMutation.mutate(alert.id)}>
                          Mark read
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            {!keywordTrends.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No trends detected yet. Scan competitors to discover trends.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {keywordTrends.map((trend) => (
                  <Card key={trend.id}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <div>
                          <p className="text-sm font-medium">{trend.trend_value}</p>
                          <p className="text-xs capitalize text-muted-foreground">{trend.trend_type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{trend.frequency}x</Badge>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(trend.last_seen_at), "MMM d")}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="opportunities" className="space-y-4">
            {competitors?.filter((c) => c.ai_opportunities?.length).length ? (
              competitors.filter((c) => c.ai_opportunities?.length).map((comp) => (
                <Card key={comp.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Lightbulb className="h-4 w-4 text-yellow-500" /> Opportunities vs {comp.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {comp.ai_opportunities.map((opp, i) => (
                      <div key={i} className="rounded-lg border border-border p-3">
                        <p className="text-sm font-medium text-foreground">{opp.opportunity}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{opp.rationale}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Lightbulb className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>Scan competitors to discover strategic opportunities.</p>
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="suggestions" className="space-y-4">
            {suggestedKeywords.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-primary" /> Suggested Keywords to Target
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {suggestedKeywords.map((kw) => (
                      <Badge key={kw.id} variant="outline" className="text-xs">{kw.trend_value}</Badge>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    These keywords are based on gaps identified in competitor analysis. Add them to your keyword monitoring to capture leads.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BarChart3 className="h-4 w-4 text-primary" /> How Insights Feed Your Strategy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">📅 Content Calendar</p>
                  <p className="mt-1 text-xs text-muted-foreground">Competitor themes and trends can shape what your AI content engine prioritizes next.</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">🎯 Campaign Builder</p>
                  <p className="mt-1 text-xs text-muted-foreground">Positioning gaps and new promotions expose angles your campaigns can exploit immediately.</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">🔍 Lead Keywords</p>
                  <p className="mt-1 text-xs text-muted-foreground">Suggested keywords from competitor gaps can be reused in lead discovery and search monitoring.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Competitor</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <FieldLabelWithGuide
                  label="Competitor Name"
                  guide={getFieldGuide(competitorFieldGuides, "competitor_name")!}
                  onAiSuggest={async () => {
                    if (!profile) return;
                    setAiSuggestLoading(true);
                    try {
                      const { data } = await supabase.functions.invoke("ai-sales-assistant", {
                        body: { prompt: `Suggest 1 competitor name for a ${profile.industry || "general"} business offering ${profile.main_services || "services"}. Return only the company name, nothing else.` },
                      });
                      if (data?.reply) setFormName(data.reply.trim());
                    } catch {
                      toast.error("AI suggestion failed");
                    } finally {
                      setAiSuggestLoading(false);
                    }
                  }}
                  isAiLoading={aiSuggestLoading}
                />
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div>
                <FieldLabelWithGuide label="Website URL" guide={getFieldGuide(competitorFieldGuides, "competitor_website")!} />
                <Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://competitor.com" />
              </div>
              <div>
                <FieldLabelWithGuide label="Category" guide={getFieldGuide(competitorFieldGuides, "competitor_category")!} />
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabelWithGuide label="Scan Frequency" guide={getFieldGuide(competitorFieldGuides, "competitor_scan_frequency")!} />
                <Select value={formFrequency} onValueChange={setFormFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCAN_FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={!formName.trim() || addMutation.isPending || updateFrequencyMutation.isPending}>
                {addMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add & Scan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {selectedComp && (
          <CompetitorDetail competitor={selectedComp} alerts={alerts || []} onClose={() => setSelectedComp(null)} />
        )}
      </div>
    </DashboardLayout>
  );
};

const SummaryCard = ({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  helper: string;
}) => (
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

const CompetitorDetail = ({
  competitor,
  alerts,
  onClose,
}: {
  competitor: Competitor;
  alerts: CompetitorAlert[];
  onClose: () => void;
}) => {
  const { data: scans } = useCompetitorScans(competitor.id);
  const competitorAlerts = alerts.filter((alert) => alertMatchesCompetitor(alert, competitor.id));
  const topThemes = competitor.ai_content_themes || [];
  const pricePoints = competitor.pricing_snapshot?.price_points || [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" /> {competitor.name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard icon={Activity} label="Scans" value={scans?.length || 0} helper="Recent scan history" />
          <SummaryCard icon={Bell} label="Alerts" value={competitorAlerts.length} helper="Detected market changes" />
          <SummaryCard icon={CheckCircle2} label="Themes" value={topThemes.length} helper="AI-detected content themes" />
        </div>

        <Tabs defaultValue="analysis" className="space-y-4">
          <TabsList>
            <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
            <TabsTrigger value="pricing">Pricing & Changes</TabsTrigger>
            <TabsTrigger value="alerts">Alerts ({competitorAlerts.length})</TabsTrigger>
            <TabsTrigger value="activity">Activity ({scans?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="space-y-4">
            {competitor.ai_summary ? (
              <>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
                  <CardContent><p className="text-sm text-muted-foreground">{competitor.ai_summary}</p></CardContent>
                </Card>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Positioning</CardTitle></CardHeader>
                    <CardContent><p className="text-sm text-muted-foreground">{competitor.ai_positioning || "No positioning insight yet."}</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Engagement Style</CardTitle></CardHeader>
                    <CardContent><p className="text-sm text-muted-foreground">{competitor.ai_engagement_style || "No engagement pattern identified yet."}</p></CardContent>
                  </Card>
                </div>
                {topThemes.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Content Themes</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {topThemes.map((theme, i) => (
                        <div key={i} className="rounded border border-border p-3">
                          <p className="text-sm font-medium">{theme.theme}</p>
                          <p className="text-xs text-muted-foreground">{theme.description}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {competitor.ai_opportunities?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Strategic Opportunities</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {competitor.ai_opportunities.map((opp, i) => (
                        <div key={i} className="rounded border border-border p-3">
                          <p className="text-sm font-medium">{opp.opportunity}</p>
                          <p className="text-xs text-muted-foreground">{opp.rationale}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No analysis available. Scan this competitor first.</CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><DollarSign className="h-4 w-4 text-primary" /> Pricing snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{competitor.pricing_snapshot?.pricing_summary || "No pricing signal detected yet."}</p>
                {pricePoints.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pricePoints.map((point, index) => (
                      <Badge key={`${point}-${index}`} variant="outline">{point}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4 text-primary" /> Previous scan context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{competitor.previous_scan_data?.summary || "No previous scan summary stored yet."}</p>
                {competitor.previous_scan_data?.themes?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {competitor.previous_scan_data.themes.map((theme) => (
                      <Badge key={theme} variant="secondary">{theme}</Badge>
                    ))}
                  </div>
                ) : null}
                {competitor.previous_scan_data?.scanned_at ? (
                  <p className="text-[10px] text-muted-foreground">Snapshot saved {format(new Date(competitor.previous_scan_data.scanned_at), "MMM d, yyyy HH:mm")}</p>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-2">
            {competitorAlerts.length ? competitorAlerts.map((alert) => {
              const Icon = ALERT_ICONS[alert.alert_type] || AlertTriangle;
              return (
                <Card key={alert.id} className={SEVERITY_STYLES[alert.severity] || ""}>
                  <CardContent className="flex items-start gap-3 py-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{alert.title}</p>
                        <Badge variant={alert.severity === "high" ? "destructive" : "secondary"} className="text-[10px]">{alert.severity}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{alert.description || "No description"}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            }) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No competitor-specific alerts yet.</CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-2">
            {scans?.length ? scans.map((scan) => (
              <Card key={scan.id}>
                <CardContent className="py-3">
                  <div className="mb-1 flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{scan.scan_type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{format(new Date(scan.scanned_at), "MMM d, HH:mm")}</span>
                  </div>
                  {scan.source_url && <p className="truncate text-xs text-muted-foreground">{scan.source_url}</p>}
                  {scan.content_summary && <p className="mt-1 line-clamp-2 text-xs">{scan.content_summary}</p>}
                </CardContent>
              </Card>
            )) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No scan activity yet.</CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default CompetitorIntelligence;
