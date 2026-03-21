import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Globe, Activity, Bell, CheckCircle2, DollarSign, Sparkles, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useCompetitorScans, type Competitor, type CompetitorAlert } from "@/hooks/useCompetitors";
import { SummaryCard } from "./SummaryCard";
import { ALERT_ICONS, SEVERITY_STYLES } from "./constants";

interface CompetitorDetailDialogProps {
  competitor: Competitor;
  alerts: CompetitorAlert[];
  onClose: () => void;
}

export const CompetitorDetailDialog = ({ competitor, alerts, onClose }: CompetitorDetailDialogProps) => {
  const { data: scans } = useCompetitorScans(competitor.id);
  const competitorAlerts = alerts.filter((a) => a.competitor_id === competitor.id);
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
