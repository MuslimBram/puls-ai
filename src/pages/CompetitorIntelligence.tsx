import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCompetitors,
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
} from "@/hooks/useCompetitors";
import { Plus, Loader2, Radar } from "lucide-react";
import { getDueStatus } from "@/components/competitor-intelligence/constants";
import { CompetitorStatsGrid } from "@/components/competitor-intelligence/CompetitorStatsGrid";
import { ScanProgressBanner } from "@/components/competitor-intelligence/ScanProgressBanner";
import { CompetitorList } from "@/components/competitor-intelligence/CompetitorList";
import { CompetitorAlertsList } from "@/components/competitor-intelligence/CompetitorAlertsList";
import { CompetitorTrendsTab } from "@/components/competitor-intelligence/CompetitorTrendsTab";
import { CompetitorOpportunitiesTab } from "@/components/competitor-intelligence/CompetitorOpportunitiesTab";
import { CompetitorSuggestionsTab } from "@/components/competitor-intelligence/CompetitorSuggestionsTab";
import { AddCompetitorDialog } from "@/components/competitor-intelligence/AddCompetitorDialog";
import { CompetitorDetailDialog } from "@/components/competitor-intelligence/CompetitorDetailDialog";

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

  const handleAdd = async (data: { name: string; url: string; category: string; frequency: string }) => {
    await addMutation.mutateAsync({
      name: data.name,
      website_url: data.url || undefined,
      category: data.category,
    });
    setShowAdd(false);
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

        <CompetitorStatsGrid {...metrics} unreadAlerts={unreadAlerts} />

        <ScanProgressBanner
          isScanPending={scanMutation.isPending}
          isAutoAnalyzePending={autoAnalyzeMutation.isPending}
          isScheduledPending={scheduledScanMutation.isPending}
        />

        <Tabs defaultValue="competitors" className="space-y-4">
          <TabsList>
            <TabsTrigger value="competitors">Competitors ({competitors?.length || 0})</TabsTrigger>
            <TabsTrigger value="alerts" className="relative">
              Alerts
              {unreadAlerts > 0 && <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">{unreadAlerts}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="trends">Market Trends ({keywordTrends.length})</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="suggestions">AI Suggestions</TabsTrigger>
          </TabsList>

          <TabsContent value="competitors" className="space-y-4">
            <CompetitorList
              competitors={competitors}
              alerts={alerts || []}
              isLoading={isLoading}
              onView={setSelectedComp}
              onScan={(id) => scanMutation.mutate(id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              onAdd={() => setShowAdd(true)}
              onUpdateFrequency={(id, freq) => updateFrequencyMutation.mutateAsync({ competitorId: id, frequency: freq })}
              isScanPending={scanMutation.isPending}
            />
          </TabsContent>

          <TabsContent value="alerts" className="space-y-3">
            <CompetitorAlertsList alerts={alerts} onMarkRead={(id) => markReadMutation.mutate(id)} />
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <CompetitorTrendsTab trends={keywordTrends} />
          </TabsContent>

          <TabsContent value="opportunities" className="space-y-4">
            <CompetitorOpportunitiesTab competitors={competitors} />
          </TabsContent>

          <TabsContent value="suggestions" className="space-y-4">
            <CompetitorSuggestionsTab suggestedKeywords={suggestedKeywords} />
          </TabsContent>
        </Tabs>

        <AddCompetitorDialog
          open={showAdd}
          onOpenChange={setShowAdd}
          onAdd={handleAdd}
          isPending={addMutation.isPending || updateFrequencyMutation.isPending}
        />

        {selectedComp && (
          <CompetitorDetailDialog competitor={selectedComp} alerts={alerts || []} onClose={() => setSelectedComp(null)} />
        )}
      </div>
    </DashboardLayout>
  );
};

export default CompetitorIntelligence;
