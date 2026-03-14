import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  Competitor,
} from "@/hooks/useCompetitors";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { competitorFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";
import {
  Search,
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
  low: "border-muted",
  info: "border-primary/30 bg-primary/5",
};

const ALERT_ICONS: Record<string, React.ElementType> = {
  promotion: Megaphone,
  pricing_change: DollarSign,
  new_service: Target,
  campaign: Megaphone,
  general: AlertTriangle,
};

const CompetitorIntelligence = () => {
  const { data: competitors, isLoading } = useCompetitors();
  const { data: trends } = useMarketTrends();
  const { data: alerts } = useCompetitorAlerts();
  const addMutation = useAddCompetitor();
  const scanMutation = useScanCompetitor();
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

  const unreadAlerts = alerts?.filter(a => !a.is_read).length || 0;
  const suggestedKeywords = trends?.filter(t => t.trend_type === "suggested_keyword") || [];

  const handleAdd = async () => {
    const comp = await addMutation.mutateAsync({
      name: formName,
      website_url: formUrl || undefined,
      category: formCategory,
    });
    if (comp) {
      await supabase.from("competitors").update({ scan_frequency: formFrequency } as any).eq("id", comp.id);
    }
    setShowAdd(false);
    setFormName(""); setFormUrl(""); setFormCategory("direct"); setFormFrequency("weekly");
    if (comp) {
      if (formUrl) {
        scanMutation.mutate(comp.id);
      } else {
        // Auto-analyze from name/category when no URL provided
        autoAnalyzeMutation.mutate(comp.id);
      }
    }
  };

  const handleUpdateFrequency = async (compId: string, frequency: string) => {
    await supabase.from("competitors").update({ scan_frequency: frequency } as any).eq("id", compId);
    toast.success(`Scan frequency updated to ${frequency}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Competitor Intelligence</h1>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Competitor
          </Button>
        </div>

        {scanMutation.isPending && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="text-sm font-medium">Scanning competitor...</p>
                <p className="text-xs text-muted-foreground">Crawling website, detecting changes, and generating AI analysis</p>
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
            <TabsTrigger value="trends">Market Trends ({trends?.length || 0})</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="suggestions">AI Suggestions</TabsTrigger>
          </TabsList>

          {/* Competitors Tab */}
          <TabsContent value="competitors" className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !competitors?.length ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Shield className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium mb-2">No competitors tracked</p>
                  <p className="text-sm text-muted-foreground mb-4">Add competitors to monitor their strategy with daily/weekly scanning</p>
                  <Button onClick={() => setShowAdd(true)}><Plus className="mr-2 h-4 w-4" /> Add Competitor</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {competitors.map((comp) => (
                  <Card key={comp.id} className="hover:border-primary/20 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Globe className="h-4 w-4 text-primary" />
                            {comp.name}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs capitalize">{comp.category}</Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              <Calendar className="h-3 w-3 mr-1" />
                              {comp.scan_frequency}
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
                    <CardContent className="space-y-2">
                      {comp.website_url && (
                        <p className="text-xs text-muted-foreground truncate">{comp.website_url}</p>
                      )}
                      {comp.ai_summary ? (
                        <p className="text-sm text-muted-foreground line-clamp-3">{comp.ai_summary}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Not scanned yet</p>
                      )}
                      <div className="flex items-center justify-between">
                        {comp.last_scanned_at && (
                          <p className="text-[10px] text-muted-foreground">Last scanned: {format(new Date(comp.last_scanned_at), "MMM d, yyyy HH:mm")}</p>
                        )}
                        <Select
                          value={comp.scan_frequency}
                          onValueChange={(v) => handleUpdateFrequency(comp.id, v)}
                        >
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
                ))}
              </div>
            )}
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="space-y-3">
            {!alerts?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Bell className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>No alerts yet. Alerts are generated when changes are detected during competitor scans.</p>
              </CardContent></Card>
            ) : (
              alerts.map((alert) => {
                const Icon = ALERT_ICONS[alert.alert_type] || AlertTriangle;
                return (
                  <Card key={alert.id} className={`${SEVERITY_STYLES[alert.severity] || ""} ${!alert.is_read ? "ring-1 ring-primary/20" : "opacity-75"}`}>
                    <CardContent className="flex items-start gap-3 py-3">
                      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${alert.severity === "high" ? "text-destructive" : alert.severity === "medium" ? "text-yellow-600" : "text-primary"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium truncate">{alert.title}</p>
                          <Badge variant={alert.severity === "high" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                            {alert.severity}
                          </Badge>
                          {!alert.is_read && <Badge className="text-[10px] shrink-0">New</Badge>}
                        </div>
                        {alert.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{alert.description}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(alert.created_at), "MMM d, HH:mm")}</p>
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

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-4">
            {!trends?.filter(t => t.trend_type === "keyword")?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No trends detected yet. Scan competitors to discover trends.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {trends.filter(t => t.trend_type === "keyword").map((trend) => (
                  <Card key={trend.id}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <div>
                          <p className="text-sm font-medium">{trend.trend_value}</p>
                          <p className="text-xs text-muted-foreground capitalize">{trend.trend_type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{trend.frequency}x</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(trend.last_seen_at), "MMM d")}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Opportunities Tab */}
          <TabsContent value="opportunities" className="space-y-4">
            {competitors?.filter((c) => c.ai_opportunities?.length).length ? (
              competitors.filter((c) => c.ai_opportunities?.length).map((comp) => (
                <Card key={comp.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" /> Opportunities vs {comp.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {comp.ai_opportunities.map((opp: any, i: number) => (
                      <div key={i} className="rounded-lg border border-border p-3">
                        <p className="text-sm font-medium text-foreground">{opp.opportunity}</p>
                        <p className="text-xs text-muted-foreground mt-1">{opp.rationale}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Lightbulb className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>Scan competitors to discover strategic opportunities.</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* AI Suggestions Tab */}
          <TabsContent value="suggestions" className="space-y-4">
            {suggestedKeywords.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" /> Suggested Keywords to Target
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {suggestedKeywords.map((kw) => (
                      <Badge key={kw.id} variant="outline" className="text-xs">
                        {kw.trend_value}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    These keywords are based on gaps identified in competitor analysis. Add them to your keyword monitoring to capture leads.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Content suggestions from competitors */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> How Insights Feed Your Strategy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">📅 Content Calendar</p>
                  <p className="text-xs text-muted-foreground mt-1">Competitor content themes and trending keywords automatically inform your AI content generation suggestions.</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">🎯 Campaign Builder</p>
                  <p className="text-xs text-muted-foreground mt-1">Opportunities and positioning gaps feed into campaign strategy recommendations.</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">🔍 Lead Keywords</p>
                  <p className="text-xs text-muted-foreground mt-1">Suggested keywords from competitor gaps can be added to your keyword monitoring for lead discovery.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Competitor Dialog */}
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
                    } catch {} finally { setAiSuggestLoading(false); }
                  }}
                  isAiLoading={aiSuggestLoading}
                />
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div>
                <FieldLabelWithGuide
                  label="Website URL"
                  guide={getFieldGuide(competitorFieldGuides, "competitor_website")!}
                />
                <Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://competitor.com" />
              </div>
              <div>
                <FieldLabelWithGuide
                  label="Category"
                  guide={getFieldGuide(competitorFieldGuides, "competitor_category")!}
                />
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabelWithGuide
                  label="Scan Frequency"
                  guide={getFieldGuide(competitorFieldGuides, "competitor_scan_frequency")!}
                />
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
              <Button onClick={handleAdd} disabled={!formName.trim() || addMutation.isPending}>
                {addMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add & Scan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Competitor Detail Dialog */}
        {selectedComp && (
          <CompetitorDetail competitor={selectedComp} onClose={() => setSelectedComp(null)} />
        )}
      </div>
    </DashboardLayout>
  );
};

const CompetitorDetail = ({ competitor, onClose }: { competitor: Competitor; onClose: () => void }) => {
  const { data: scans } = useCompetitorScans(competitor.id);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" /> {competitor.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="analysis" className="space-y-4">
          <TabsList>
            <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
            <TabsTrigger value="activity">Activity ({scans?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="space-y-4">
            {competitor.ai_summary ? (
              <>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
                  <CardContent><p className="text-sm text-muted-foreground">{competitor.ai_summary}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Positioning</CardTitle></CardHeader>
                  <CardContent><p className="text-sm text-muted-foreground">{competitor.ai_positioning}</p></CardContent>
                </Card>
                {competitor.ai_content_themes?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Content Themes</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {competitor.ai_content_themes.map((t: any, i: number) => (
                        <div key={i} className="rounded border border-border p-2">
                          <p className="text-sm font-medium">{t.theme}</p>
                          <p className="text-xs text-muted-foreground">{t.description}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {competitor.ai_engagement_style && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Engagement Style</CardTitle></CardHeader>
                    <CardContent><p className="text-sm text-muted-foreground">{competitor.ai_engagement_style}</p></CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No analysis available. Scan this competitor first.</CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-2">
            {scans?.length ? scans.map((scan) => (
              <Card key={scan.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-xs">{scan.scan_type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{format(new Date(scan.scanned_at), "MMM d, HH:mm")}</span>
                  </div>
                  {scan.source_url && <p className="text-xs text-muted-foreground truncate">{scan.source_url}</p>}
                  {scan.content_summary && <p className="text-xs mt-1 line-clamp-2">{scan.content_summary}</p>}
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
