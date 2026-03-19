import { DashboardLayout } from "@/components/DashboardLayout";
import { useDemandForecasting } from "@/hooks/useDemandForecasting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { TrendingUp, CalendarDays, ClipboardList, BarChart3, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const DemandForecasting = () => {
  const { forecasts, planningItems, forecastAnalytics, generateForecasts, completePlanningItem, generatePlanningItems } = useDemandForecasting();

  const typeLabels: Record<string, string> = { lead_volume: "Lead Volume", call_center_load: "Call Center Load", campaign_demand: "Campaign Demand" };
  const priorityColors: Record<string, string> = { high: "destructive", medium: "default", low: "secondary" };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Demand Forecasting</h1>
            <p className="text-sm text-muted-foreground">Predict demand signals and plan operational capacity</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => generatePlanningItems.mutate()} disabled={generatePlanningItems.isPending}>
              <ClipboardList className="h-4 w-4 mr-1" /> Generate Plans
            </Button>
            <Button onClick={() => generateForecasts.mutate()} disabled={generateForecasts.isPending}>
              {generateForecasts.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingUp className="h-4 w-4 mr-2" />}
              Generate Forecasts
            </Button>
          </div>
        </div>

        <Tabs defaultValue="forecasts">
          <TabsList>
            <TabsTrigger value="forecasts"><TrendingUp className="h-4 w-4 mr-1" />Forecasts</TabsTrigger>
            <TabsTrigger value="planning"><ClipboardList className="h-4 w-4 mr-1" />Planning</TabsTrigger>
            <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="forecasts" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {forecasts.data?.slice(0, 3).map((f: any) => (
                <Card key={f.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{typeLabels[f.forecast_type] || f.forecast_type}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Predicted</span><span className="text-2xl font-bold text-primary">{Number(f.predicted_value).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span><Badge variant="outline">{Math.round(Number(f.confidence) * 100)}%</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Period</span><span className="text-xs">{f.period_start} → {f.period_end}</span></div>
                  </CardContent>
                </Card>
              ))}
              {!forecasts.data?.length && <p className="text-muted-foreground col-span-full text-center py-8">No forecasts yet. Click "Generate Forecasts" to start.</p>}
            </div>
            {forecasts.data?.length ? (
              <Card>
                <CardHeader><CardTitle className="text-base">Forecast Overview</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={forecasts.data.map((f: any) => ({ type: typeLabels[f.forecast_type] || f.forecast_type, predicted: Number(f.predicted_value), actual: Number(f.actual_value || 0) }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="type" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="predicted" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="actual" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="planning" className="space-y-3">
            {planningItems.data?.map((item: any) => (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <Checkbox checked={item.status === "completed"} onCheckedChange={() => item.status !== "completed" && completePlanningItem.mutate(item.id)} />
                  <div className="flex-1">
                    <p className={`font-medium ${item.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <Badge variant={priorityColors[item.priority] as any || "outline"}>{item.priority}</Badge>
                </CardContent>
              </Card>
            ))}
            {!planningItems.data?.length && <p className="text-muted-foreground text-center py-8">No planning items. Click "Generate Plans" to get suggestions.</p>}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Forecast Accuracy Trend</CardTitle></CardHeader>
              <CardContent>
                {forecastAnalytics.data?.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={forecastAnalytics.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="metric_date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="forecast_accuracy" stroke="hsl(var(--primary))" strokeWidth={2} />
                      <Line type="monotone" dataKey="workload_adjustment_score" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="text-muted-foreground text-center py-8">No analytics data yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default DemandForecasting;
