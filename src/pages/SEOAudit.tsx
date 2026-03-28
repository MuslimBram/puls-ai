import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import {
  Search, Loader2, CheckCircle, AlertTriangle, XCircle,
  FileText, Image, Link2, Share2, Code, Lightbulb, Target, BarChart3,
} from "lucide-react";

type Status = "good" | "warning" | "error";
interface AnalysisItem {
  score: number;
  status: Status;
  message: string;
  suggestion?: string;
}
interface KeywordOpp { keyword: string; relevance: string; suggestion: string; }
interface Recommendation { priority: string; category: string; recommendation: string; impact: string; }
interface AuditResult {
  overall_score: number;
  grade: string;
  title_analysis: AnalysisItem;
  meta_description_analysis: AnalysisItem;
  headings_analysis: AnalysisItem;
  images_analysis: AnalysisItem;
  links_analysis: AnalysisItem;
  social_analysis: AnalysisItem;
  technical_analysis: AnalysisItem;
  keyword_opportunities: KeywordOpp[];
  top_recommendations: Recommendation[];
  content_quality: { score: number; readability: string; tone?: string; suggestions?: string[] };
}

const statusIcon = (s: Status) => {
  if (s === "good") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (s === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
};

const gradeColor = (g: string) => {
  if (g.startsWith("A")) return "bg-green-500/10 text-green-600 border-green-500/30";
  if (g.startsWith("B")) return "bg-blue-500/10 text-blue-600 border-blue-500/30";
  if (g.startsWith("C")) return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
  return "bg-destructive/10 text-destructive border-destructive/30";
};

const priorityColor: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  low: "bg-muted text-muted-foreground",
};

export default function SEOAudit() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [signals, setSignals] = useState<Record<string, any> | null>(null);

  const runAudit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setAudit(null);
    setSignals(null);
    try {
      const { data, error } = await supabase.functions.invoke("seo-audit", {
        body: { url: url.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAudit(data.audit);
      setSignals(data.signals);
      toast.success("SEO audit complete");
    } catch (e: any) {
      toast.error(e.message || "Audit failed");
    } finally {
      setLoading(false);
    }
  };

  const analyses = audit ? [
    { key: "title", label: "Title Tag", icon: FileText, data: audit.title_analysis },
    { key: "meta", label: "Meta Description", icon: FileText, data: audit.meta_description_analysis },
    { key: "headings", label: "Headings (H1/H2)", icon: FileText, data: audit.headings_analysis },
    { key: "images", label: "Images & Alt Text", icon: Image, data: audit.images_analysis },
    { key: "links", label: "Links", icon: Link2, data: audit.links_analysis },
    { key: "social", label: "Social / OG Tags", icon: Share2, data: audit.social_analysis },
    { key: "technical", label: "Technical SEO", icon: Code, data: audit.technical_analysis },
  ] : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SEO Audit</h1>
          <p className="text-sm text-muted-foreground">Analyze any webpage for SEO issues and get AI-powered recommendations.</p>
        </div>

        {/* URL Input */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Input
                placeholder="Enter website URL (e.g. example.com)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAudit()}
                className="flex-1"
              />
              <Button onClick={runAudit} disabled={loading || !url.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                {loading ? "Analyzing..." : "Run Audit"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="text-sm font-medium">Crawling and analyzing page...</p>
                <p className="text-xs text-muted-foreground">Scraping content, checking meta tags, and generating AI insights</p>
              </div>
            </CardContent>
          </Card>
        )}

        {audit && (
          <>
            {/* Score Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className={`inline-flex items-center justify-center h-20 w-20 rounded-full border-4 ${gradeColor(audit.grade)} mb-3`}>
                    <span className="text-3xl font-bold">{audit.grade}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Overall Grade</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-4xl font-bold text-foreground">{audit.overall_score}</p>
                  <Progress value={audit.overall_score} className="mt-2" />
                  <p className="text-sm text-muted-foreground mt-1">SEO Score</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-4xl font-bold text-foreground">{audit.content_quality.score}</p>
                  <p className="text-sm text-muted-foreground mt-1">Content Quality</p>
                  <p className="text-xs text-muted-foreground">{audit.content_quality.readability}</p>
                </CardContent>
              </Card>
            </div>

            {/* Raw Signals */}
            {signals && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Page Signals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Title Length:</span> <span className="font-medium">{signals.title_length} chars</span></div>
                    <div><span className="text-muted-foreground">Meta Desc:</span> <span className="font-medium">{signals.meta_description_length} chars</span></div>
                    <div><span className="text-muted-foreground">H1 Tags:</span> <span className="font-medium">{signals.h1_count}</span></div>
                    <div><span className="text-muted-foreground">H2 Tags:</span> <span className="font-medium">{signals.h2_count}</span></div>
                    <div><span className="text-muted-foreground">Images:</span> <span className="font-medium">{signals.total_images}</span></div>
                    <div><span className="text-muted-foreground">Missing Alt:</span> <span className="font-medium">{signals.images_without_alt}</span></div>
                    <div><span className="text-muted-foreground">Word Count:</span> <span className="font-medium">{signals.word_count}</span></div>
                    <div><span className="text-muted-foreground">Links:</span> <span className="font-medium">{signals.internal_links} int / {signals.external_links} ext</span></div>
                    <div><span className="text-muted-foreground">Canonical:</span> <span className="font-medium">{signals.canonical_url ? "✓" : "✗"}</span></div>
                    <div><span className="text-muted-foreground">Viewport:</span> <span className="font-medium">{signals.has_viewport ? "✓" : "✗"}</span></div>
                    <div><span className="text-muted-foreground">OG Tags:</span> <span className="font-medium">{signals.has_og_tags ? "✓" : "✗"}</span></div>
                    <div><span className="text-muted-foreground">Schema:</span> <span className="font-medium">{signals.has_schema_markup ? "✓" : "✗"}</span></div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Tabs defaultValue="checklist">
              <TabsList>
                <TabsTrigger value="checklist">Checklist ({analyses.length})</TabsTrigger>
                <TabsTrigger value="keywords">Keywords ({audit.keyword_opportunities.length})</TabsTrigger>
                <TabsTrigger value="recommendations">Recommendations ({audit.top_recommendations.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="checklist" className="space-y-3 mt-4">
                {analyses.map((a) => (
                  <Card key={a.key}>
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        {statusIcon(a.data.status)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{a.label}</p>
                            <Badge variant="secondary" className="text-xs">{a.data.score}/100</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{a.data.message}</p>
                          {a.data.suggestion && (
                            <p className="text-xs text-primary mt-1 flex items-center gap-1">
                              <Lightbulb className="h-3 w-3" /> {a.data.suggestion}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="keywords" className="space-y-3 mt-4">
                {audit.keyword_opportunities.map((kw, i) => (
                  <Card key={i}>
                    <CardContent className="py-4 flex items-start gap-3">
                      <Target className="h-4 w-4 text-primary mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{kw.keyword}</p>
                          <Badge className={priorityColor[kw.relevance] || ""}>{kw.relevance}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{kw.suggestion}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {audit.keyword_opportunities.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No keyword opportunities found.</p>
                )}
              </TabsContent>

              <TabsContent value="recommendations" className="space-y-3 mt-4">
                {audit.top_recommendations.map((rec, i) => (
                  <Card key={i}>
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <Badge className={priorityColor[rec.priority] || ""}>{rec.priority}</Badge>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{rec.recommendation}</p>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            <span>Category: {rec.category}</span>
                            <span>Impact: {rec.impact}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
