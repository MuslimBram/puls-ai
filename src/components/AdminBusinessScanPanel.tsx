import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Search, Eye, Sparkles, Loader2, Globe, Package, Briefcase, Phone, Share2, Tag, MessageSquare, TrendingUp, Clock, RotateCcw } from "lucide-react";
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

interface ScanDialogState {
  business: Business;
  url: string;
  mode: "scan" | "rescan";
}

export const AdminBusinessScanPanel = ({ businesses }: { businesses: Business[] }) => {
  const navigate = useNavigate();
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [scanDialogState, setScanDialogState] = useState<ScanDialogState | null>(null);
  const [insightsDialogOpen, setInsightsDialogOpen] = useState(false);
  const [scanUrl, setScanUrl] = useState("");
  const [viewingScan, setViewingScan] = useState<BusinessScanHistory | null>(null);

  const triggerScan = useTriggerBusinessScan();
  const generateContent = useGenerateBusinessContent();

  const openScanDialog = (business: Business, options?: { url?: string; mode?: "scan" | "rescan" }) => {
    setSelectedBusiness(business);
    setScanUrl(options?.url ?? "");
    setScanDialogState({
      business,
      url: options?.url ?? "",
      mode: options?.mode ?? "scan",
    });
  };

  const handleViewInsights = (business: Business, initialScan?: BusinessScanHistory | null) => {
    setSelectedBusiness(business);
    setViewingScan(initialScan ?? null);
    setInsightsDialogOpen(true);
  };

  const openDedicatedInsightsPage = (businessId: string) => {
    navigate(`/admin/businesses/${businessId}/scan-insights`);
  };

  const closeScanDialog = (open: boolean) => {
    if (!open) {
      setScanDialogState(null);
      setScanUrl("");
    }
  };

  const handleStartScan = () => {
    if (!scanDialogState || !scanUrl.trim()) return;

    triggerScan.mutate(
      {
        businessId: scanDialogState.business.id,
        workspaceId: scanDialogState.business.workspace_id || "",
        url: scanUrl.trim(),
      },
      {
        onSuccess: () => {
          setScanDialogState(null);
          setScanUrl("");
          setSelectedBusiness(scanDialogState.business);
          setInsightsDialogOpen(true);
        },
      }
    );
  };

  const handleGenerate = (business: Business, scanHistoryId?: string) => {
    generateContent.mutate({
      businessId: business.id,
      workspaceId: business.workspace_id || "",
      scanHistoryId,
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Business Management & Scanning
          </CardTitle>
        </CardHeader>
        <CardContent>
          {businesses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No businesses registered</p>
          ) : (
            <div className="space-y-3">
              {businesses.map((business) => (
                <BusinessScanRow
                  key={business.id}
                  business={business}
                  onScan={openScanDialog}
                  onViewInsights={handleViewInsights}
                  onOpenInsightsPage={openDedicatedInsightsPage}
                  onGenerate={handleGenerate}
                  isGenerating={generateContent.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!scanDialogState} onOpenChange={closeScanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {scanDialogState?.mode === "rescan" ? "Re-scan Website" : "Scan Website"} for: {scanDialogState?.business.business_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Website URL</label>
              <Input
                placeholder="https://example.com"
                value={scanUrl}
                onChange={(event) => setScanUrl(event.target.value)}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The scan runs for the selected business profile and extracts products, services, contacts, social links, pricing signals, and tone of voice.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeScanDialog(false)}>Cancel</Button>
            <Button onClick={handleStartScan} disabled={!scanUrl.trim() || triggerScan.isPending}>
              {triggerScan.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  {scanDialogState?.mode === "rescan" ? "Re-scanning..." : "Scanning..."}
                </>
              ) : (
                <>
                  {scanDialogState?.mode === "rescan" ? <RotateCcw className="mr-1 h-3 w-3" /> : <Search className="mr-1 h-3 w-3" />}
                  {scanDialogState?.mode === "rescan" ? "Start Re-scan" : "Start Scan"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedBusiness && (
        <Dialog open={insightsDialogOpen} onOpenChange={setInsightsDialogOpen}>
          <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
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

function BusinessScanRow({
  business,
  onScan,
  onViewInsights,
  onOpenInsightsPage,
  onGenerate,
  isGenerating,
}: {
  business: Business;
  onScan: (business: Business, options?: { url?: string; mode?: "scan" | "rescan" }) => void;
  onViewInsights: (business: Business, initialScan?: BusinessScanHistory | null) => void;
  onOpenInsightsPage: (businessId: string) => void;
  onGenerate: (business: Business, scanHistoryId?: string) => void;
  isGenerating: boolean;
}) {
  const { data: scans = [], isLoading } = useBusinessScanHistory(business.id);

  const latestScan = useMemo(() => scans[0] ?? null, [scans]);
  const latestCompletedScan = useMemo(
    () => scans.find((scan) => scan.status === "completed") ?? null,
    [scans]
  );
  const lastKnownUrl = latestScan?.scanned_url ?? "";

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{business.business_name}</p>
            {business.industry && <Badge variant="secondary" className="text-xs">{business.industry}</Badge>}
            {business.ai_tone && <Badge variant="outline" className="text-xs">{business.ai_tone}</Badge>}
            <Badge variant="outline" className="text-xs">ID: {business.id.slice(0, 8)}</Badge>
          </div>

          {business.short_description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{business.short_description}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {isLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading scan history...
              </span>
            ) : latestScan ? (
              <>
                <Badge
                  variant={latestScan.status === "completed" ? "default" : latestScan.status === "scanning" ? "secondary" : "destructive"}
                  className="text-[10px]"
                >
                  {latestScan.status}
                </Badge>
                <span>Last scan: {format(new Date(latestScan.created_at), "MMM d, HH:mm")}</span>
                {latestScan.insights_count > 0 && <span>{latestScan.insights_count} insights</span>}
                {latestScan.duration_ms ? <span>{(latestScan.duration_ms / 1000).toFixed(1)}s</span> : null}
              </>
            ) : (
              <span>No scans yet for this business.</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => onScan(business, { mode: "scan" })}>
            <Search className="mr-1 h-3 w-3" /> Scan Website
          </Button>
          <Button size="sm" variant="outline" onClick={() => onViewInsights(business, latestScan)}>
            <Eye className="mr-1 h-3 w-3" /> Quick View
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenInsightsPage(business.id)}>
            <Globe className="mr-1 h-3 w-3" /> Open Insights Page
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => onGenerate(business, latestCompletedScan?.id)}
            disabled={isGenerating || !latestCompletedScan}
          >
            {isGenerating ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3 w-3" />
            )}
            Generate AI Content
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onScan(business, { url: lastKnownUrl, mode: "rescan" })}
            disabled={!latestScan}
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Re-scan
          </Button>
        </div>
      </div>
    </div>
  );
}

function BusinessInsightsView({
  business,
  viewingScan,
  onSelectScan,
  onGenerate,
  isGenerating,
}: {
  business: Business;
  viewingScan: BusinessScanHistory | null;
  onSelectScan: (scan: BusinessScanHistory | null) => void;
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
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : scans.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No scans yet. Use "Scan Website" to start.</p>
        ) : (
          scans.map((scan) => (
            <div
              key={scan.id}
              className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                activeScan?.id === scan.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
              onClick={() => onSelectScan(scan)}
            >
              <div className="flex items-center justify-between gap-3">
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
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      <Clock className="mr-0.5 inline h-3 w-3" />
                      {format(new Date(scan.created_at), "MMM d, HH:mm")}
                    </span>
                    {scan.insights_count > 0 && <span>{scan.insights_count} insights</span>}
                    {scan.duration_ms && <span>{(scan.duration_ms / 1000).toFixed(1)}s</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onGenerate(scan.id);
                  }}
                  disabled={isGenerating || scan.status !== "completed"}
                >
                  <Sparkles className="mr-1 h-3 w-3" /> Generate
                </Button>
              </div>
            </div>
          ))
        )}
      </TabsContent>

      <TabsContent value="details">
        {!activeScan ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Select a scan to view details</p>
        ) : activeScan.status !== "completed" ? (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Scan in progress: {activeScan.scan_phase}</p>
          </div>
        ) : (
          <ScanDetailsGrid scan={activeScan} />
        )}
      </TabsContent>

      <TabsContent value="ai-content" className="space-y-3">
        {contentsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : aiContents.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No AI content generated yet.</p>
        ) : (
          aiContents.map((content) => <AIContentCard key={content.id} content={content} />)
        )}
      </TabsContent>
    </Tabs>
  );
}

function ScanDetailsGrid({ scan }: { scan: BusinessScanHistory }) {
  const sections = [
    {
      icon: Package,
      title: "Products Detected",
      data: scan.products_found,
      render: (items: any[]) =>
        items.map((product, index) => (
          <div key={index} className="text-xs">
            <span className="font-medium text-foreground">{product.title}</span> — {product.description}
            {product.pricing_signal && (
              <Badge variant="outline" className="ml-1 text-[10px]">{product.pricing_signal}</Badge>
            )}
          </div>
        )),
    },
    {
      icon: Briefcase,
      title: "Services Detected",
      data: scan.services_found,
      render: (items: any[]) =>
        items.map((service, index) => (
          <div key={index} className="text-xs">
            <span className="font-medium text-foreground">{service.title}</span> — {service.description}
          </div>
        )),
    },
    {
      icon: Phone,
      title: "Contact Methods",
      data: scan.contact_methods,
      render: (items: any[]) =>
        items.map((contact, index) => (
          <div key={index} className="text-xs">
            <Badge variant="secondary" className="mr-1 text-[10px]">{contact.type}</Badge>
            {contact.value}
          </div>
        )),
    },
    {
      icon: Share2,
      title: "Social Links",
      data: scan.social_links,
      render: (links: Record<string, string[]>) =>
        Object.entries(links).map(([platform, urls]) => (
          <div key={platform} className="text-xs">
            <span className="font-medium capitalize text-foreground">{platform}:</span> {(urls as string[]).length} link(s)
          </div>
        )),
    },
    {
      icon: Tag,
      title: "Pricing Signals",
      data: scan.pricing_signals,
      render: (items: any[]) => items.map((pricing, index) => <div key={index} className="text-xs">{pricing.signal || pricing}</div>),
    },
    {
      icon: MessageSquare,
      title: "CTA Signals",
      data: scan.cta_signals,
      render: (items: any[]) =>
        items.map((cta, index) => (
          <Badge key={index} variant="outline" className="mr-1 text-xs">{cta.cta || cta}</Badge>
        )),
    },
    {
      icon: TrendingUp,
      title: "Competitor Hints",
      data: scan.competitor_hints,
      render: (items: any[]) =>
        items.map((competitor, index) => (
          <div key={index} className="text-xs">
            <span className="font-medium text-foreground">{competitor.name}</span>
            {competitor.url && <span className="ml-1 text-muted-foreground">({competitor.url})</span>}
          </div>
        )),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <Badge variant="secondary">{scan.scanned_url}</Badge>
        {scan.tone_of_voice && <Badge variant="outline">Tone: {scan.tone_of_voice}</Badge>}
      </div>

      {scan.suggested_keywords?.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">Suggested Keywords</p>
          <div className="flex flex-wrap gap-1">
            {scan.suggested_keywords.map((keyword, index) => (
              <Badge key={index} variant="secondary" className="text-xs">{keyword}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sections.map(({ icon: Icon, title, data, render }) => {
          const items = Array.isArray(data) ? data : data && typeof data === "object" ? Object.keys(data) : [];
          if (items.length === 0 && (!data || (typeof data === "object" && Object.keys(data).length === 0))) {
            return null;
          }

          return (
            <Card key={title} className="p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">{title}</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {Array.isArray(data) ? data.length : Object.keys(data || {}).length}
                </Badge>
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
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-medium capitalize text-foreground">{content.content_type.replace(/_/g, " ")}</span>
          <Badge variant={content.status === "completed" ? "default" : "secondary"} className="text-xs">{content.status}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{format(new Date(content.created_at), "MMM d, HH:mm")}</span>
      </div>

      {content.status === "completed" && json && (
        <div className="space-y-2">
          {json.post_ideas && (
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">📝 Post Ideas</p>
              {(json.post_ideas as any[]).map((idea: any, index: number) => (
                <div key={index} className="ml-2 text-xs text-muted-foreground">• {idea.title || idea}</div>
              ))}
            </div>
          )}
          {json.reel_ideas && (
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">🎬 Reel Ideas</p>
              {(json.reel_ideas as any[]).map((idea: any, index: number) => (
                <div key={index} className="ml-2 text-xs text-muted-foreground">• {idea.title || idea}</div>
              ))}
            </div>
          )}
          {json.offer_ideas && (
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">🎯 Offer Ideas</p>
              {(json.offer_ideas as any[]).map((idea: any, index: number) => (
                <div key={index} className="ml-2 text-xs text-muted-foreground">• {idea.title || idea}</div>
              ))}
            </div>
          )}
          {json.funnel_suggestion && (
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">🔄 Funnel Suggestion</p>
              <p className="ml-2 text-xs text-muted-foreground">
                {typeof json.funnel_suggestion === "string" ? json.funnel_suggestion : JSON.stringify(json.funnel_suggestion)}
              </p>
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
