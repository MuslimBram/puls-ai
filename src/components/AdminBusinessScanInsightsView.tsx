import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  MessageSquare,
  Package,
  Phone,
  RotateCcw,
  Share2,
  Sparkles,
  Tag,
  TrendingUp,
  Workflow,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useBusinessAIContent,
  useBusinessScanHistory,
  useGenerateBusinessContent,
  useSaveBusinessScanToKnowledgeBase,
  useTriggerBusinessScan,
  type BusinessAIContent,
  type BusinessScanHistory,
  type ScanAutomationSummary,
} from "@/hooks/useBusinessScans";

export interface AdminBusinessScanInsightsBusiness {
  id: string;
  business_name: string;
  industry: string | null;
  ai_tone: string | null;
  workspace_id: string | null;
  short_description: string | null;
}

const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "completed":
      return "default";
    case "pending":
    case "scanning":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
};

const getAutomation = (scan?: BusinessScanHistory | null): ScanAutomationSummary | null => {
  const automation = scan?.summary_json?.automation;
  return automation && typeof automation === "object" ? (automation as ScanAutomationSummary) : null;
};

const getAutomationVariant = (status?: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "completed":
      return "default";
    case "queued":
    case "processing":
    case "retrying":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
};

const getAutomationIcon = (status?: string) => {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "failed":
      return XCircle;
    case "queued":
    case "processing":
    case "retrying":
      return Loader2;
    default:
      return Workflow;
  }
};

