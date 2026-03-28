import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Loader2, Globe, Code, Palette, Type } from "lucide-react";

interface TechResult {
  url: string;
  branding?: {
    colorScheme?: string;
    colors?: Record<string, string>;
    fonts?: { family: string }[];
    typography?: Record<string, any>;
    logo?: string;
    components?: Record<string, any>;
  };
  metadata?: {
    title?: string;
    description?: string;
    language?: string;
  };
}

export const TechAnalysisTab = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TechResult | null>(null);

  const analyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("scan-source-extract", {
        body: {
          action: "tech_analysis",
          url: url.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      toast.success("Tech analysis complete");
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Code className="h-4 w-4" /> Technology & Branding Analysis
          </CardTitle>
          <CardDescription>
            Analyze a competitor's website to detect their tech stack, branding, colors, and fonts using Firecrawl.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="https://competitor-website.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              className="flex-1"
            />
            <Button onClick={analyze} disabled={loading || !url.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Globe className="h-4 w-4 mr-2" />}
              Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm">Scraping and analyzing website technology...</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Colors */}
          {result.branding?.colors && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Palette className="h-4 w-4" /> Color Palette
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(result.branding.colors).map(([name, color]) => (
                    <div key={name} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded border border-border"
                        style={{ backgroundColor: color }}
                      />
                      <div>
                        <p className="text-xs font-medium capitalize">{name.replace(/([A-Z])/g, " $1")}</p>
                        <p className="text-xs text-muted-foreground">{color}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fonts */}
          {result.branding?.fonts && result.branding.fonts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Type className="h-4 w-4" /> Fonts Detected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.branding.fonts.map((f, i) => (
                    <Badge key={i} variant="secondary" className="mr-2">{f.family}</Badge>
                  ))}
                </div>
                {result.branding.typography?.fontSizes && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Font Sizes</p>
                    {Object.entries(result.branding.typography.fontSizes).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{k}:</span>
                        <span>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Logo */}
          {result.branding?.logo && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Logo</CardTitle>
              </CardHeader>
              <CardContent>
                <img src={result.branding.logo} alt="Competitor logo" className="max-h-16 object-contain" />
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          {result.metadata && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Page Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {result.metadata.title && <div><span className="text-muted-foreground">Title:</span> {result.metadata.title}</div>}
                {result.metadata.description && <div><span className="text-muted-foreground">Description:</span> {result.metadata.description}</div>}
                {result.metadata.language && <div><span className="text-muted-foreground">Language:</span> {result.metadata.language}</div>}
              </CardContent>
            </Card>
          )}

          {/* Color Scheme */}
          {result.branding?.colorScheme && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm"><span className="text-muted-foreground">Color Scheme:</span> <Badge variant="outline">{result.branding.colorScheme}</Badge></p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!loading && !result && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Code className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Enter a competitor URL above to analyze their technology stack and branding.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
