import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Briefcase,
  Clock,
  Globe,
  Loader2,
  MessageSquare,
  Package,
  Phone,
  Share2,
  Sparkles,
  Tag,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useBusinessAIContent,
  useBusinessScanHistory,
  useGenerateBusinessContent,
  type BusinessAIContent,
  type BusinessScanHistory,
} from "@/hooks/useBusinessScans";

export interface AdminBusinessScanInsightsBusiness {
  id: string;
  business_name: string;
  industry: string | null;
  ai_tone: string | null;
  workspace_id: string | null;
  short_description: string | null;
}

export function AdminBusinessScanInsightsView({
  business,
}: {
  business: AdminBusinessScanInsightsBusiness;
}) {
  const [viewingScan, setViewingScan] = useState<BusinessScanHistory | null>(null);
  const { data: scans = [], isLoading: scansLoading } = useBusinessScanHistory(business.id);
  const { data: aiContents = [], isLoading: contentsLoading } = useBusinessAIContent(business.id);
  const generateContent = useGenerateBusinessContent();

  const activeScan = useMemo(() => viewingScan || scans[0] || null, [viewingScan, scans]);

  const handleGenerate = (scanHistoryId?: string) => {
    generateContent.mutate({
      businessId: business.id,
      workspaceId: business.workspace_id || "",
      scanHistoryId,
    });
  };

  return (
    <Tabs defaultValue="scans" className="w-full space-y-4">
      <TabsList>
        <TabsTrigger value="scans">Scan History</TabsTrigger>
        <TabsTrigger value="details">Scan Details</TabsTrigger>
        <TabsTrigger value="ai-content">AI Content</TabsTrigger>
      </TabsList>

      <TabsContent value="scans" className="space-y-3">
        {scansLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : scans.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No scans yet for this business.
          </Card>
        ) : (
          scans.map((scan) => (
            <div
              key={scan.id}
              className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                activeScan?.id === scan.id ? "border-primary bg-accent/40" : "border-border hover:bg-muted/40"
              }`}
              onClick={() => setViewingScan(scan)}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{scan.scanned_url}</span>
                    <Badge
                      variant={scan.status === "completed" ? "default" : scan.status === "scanning" ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {scan.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      <Clock className="mr-1 inline h-3 w-3" />
                      {format(new Date(scan.created_at), "MMM d, HH:mm")}
                    </span>
                    {scan.insights_count > 0 && <span>{scan.insights_count} insights</span>}
                    {scan.pages_scanned > 0 && <span>{scan.pages_scanned} page(s)</span>}
                    {scan.duration_ms && <span>{(scan.duration_ms / 1000).toFixed(1)}s</span>}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleGenerate(scan.id);
                  }}
                  disabled={generateContent.isPending || scan.status !== "completed"}
                >
                  {generateContent.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  Generate AI Content
                </Button>
              </div>
            </div>
          ))
        )}
      </TabsContent>

      <TabsContent value="details">
        {!activeScan ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Select a scan to view details.</Card>
        ) : activeScan.status !== "completed" ? (
          <Card className="p-8 text-center">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Scan in progress: {activeScan.scan_phase}</p>
          </Card>
        ) : (
          <ScanDetailsGrid scan={activeScan} />
        )}
      </TabsContent>

      <TabsContent value="ai-content" className="space-y-3">
        {contentsLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : aiContents.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">No AI content generated yet.</Card>
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
          <div key={index} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{product.title}</span> — {product.description}
            {product.pricing_signal && (
              <Badge variant="outline" className="ml-1 text-[10px]">
                {product.pricing_signal}
              </Badge>
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
          <div key={index} className="text-xs text-muted-foreground">
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
          <div key={index} className="text-xs text-muted-foreground">
            <Badge variant="secondary" className="mr-1 text-[10px]">
              {contact.type}
            </Badge>
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
          <div key={platform} className="text-xs text-muted-foreground">
            <span className="font-medium capitalize text-foreground">{platform}:</span> {(urls as string[]).length} link(s)
          </div>
        )),
    },
    {
      icon: Tag,
      title: "Pricing Signals",
      data: scan.pricing_signals,
      render: (items: any[]) => items.map((pricing, index) => <div key={index} className="text-xs text-muted-foreground">{pricing.signal || pricing}</div>),
    },
    {
      icon: MessageSquare,
      title: "CTA Signals",
      data: scan.cta_signals,
      render: (items: any[]) =>
        items.map((cta, index) => (
          <Badge key={index} variant="outline" className="mr-1 text-xs">
            {cta.cta || cta}
          </Badge>
        )),
    },
    {
      icon: TrendingUp,
      title: "Competitor Hints",
      data: scan.competitor_hints,
      render: (items: any[]) =>
        items.map((competitor, index) => (
          <div key={index} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{competitor.name}</span>
            {competitor.url && <span className="ml-1 text-muted-foreground">({competitor.url})</span>}
          </div>
        )),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="secondary">{scan.scanned_url}</Badge>
        {scan.tone_of_voice && <Badge variant="outline">Tone: {scan.tone_of_voice}</Badge>}
      </div>

      {scan.suggested_keywords?.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">Suggested Keywords</p>
          <div className="flex flex-wrap gap-1">
            {scan.suggested_keywords.map((keyword, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {keyword}
              </Badge>
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
          <Badge variant={content.status === "completed" ? "default" : "secondary"} className="text-xs">
            {content.status}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">{format(new Date(content.created_at), "MMM d, HH:mm")}</span>
      </div>

      {content.status === "completed" && json && (
        <div className="space-y-2">
          {json.post_ideas && (
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">Post Ideas</p>
              {(json.post_ideas as any[]).map((idea: any, index: number) => (
                <div key={index} className="ml-2 text-xs text-muted-foreground">• {idea.title || idea}</div>
              ))}
            </div>
          )}
          {json.reel_ideas && (
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">Reel Ideas</p>
              {(json.reel_ideas as any[]).map((idea: any, index: number) => (
                <div key={index} className="ml-2 text-xs text-muted-foreground">• {idea.title || idea}</div>
              ))}
            </div>
          )}
          {json.offer_ideas && (
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">Offer Ideas</p>
              {(json.offer_ideas as any[]).map((idea: any, index: number) => (
                <div key={index} className="ml-2 text-xs text-muted-foreground">• {idea.title || idea}</div>
              ))}
            </div>
          )}
          {json.funnel_suggestion && (
            <div>
              <p className="mb-1 text-xs font-medium text-foreground">Funnel Suggestion</p>
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
