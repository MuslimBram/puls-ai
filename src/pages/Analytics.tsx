import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeads } from "@/hooks/useLeads";
import { useKeywords } from "@/hooks/useKeywords";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import {
  BarChart3, TrendingUp, Target, Lightbulb, Plus, Download,
  MessageSquare, Zap, Activity, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { format, subDays, subMonths, isAfter, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--secondary))",
  "hsl(262 80% 50%)",
  "hsl(340 75% 55%)",
  "hsl(25 95% 53%)",
];

type DateRange = "7d" | "14d" | "30d" | "90d";

const Analytics = () => {
  const { leads } = useLeads();
  const { keywords, addKeyword } = useKeywords();
  const { subscription } = useFeatureGating();
  const [savedSuggestions, setSavedSuggestions] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  const rangeStart = useMemo(() => {
    const days = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[dateRange];
    return subDays(new Date(), days);
  }, [dateRange]);

  const filteredLeads = useMemo(
    () => leads.filter((l) => isAfter(parseISO(l.message_date), rangeStart)),
    [leads, rangeStart]
  );

  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const avgIntent = total ? filteredLeads.reduce((sum, l) => sum + Number(l.intent_score), 0) / total : 0;
    const highIntent = filteredLeads.filter((l) => Number(l.intent_score) >= 0.7).length;
    const conversionRate = total ? Math.round((highIntent / total) * 100) : 0;
    const contacted = filteredLeads.filter((l) => l.status === "contacted").length;
    const responseRate = total ? Math.round((contacted / total) * 100) : 0;

    // Previous period comparison
    const days = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[dateRange];
    const prevStart = subDays(rangeStart, days);
    const prevLeads = leads.filter(
      (l) => isAfter(parseISO(l.message_date), prevStart) && !isAfter(parseISO(l.message_date), rangeStart)
    );
    const growthPct = prevLeads.length ? Math.round(((total - prevLeads.length) / prevLeads.length) * 100) : 0;

    // By keyword
    const byKeyword: Record<string, number> = {};
    filteredLeads.forEach((l) => {
      if (l.detected_keyword) byKeyword[l.detected_keyword] = (byKeyword[l.detected_keyword] || 0) + 1;
    });

    // By source
    const bySource: Record<string, number> = {};
    filteredLeads.forEach((l) => {
      bySource[l.source_name] = (bySource[l.source_name] || 0) + 1;
    });

    // By status
    const byStatus: Record<string, number> = {};
    filteredLeads.forEach((l) => {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    });

    // Leads over time
    const daysCount = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[dateRange];
    const timeline = Array.from({ length: daysCount }, (_, i) => {
      const day = subDays(new Date(), daysCount - 1 - i);
      const dayStr = format(day, "yyyy-MM-dd");
      const dayLeads = filteredLeads.filter((l) => format(parseISO(l.message_date), "yyyy-MM-dd") === dayStr);
      const count = dayLeads.length;
      const avgScore = count ? dayLeads.reduce((s, l) => s + Number(l.intent_score), 0) / count : 0;
      return { date: format(day, daysCount > 14 ? "MMM d" : "EEE"), count, avgScore: Math.round(avgScore * 100) };
    });

    // Intent distribution
    const intentBuckets = [
      { range: "0-20%", count: 0 },
      { range: "20-40%", count: 0 },
      { range: "40-60%", count: 0 },
      { range: "60-80%", count: 0 },
      { range: "80-100%", count: 0 },
    ];
    filteredLeads.forEach((l) => {
      const score = Number(l.intent_score) * 100;
      const idx = Math.min(Math.floor(score / 20), 4);
      intentBuckets[idx].count++;
    });

    return {
      total, avgIntent, highIntent, conversionRate, responseRate, growthPct,
      byKeyword, bySource, byStatus, timeline, intentBuckets,
    };
  }, [filteredLeads, leads, dateRange, rangeStart]);

  // Keyword suggestions
  const suggestions = useMemo(() => {
    const highIntent = filteredLeads.filter((l) => Number(l.intent_score) >= 0.6);
    const wordFreq: Record<string, number> = {};
    const existingKws = new Set(keywords.map((k) => k.keyword.toLowerCase()));

    highIntent.forEach((l) => {
      l.message_content.toLowerCase().split(/\s+/).filter((w) => w.length > 3).forEach((w) => {
        const clean = w.replace(/[^a-z0-9]/g, "");
        if (clean && !existingKws.has(clean)) wordFreq[clean] = (wordFreq[clean] || 0) + 1;
      });
    });

    return Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, count]) => ({ word, count }));
  }, [filteredLeads, keywords]);

  const saveSuggestion = (word: string) => {
    addKeyword.mutate(word);
    setSavedSuggestions((prev) => [...prev, word]);
    toast.success(`"${word}" added as keyword`);
  };

  const exportCSV = () => {
    const headers = ["Date", "Source", "Keyword", "Intent Score", "Status", "Message"];
    const rows = filteredLeads.map((l) => [
      format(parseISO(l.message_date), "yyyy-MM-dd"),
      l.source_name,
      l.detected_keyword || "",
      String(Math.round(Number(l.intent_score) * 100)) + "%",
      l.status,
      `"${l.message_content.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${dateRange}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  const keywordData = Object.entries(stats.byKeyword).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
  const sourceData = Object.entries(stats.bySource).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(stats.byStatus).map(([name, value]) => ({ name, value }));

  const GrowthIcon = stats.growthPct >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Analytics</h1>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="14d">Last 14 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">Leads</p>
                  {stats.growthPct !== 0 && (
                    <span className={`text-xs flex items-center ${stats.growthPct > 0 ? 'text-green-600' : 'text-destructive'}`}>
                      <GrowthIcon className="h-3 w-3" />{Math.abs(stats.growthPct)}%
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{Math.round(stats.avgIntent * 100)}%</p>
                <p className="text-xs text-muted-foreground">Avg Intent</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.highIntent}</p>
                <p className="text-xs text-muted-foreground">High Intent</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Activity className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.conversionRate}%</p>
                <p className="text-xs text-muted-foreground">High-Intent Rate</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <MessageSquare className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.responseRate}%</p>
                <p className="text-xs text-muted-foreground">Response Rate</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Lead Trend & Intent Score</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats.timeline}>
                  <defs>
                    <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip />
                  <Area yAxisId="left" type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#leadGrad)" strokeWidth={2} name="Leads" />
                  <Line yAxisId="right" type="monotone" dataKey="avgScore" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} name="Avg Intent %" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Keyword Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {keywordData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={keywordData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No keyword data yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lead Sources</CardTitle>
            </CardHeader>
            <CardContent>
              {sourceData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} strokeWidth={2}>
                        {sourceData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5">
                    {sourceData.map((s, i) => (
                      <div key={s.name} className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-foreground">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No source data yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Intent Score Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.intentBuckets}>
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {stats.intentBuckets.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lead Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={statusData}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No status data yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Keyword Suggestions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="h-5 w-5 text-primary" />
              Smart Keyword Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {suggestions.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {suggestions.map((s) => (
                  <div key={s.word} className="flex items-center justify-between rounded-lg border border-border p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{s.word}</span>
                      <Badge variant="secondary" className="text-xs">{s.count}x</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={savedSuggestions.includes(s.word)}
                      onClick={() => saveSuggestion(s.word)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {savedSuggestions.includes(s.word) ? "Saved" : "Save"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Suggestions will appear as leads are discovered
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Analytics;