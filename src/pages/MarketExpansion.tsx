import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMarketExpansionOpportunities, useActOnExpansion, useExpansionAnalytics } from "@/hooks/useMarketExpansion";
import { Globe, MapPin, Users, TrendingUp, Zap, BarChart3 } from "lucide-react";

const MarketExpansion = () => {
  const { data: opportunities } = useMarketExpansionOpportunities();
  const { data: analytics } = useExpansionAnalytics();
  const actOn = useActOnExpansion();

  const pending = (opportunities || []).filter((o) => o.status === "detected");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Market Expansion Engine</h1>
          <p className="text-sm text-muted-foreground">AI-driven market opportunity detection and expansion readiness scoring</p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Globe className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{analytics?.total ?? 0}</p><p className="text-xs text-muted-foreground">Opportunities</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><MapPin className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold">{analytics?.regions ?? 0}</p><p className="text-xs text-muted-foreground">Regions</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="h-8 w-8 text-accent" /><div><p className="text-2xl font-bold">{analytics?.segments ?? 0}</p><p className="text-xs text-muted-foreground">Segments</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Zap className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold">{analytics?.acted ?? 0}</p><p className="text-xs text-muted-foreground">Acted On</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><BarChart3 className="h-8 w-8 text-muted-foreground" /><div><p className="text-2xl font-bold">{analytics?.avgReadiness ?? 0}%</p><p className="text-xs text-muted-foreground">Avg Readiness</p></div></div></CardContent></Card>
        </div>

        <Tabs defaultValue="opportunities">
          <TabsList>
            <TabsTrigger value="opportunities">Opportunities ({pending.length})</TabsTrigger>
            <TabsTrigger value="all">All ({opportunities?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities" className="space-y-3">
            {pending.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No pending expansion opportunities</CardContent></Card>
            ) : pending.map((opp) => (
              <Card key={opp.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px]">{opp.opportunity_type}</Badge>
                      {opp.region && <Badge variant="outline" className="text-[10px]">{opp.region}</Badge>}
                      {opp.segment && <Badge variant="outline" className="text-[10px]">{opp.segment}</Badge>}
                    </div>
                    <p className="font-medium text-sm">{opp.title}</p>
                    {opp.description && <p className="text-xs text-muted-foreground mt-1">{opp.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>Readiness: <span className="font-medium text-foreground">{Math.round(opp.readiness_score)}%</span></span>
                      <span>Confidence: <span className="font-medium text-foreground">{Math.round(opp.confidence * 100)}%</span></span>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => actOn.mutate(opp.id)} className="ml-4">
                    <Zap className="mr-1 h-3 w-3" />Act
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="all" className="space-y-3">
            {(opportunities || []).map((opp) => (
              <Card key={opp.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{opp.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={opp.status === "acted" ? "default" : "secondary"} className="text-[10px]">{opp.status}</Badge>
                      <span className="text-xs text-muted-foreground">Readiness: {Math.round(opp.readiness_score)}%</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(opp.created_at).toLocaleDateString()}</span>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default MarketExpansion;
