import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLeads } from "@/hooks/useLeads";
import { useKeywords } from "@/hooks/useKeywords";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { BarChart3, TrendingUp, Target, Lightbulb, Plus } from "lucide-react";
import { format, subDays } from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";

const Analytics = () => {
  const { leads } = useLeads();
  const { keywords, addKeyword } = useKeywords();
  const [savedSuggestions, setSavedSuggestions] = useState<string[]>([]);

  const stats = useMemo(() => {
    const total = leads.length;
    const avgIntent = total ? leads.reduce((sum, l) => sum + Number(l.intent_score), 0) / total : 0;

    // Leads by keyword
    const byKeyword: Record<string, number> = {};
    leads.forEach((l) => { if (l.detected_keyword) byKeyword[l.detected_keyword] = (byKeyword[l.detected_keyword] || 0) + 1; });

    // Leads by source
    const bySource: Record<string, number> = {};
    leads.forEach((l) => { bySource[l.source_name] = (bySource[l.source_name] || 0) + 1; });

    // Leads over last 7 days
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const day = subDays(new Date(), 6 - i);
      const dayStr = format(day, "yyyy-MM-dd");
      const count = leads.filter((l) => format(new Date(l.message_date), "yyyy-MM-dd") === dayStr).length;
      return { date: format(day, "MMM d"), count };
    });

    return { total, avgIntent, byKeyword, bySource, last7 };
  }, [leads]);

  // Smart keyword suggestions based on high-intent leads
  const suggestions = useMemo(() => {
    const highIntent = leads.filter((l) => Number(l.intent_score) >= 0.6);
    const wordFreq: Record<string, number> = {};
    const existingKws = new Set(keywords.map((k) => k.keyword.toLowerCase()));

    highIntent.forEach((l) => {
      const words = l.message_content.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      words.forEach((w) => {
        const clean = w.replace(/[^a-z0-9]/g, "");
        if (clean && !existingKws.has(clean)) wordFreq[clean] = (wordFreq[clean] || 0) + 1;
      });
    });

    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));
  }, [leads, keywords]);

  const saveSuggestion = (word: string) => {
    addKeyword.mutate(word);
    setSavedSuggestions((prev) => [...prev, word]);
    toast.success(`"${word}" added as keyword`);
  };

  const keywordData = Object.entries(stats.byKeyword).map(([name, value]) => ({ name, value }));
  const sourceData = Object.entries(stats.bySource).map(([name, value]) => ({ name, value }));

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Leads</p>
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
                <p className="text-xs text-muted-foreground">Avg Intent Score</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <BarChart3 className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{Object.keys(stats.byKeyword).length}</p>
                <p className="text-xs text-muted-foreground">Active Keywords</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{suggestions.length}</p>
                <p className="text-xs text-muted-foreground">Suggested Keywords</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Leads Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={stats.last7}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Keyword Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {keywordData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={keywordData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No keyword data yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Source Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {sourceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sourceData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No source data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Smart Keyword Suggestions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="h-5 w-5 text-primary" />
                Smart Keyword Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {suggestions.length > 0 ? (
                <div className="space-y-2">
                  {suggestions.map((s) => (
                    <div key={s.word} className="flex items-center justify-between rounded-lg border border-border p-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{s.word}</span>
                        <Badge variant="secondary" className="text-xs">found {s.count}x</Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
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
      </div>
    </DashboardLayout>
  );
};

export default Analytics;
