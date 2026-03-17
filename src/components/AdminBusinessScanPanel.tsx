import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Search, Eye, Sparkles, Loader2, Globe, Package, Briefcase, Phone, Share2, Tag, MessageSquare, TrendingUp, Clock } from "lucide-react";
import { format } from "date-fns";
import {
  useBusinessScanHistory,
  useBusinessAIContent,
  useTriggerBusinessScan,
  useGenerateBusinessContent,
  type BusinessScanHistory,
  type BusinessAIContent,
} from "@/hooks/useBusinessScans";

interface Business {
  id: string;
  business_name: string;
  industry: string | null;
  ai_tone: string | null;
  workspace_id: string | null;
  short_description: string | null;
}

export const AdminBusinessScanPanel = ({ businesses }: { businesses: Business[] }) => {
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [insightsDialogOpen, setInsightsDialogOpen] = useState(false);
  const [scanUrl, setScanUrl] = useState("");
  const [viewingScan, setViewingScan] = useState<BusinessScanHistory | null>(null);

  const triggerScan = useTriggerBusinessScan();
  const generateContent = useGenerateBusinessContent();

  const handleScanClick = (b: Business) => {
    setSelectedBusiness(b);
    setScanUrl("");
    setScanDialogOpen(true);
  };

  const handleViewInsights = (b: Business) => {
    setSelectedBusiness(b);
    setViewingScan(null);
    setInsightsDialogOpen(true);
  };

  const handleStartScan = () => {
    if (!selectedBusiness || !scanUrl.trim()) return;
    triggerScan.mutate(
      {
        businessId: selectedBusiness.id,
        workspaceId: selectedBusiness.workspace_id || "",
        url: scanUrl.trim(),
      },
      { onSuccess: () => setScanDialogOpen(false) }
    );
  };

  const handleGenerate = (b: Business, scanHistoryId?: string) => {
    generateContent.mutate({
      businessId: b.id,
      workspaceId: b.workspace_id || "",
      scanHistoryId,
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Business Management & Scanning
          </CardTitle>
        </CardHeader>
        <CardContent>
          {businesses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No businesses registered</p>
          ) : (
            <div className="space-y-2">
              {businesses.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{b.business_name}</p>
                      {b.industry && <Badge variant="secondary" className="text-xs">{b.industry}</Badge>}
                      {b.ai_tone && <Badge variant="outline" className="text-xs">{b.ai_tone}</Badge>}
                    </div>
                    {b.short_description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{b.short_description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-2">
                    <Button size="sm" variant="outline" onClick={() => handleScanClick(b)}>
                      <Search className="h-3 w-3 mr-1" /> Scan Website
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleViewInsights(b)}>
                      <Eye className="h-3 w-3 mr-1" /> Insights
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleGenerate(b)}
                      disabled={generateContent.isPending}
                    >
                      {generateContent.isPending ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      Generate AI Content
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scan Dialog */}
      <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan Website for: {selectedBusiness?.business_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Website URL</label>
              <Input
                placeholder="https://example.com"
                value={scanUrl}
                onChange={(e) => setScanUrl(e.target.value)}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The scan will extract products, services, contact info, social links, pricing signals, and tone of voice.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScanDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleStartScan} disabled={!scanUrl.trim() || triggerScan.isPending}>
              {triggerScan.isPending ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Scanning...</>
              ) : (
                <><Search className="h-3 w-3 mr-1" /> Start Scan</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Insights Dialog */}
      {selectedBusiness && (
        <Dialog open={insightsDialogOpen} onOpenChange={setInsightsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Business Insights: {selectedBusiness.business_name}</DialogTitle>
            </DialogHeader>
            <BusinessInsightsView
              business={selectedBusiness}
              viewingScan={viewingScan}
              onSelectScan={setViewingScan}
              onGenerate={(scanId) => handleGenerate(selectedBusiness, scanId)}
              isGenerating={generateContent.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

function BusinessInsightsView({
  business,
  viewingScan,
  onSelectScan,
  onGenerate,
  isGenerating,
}: {
  business: Business;
  viewingScan: BusinessScanHistory | null;
  onSelectScan: (s: BusinessScanHistory | null) => void;
  onGenerate: (scanId?: string) => void;
  isGenerating: boolean;
}) {
  const { data: scans = [], isLoading: scansLoading } = useBusinessScanHistory(business.id);
  const { data: aiContents = [], isLoading: contentsLoading } = useBusinessAIContent(business.id);

  const activeScan = viewingScan || (scans.length > 0 ? scans[0] : null);

  return (
    <Tabs defaultValue="scans" className="w-full">
      <TabsList>
        <TabsTrigger value="scans">Scan History</TabsTrigger>
        <TabsTrigger value="details">Scan Details</TabsTrigger>
        <TabsTrigger value="ai-content">AI Content</TabsTrigger>
      </TabsList>

      <TabsContent value="scans" className="space-y-2">
        {scansLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : scans.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No scans yet. Use "Scan Website" to start.</p>
        ) : (
          scans.map((scan) => (
            <div
              key={scan.id}
              className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${
                activeScan?.id === scan.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
              onClick={() => onSelectScan(scan)}
            >
              <div>
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{scan.scanned_url}</span>
                  <Badge
                    variant={scan.status === "completed" ? "default" : scan.status === "scanning" ? "secondary" : "destructive"}
                    className="text-xs"
                  >
                    {scan.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span><Clock className="h-3 w-3 inline mr-0.5" />{format(new Date(scan.created_at), "MMM d, HH:mm")}</span>
                  {scan.insights_count > 0 && <span>{scan.insights_count} insights</span>}
                  {scan.duration_ms && <span>{(scan.duration_ms / 1000).toFixed(1)}s</span>}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); onGenerate(scan.id); }}
                disabled={isGenerating || scan.status !== "completed"}
              >
                <Sparkles className="h-3 w-3 mr-1" /> Generate
              </Button>
            </div>
          ))
        )}
      </TabsContent>

      <TabsContent value="details">
        {!activeScan ? (
          <p className="text-sm text-muted-foreground text-center py-8">Select a scan to view details</p>
        ) : activeScan.status !== "completed" ? (
          <div className="text-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Scan in progress: {activeScan.scan_phase}</p>
          </div>
        ) : (
          <ScanDetailsGrid scan={activeScan} />
        )}
      </TabsContent>

      <TabsContent value="ai-content" className="space-y-3">
        {contentsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : aiContents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No AI content generated yet.</p>
        ) : (
          aiContents.map((content) => (
            <AIContentCard key={content.id} content={content} />
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}

function ScanDetailsGrid({ scan }: { scan: BusinessScanHistory }) {
  const sections = [
    { icon: Package, title: "Products Detected", data: scan.products_found, render: (items: any[]) => items.map((p, i) => (
      <div key={i} className="text-xs"><span className="font-medium text-foreground">{p.title}</span> — {p.description}{p.pricing_signal && <Badge variant="outline" className="ml-1 text-[10px]">{p.pricing_signal}</Badge>}</div>
    ))},
    { icon: Briefcase, title: "Services Detected", data: scan.services_found, render: (items: any[]) => items.map((s, i) => (
      <div key={i} className="text-xs"><span className="font-medium text-foreground">{s.title}</span> — {s.description}</div>
    ))},
    { icon: Phone, title: "Contact Methods", data: scan.contact_methods, render: (items: any[]) => items.map((c, i) => (
      <div key={i} className="text-xs"><Badge variant="secondary" className="text-[10px] mr-1">{c.type}</Badge>{c.value}</div>
    ))},
    { icon: Share2, title: "Social Links", data: scan.social_links, render: (links: Record<string, string[]>) => Object.entries(links).map(([platform, urls]) => (
      <div key={platform} className="text-xs"><span className="font-medium text-foreground capitalize">{platform}:</span> {(urls as string[]).length} link(s)</div>
    ))},
    { icon: Tag, title: "Pricing Signals", data: scan.pricing_signals, render: (items: any[]) => items.map((p, i) => (
      <div key={i} className="text-xs">{p.signal || p}</div>
    ))},
    { icon: MessageSquare, title: "CTA Signals", data: scan.cta_signals, render: (items: any[]) => items.map((c, i) => (
      <Badge key={i} variant="outline" className="text-xs mr-1">{c.cta || c}</Badge>
    ))},
    { icon: TrendingUp, title: "Competitor Hints", data: scan.competitor_hints, render: (items: any[]) => items.map((c, i) => (
      <div key={i} className="text-xs"><span className="font-medium text-foreground">{c.name}</span>{c.url && <span className="text-muted-foreground ml-1">({c.url})</span>}</div>
    ))},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <Badge variant="secondary">{scan.scanned_url}</Badge>
        {scan.tone_of_voice && <Badge variant="outline">Tone: {scan.tone_of_voice}</Badge>}
      </div>
      {scan.suggested_keywords?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground mb-1">Suggested Keywords</p>
          <div className="flex flex-wrap gap-1">
            {scan.suggested_keywords.map((kw, i) => <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>)}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sections.map(({ icon: Icon, title, data, render }) => {
          const items = Array.isArray(data) ? data : (data && typeof data === "object" ? Object.keys(data) : []);
          if (items.length === 0 && (!data || (typeof data === "object" && Object.keys(data).length === 0))) return null;
          return (
            <Card key={title} className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">{title}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{Array.isArray(data) ? data.length : Object.keys(data || {}).length}</Badge>
              </div>
              <div className="space-y-1">{render(data as any)}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AIContentCard({ content }: { content: BusinessAIContent }) {
  const json = content.content_json as any;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-medium text-foreground capitalize">{content.content_type.replace(/_/g, " ")}</span>
          <Badge variant={content.status === "completed" ? "default" : "secondary"} className="text-xs">{content.status}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{format(new Date(content.created_at), "MMM d, HH:mm")}</span>
      </div>
      {content.status === "completed" && json && (
        <div className="space-y-2">
          {json.post_ideas && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1">📝 Post Ideas</p>
              {(json.post_ideas as any[]).map((idea: any, i: number) => (
                <div key={i} className="text-xs text-muted-foreground ml-2">• {idea.title || idea}</div>
              ))}
            </div>
          )}
          {json.reel_ideas && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1">🎬 Reel Ideas</p>
              {(json.reel_ideas as any[]).map((idea: any, i: number) => (
                <div key={i} className="text-xs text-muted-foreground ml-2">• {idea.title || idea}</div>
              ))}
            </div>
          )}
          {json.offer_ideas && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1">🎯 Offer Ideas</p>
              {(json.offer_ideas as any[]).map((idea: any, i: number) => (
                <div key={i} className="text-xs text-muted-foreground ml-2">• {idea.title || idea}</div>
              ))}
            </div>
          )}
          {json.funnel_suggestion && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1">🔄 Funnel Suggestion</p>
              <p className="text-xs text-muted-foreground ml-2">{typeof json.funnel_suggestion === "string" ? json.funnel_suggestion : JSON.stringify(json.funnel_suggestion)}</p>
            </div>
          )}
        </div>
      )}
      {content.status === "generating" && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Generating content...</span>
        </div>
      )}
    </Card>
  );
}
