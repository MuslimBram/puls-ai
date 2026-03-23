import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useScanInsights, useScanHistory, type ScanInsight } from "@/hooks/useScanInsights";
import {
  Building2, Package, Phone, Share2, Layout, Lightbulb, Star, StarOff,
  ChevronDown, ChevronRight, Clock, Loader2, FileText, Wrench,
} from "lucide-react";

const SECTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  business_info: { label: "Business Summary", icon: Building2, color: "text-blue-500" },
  product: { label: "Products", icon: Package, color: "text-emerald-500" },
  service: { label: "Services", icon: Wrench, color: "text-violet-500" },
  social_post: { label: "Posts & Content", icon: FileText, color: "text-indigo-500" },
  offer: { label: "Offers & Promotions", icon: Lightbulb, color: "text-orange-500" },
  contact: { label: "Contact Methods", icon: Phone, color: "text-amber-500" },
  social: { label: "Social Links", icon: Share2, color: "text-pink-500" },
  cta: { label: "Call-to-Action", icon: Layout, color: "text-cyan-500" },
  pricing: { label: "Pricing Signals", icon: Package, color: "text-teal-500" },
  structure: { label: "Website Structure", icon: Layout, color: "text-cyan-500" },
  opportunity: { label: "Detected Opportunities", icon: Lightbulb, color: "text-yellow-500" },
};

const PHASE_LABELS: Record<string, string> = {
  queued: "Queued",
  crawling: "Crawling website…",
  extracting: "Extracting data…",
  analyzing: "AI analyzing…",
  completed: "Completed",
  error: "Error",
};

function InsightCard({ insight, onToggle }: { insight: ScanInsight; onToggle: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm text-foreground">{insight.title}</span>
          <Badge variant="outline" className="text-[10px] px-1.5">
            {Math.round(insight.confidence_score * 100)}%
          </Badge>
        </div>
        {insight.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{insight.description}</p>
        )}
        {insight.raw_value_json && Object.keys(insight.raw_value_json).length > 0 && (
          <RawValueDisplay data={insight.raw_value_json} />
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onToggle}
        title={insight.is_important ? "Unmark important" : "Mark important"}
      >
        {insight.is_important ? (
          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
        ) : (
          <StarOff className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}

function RawValueDisplay({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");

  if (!entries.length) return null;

  return (
    <div className="mt-2 space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="text-xs">
          <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}: </span>
          {Array.isArray(value) ? (
            <span className="text-foreground">{(value as string[]).join(", ")}</span>
          ) : typeof value === "object" && value !== null ? (
            <div className="ml-2 mt-1">
              {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                <div key={k} className="text-xs">
                  <span className="text-muted-foreground capitalize">{k}: </span>
                  <span className="text-foreground">
                    {Array.isArray(v) ? (v as string[]).join(", ") : String(v)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-foreground">{String(value)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ScanProgressBar({ scan }: { scan: any }) {
  if (!scan) return null;

  const phase = scan.scan_phase || scan.status || "queued";
  const isActive = ["queued", "crawling", "extracting", "analyzing"].includes(phase);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 mb-4">
      {isActive && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      {!isActive && <Clock className="h-4 w-4 text-muted-foreground" />}
      <div className="flex-1">
        <p className="text-sm font-medium">{PHASE_LABELS[phase] || phase}</p>
        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
          {scan.pages_scanned > 0 && <span>{scan.pages_scanned} page(s) scanned</span>}
          {scan.insights_found > 0 && <span>{scan.insights_found} insights found</span>}
          {scan.duration_ms && <span>{(scan.duration_ms / 1000).toFixed(1)}s</span>}
        </div>
      </div>
      <Badge variant={phase === "completed" ? "default" : phase === "error" ? "destructive" : "secondary"}>
        {phase}
      </Badge>
    </div>
  );
}

interface ScanResultViewerProps {
  sourceId: string;
  scanId?: string;
}

export default function ScanResultViewer({ sourceId, scanId }: ScanResultViewerProps) {
  const { grouped, isLoading, toggleImportant } = useScanInsights(sourceId, scanId);
  const { data: scans } = useScanHistory(sourceId);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    business_info: true,
    product: true,
    service: true,
    contact: true,
    social: true,
    structure: false,
    opportunity: true,
  });

  const latestScan = scans?.[0];
  const sectionOrder = ["business_info", "product", "service", "social_post", "offer", "contact", "social", "cta", "pricing", "structure", "opportunity"];

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasInsights = Object.keys(grouped).length > 0;

  return (
    <div className="space-y-4">
      {latestScan && <ScanProgressBar scan={latestScan} />}

      {!hasInsights && (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No scan insights yet. Run a scan to extract business intelligence.</p>
        </div>
      )}

      {sectionOrder.map((type) => {
        const insights = grouped[type];
        if (!insights?.length) return null;
        const config = SECTION_CONFIG[type] || { label: type, icon: FileText, color: "text-foreground" };
        const Icon = config.icon;
        const isOpen = openSections[type] ?? true;

        return (
          <Collapsible key={type} open={isOpen} onOpenChange={() => toggleSection(type)}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="pb-2 cursor-pointer">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${config.color}`} />
                      {config.label}
                      <Badge variant="secondary" className="ml-1 text-[10px]">
                        {insights.length}
                      </Badge>
                    </span>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-2 pt-0">
                  {insights.map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      onToggle={() =>
                        toggleImportant.mutate({
                          id: insight.id,
                          is_important: !insight.is_important,
                        })
                      }
                    />
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