export function AdminBusinessScanInsightsView({
  business,
}: {
  business: AdminBusinessScanInsightsBusiness;
}) {
  const [viewingScan, setViewingScan] = useState<BusinessScanHistory | null>(null);
  const { data: scans = [], isLoading: scansLoading } = useBusinessScanHistory(business.id);
  const { data: aiContents = [], isLoading: contentsLoading } = useBusinessAIContent(business.id);
  const triggerScan = useTriggerBusinessScan();
  const generateContent = useGenerateBusinessContent();
  const saveToKnowledgeBase = useSaveBusinessScanToKnowledgeBase();

  const activeScan = useMemo(() => viewingScan || scans[0] || null, [viewingScan, scans]);

  const handleGenerate = (scanHistoryId?: string) => {
    generateContent.mutate({
      businessId: business.id,
      workspaceId: business.workspace_id || "",
      scanHistoryId,
    });
  };

  const handleSaveToKnowledgeBase = (scanHistoryId: string) => {
    saveToKnowledgeBase.mutate({
      businessId: business.id,
      scanHistoryId,
    });
  };

  const handleRetry = (url: string) => {
    triggerScan.mutate({
      businessId: business.id,
      workspaceId: business.workspace_id || "",
      url,
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
          scans.map((scan) => {
            const automation = getAutomation(scan);
            const AutomationIcon = getAutomationIcon(automation?.status);
            const saveDisabled = saveToKnowledgeBase.isPending || scan.status !== "completed";
            const generateDisabled = generateContent.isPending || scan.status !== "completed";
            const retryDisabled = triggerScan.isPending || !scan.scanned_url;

            return (
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
                      <Badge variant={getStatusVariant(scan.status)} className="text-xs">
                        {scan.status}
                      </Badge>
                      {automation?.status && (
                        <Badge variant={getAutomationVariant(automation.status)} className="text-xs">
                          <AutomationIcon className={`mr-1 h-3 w-3 ${automation.status === "completed" || automation.status === "failed" ? "" : "animate-spin"}`} />
                          Automation {automation.status}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        <Clock className="mr-1 inline h-3 w-3" />
                        {format(new Date(scan.created_at), "MMM d, HH:mm")}
                      </span>
                      {scan.insights_count > 0 && <span>{scan.insights_count} insights</span>}
                      {scan.pages_scanned > 0 && <span>{scan.pages_scanned} page(s)</span>}
                      {scan.duration_ms && <span>{(scan.duration_ms / 1000).toFixed(1)}s</span>}
                      {automation?.knowledge_chunks_created ? <span>{automation.knowledge_chunks_created} KB chunks</span> : null}
                    </div>
                    {automation && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <Badge variant={getAutomationVariant(automation.profile_sync)} className="text-[10px]">
                          Profile {automation.profile_sync || "pending"}
                        </Badge>
                        <Badge variant={getAutomationVariant(automation.knowledge_sync)} className="text-[10px]">
                          Knowledge Base {automation.knowledge_sync || "pending"}
                        </Badge>
                      </div>
                    )}
                    {scan.status === "failed" && scan.error_message && (
                      <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{scan.error_message}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {scan.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRetry(scan.scanned_url);
                        }}
                        disabled={retryDisabled}
                      >
                        {triggerScan.isPending ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-1 h-3 w-3" />
                        )}
                        Retry Scan
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSaveToKnowledgeBase(scan.id);
                      }}
                      disabled={saveDisabled}
                    >
                      {saveToKnowledgeBase.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <BookOpen className="mr-1 h-3 w-3" />
                      )}
                      Save to Knowledge Base
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleGenerate(scan.id);
                      }}
                      disabled={generateDisabled}
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
              </div>
            );
          })
        )}
      </TabsContent>

      <TabsContent value="details" className="space-y-4">
        {!activeScan ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Select a scan to view details.</Card>
        ) : activeScan.status === "failed" ? (
          <Card className="p-8 text-center">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
            <p className="text-sm font-medium text-foreground">Scan failed</p>
            <p className="mt-1 text-sm text-muted-foreground">{activeScan.error_message || "The scan ended with an unknown error."}</p>
          </Card>
        ) : activeScan.status !== "completed" ? (
          <Card className="p-8 text-center">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Scan in progress: {activeScan.scan_phase}</p>
          </Card>
        ) : (
          <>
            <AutomationStatusCard scan={activeScan} />
            <ScanDetailsGrid scan={activeScan} />
          </>
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

function AutomationStatusCard({ scan }: { scan: BusinessScanHistory }) {
  const automation = getAutomation(scan);
  const Icon = getAutomationIcon(automation?.status);

  if (!automation) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        No automation status has been recorded for this scan yet.
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={getAutomationVariant(automation.status)}>
          <Icon className={`mr-1 h-3.5 w-3.5 ${automation.status === "completed" || automation.status === "failed" ? "" : "animate-spin"}`} />
          Automation {automation.status || "pending"}
        </Badge>
        <Badge variant={getAutomationVariant(automation.profile_sync)}>Business Profile {automation.profile_sync || "pending"}</Badge>
        <Badge variant={getAutomationVariant(automation.knowledge_sync)}>Knowledge Base {automation.knowledge_sync || "pending"}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 text-sm text-muted-foreground">
        <div>
          <p className="text-xs font-medium text-foreground">Business Profile sync</p>
          {automation.updated_fields?.length ? (
            <p className="mt-1">Updated fields: {automation.updated_fields.join(", ")}</p>
          ) : (
            <p className="mt-1">No profile fields needed updating or sync is still pending.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-foreground">Knowledge Base sync</p>
          <p className="mt-1">
            {automation.knowledge_source_name || "Knowledge source pending"}
            {automation.knowledge_chunks_created ? ` · ${automation.knowledge_chunks_created} chunks` : ""}
          </p>
        </div>
      </div>

      {(automation.queued_at || automation.started_at || automation.completed_at) && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {automation.queued_at ? <span>Queued {format(new Date(automation.queued_at), "MMM d, HH:mm")}</span> : null}
          {automation.started_at ? <span>Started {format(new Date(automation.started_at), "MMM d, HH:mm")}</span> : null}
          {automation.completed_at ? <span>Completed {format(new Date(automation.completed_at), "MMM d, HH:mm")}</span> : null}
        </div>
      )}

      {automation.error ? (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{automation.error}</span>
        </div>
      ) : null}
    </Card>
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
