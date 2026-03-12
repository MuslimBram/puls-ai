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
  Competitor,
} from "@/hooks/useCompetitors";
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
} from "lucide-react";
import { format } from "date-fns";

const CATEGORIES = [
  { value: "direct", label: "Direct Competitor" },
  { value: "indirect", label: "Indirect Competitor" },
  { value: "aspirational", label: "Aspirational" },
];

const CompetitorIntelligence = () => {
  const { data: competitors, isLoading } = useCompetitors();
  const { data: trends } = useMarketTrends();
  const addMutation = useAddCompetitor();
  const scanMutation = useScanCompetitor();
  const deleteMutation = useDeleteCompetitor();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedComp, setSelectedComp] = useState<Competitor | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formCategory, setFormCategory] = useState("direct");

  const handleAdd = async () => {
    const comp = await addMutation.mutateAsync({
      name: formName,
      website_url: formUrl || undefined,
      category: formCategory,
    });
    setShowAdd(false);
    setFormName(""); setFormUrl(""); setFormCategory("direct");
    // Auto-scan if URL provided
    if (comp && formUrl) scanMutation.mutate(comp.id);
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
                <p className="text-xs text-muted-foreground">Crawling website and generating AI analysis</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="competitors" className="space-y-4">
          <TabsList>
            <TabsTrigger value="competitors">Competitors ({competitors?.length || 0})</TabsTrigger>
            <TabsTrigger value="trends">Market Trends ({trends?.length || 0})</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
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
                  <p className="text-sm text-muted-foreground mb-4">Add competitors to monitor their strategy</p>
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
                          <Badge variant="outline" className="text-xs mt-1 capitalize">{comp.category}</Badge>
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
                      {comp.last_scanned_at && (
                        <p className="text-[10px] text-muted-foreground">Last scanned: {format(new Date(comp.last_scanned_at), "MMM d, yyyy HH:mm")}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-4">
            {!trends?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No trends detected yet. Scan competitors to discover trends.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {trends.map((trend) => (
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
        </Tabs>

        {/* Add Competitor Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Competitor</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Competitor Name</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div>
                <Label>Website URL</Label>
                <Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://competitor.com" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
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
