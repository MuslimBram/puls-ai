import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLeads, LeadFilters } from "@/hooks/useLeads";
import { useKeywords } from "@/hooks/useKeywords";
import { useScoreLeads } from "@/hooks/useAIConversationMemory";
import { Copy, Eye, Search, Target, MessageSquare, ChevronLeft, ChevronRight, Brain, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { IntentBadge, INTENT_TYPE_OPTIONS } from "@/components/IntentBadge";

const Leads = () => {
  const [filters, setFilters] = useState<LeadFilters>({});
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const { leads, total, isLoading, updateStatus, page, pageSize, nextPage, prevPage, setPage } = useLeads(filters);
  const { keywords } = useKeywords();
  const scoreLeads = useScoreLeads();
  const navigate = useNavigate();

  const copyReply = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Reply copied to clipboard");
  };

  const intentColor = (score: number) => {
    if (score >= 0.7) return "default" as const;
    if (score >= 0.4) return "secondary" as const;
    return "outline" as const;
  };

  const aiScoreVariant = (score?: number | null) => {
    if (typeof score !== "number") return "outline" as const;
    if (score >= 80) return "default" as const;
    if (score >= 55) return "secondary" as const;
    return "outline" as const;
  };

  const totalPages = Math.ceil(total / pageSize);

  const handleFilterChange = (fn: (f: LeadFilters) => LeadFilters) => {
    setPage(0);
    setFilters(fn);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Select
              value={filters.keyword ?? "all"}
              onValueChange={(v) => handleFilterChange((f) => ({ ...f, keyword: v === "all" ? undefined : v }))}
            >
              <SelectTrigger className="w-40"><SelectValue placeholder="Keyword" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All keywords</SelectItem>
                {keywords.map((k) => (
                  <SelectItem key={k.id} value={k.keyword}>{k.keyword}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.status ?? "all"}
              onValueChange={(v) => handleFilterChange((f) => ({ ...f, status: v === "all" ? undefined : v }))}
            >
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" className="w-40" value={filters.dateFrom ?? ""} onChange={(e) => handleFilterChange((f) => ({ ...f, dateFrom: e.target.value || undefined }))} />
            <Input type="date" className="w-40" value={filters.dateTo ?? ""} onChange={(e) => handleFilterChange((f) => ({ ...f, dateTo: e.target.value || undefined }))} />
            <Select value={filters.intentType ?? "all"} onValueChange={(v) => handleFilterChange((f) => ({ ...f, intentType: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Intent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All intents</SelectItem>
                {INTENT_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => { setPage(0); setFilters({}); }}>Clear</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-primary" />
                Discovered Leads ({total})
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => scoreLeads.mutate()} disabled={scoreLeads.isPending}>
                <Brain className={`mr-2 h-4 w-4 ${scoreLeads.isPending ? "animate-pulse" : ""}`} />
                {scoreLeads.isPending ? "Scoring..." : "Run AI Scoring"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : leads.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No leads found. Add keywords and connect a Telegram channel to discover leads.
              </p>
            ) : (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <div key={lead.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{lead.source_name}</span>
                        <Badge variant="secondary" className="text-xs">{lead.source_type}</Badge>
                        <span className="text-xs text-muted-foreground">{format(new Date(lead.message_date), "MMM d, HH:mm")}</span>
                      </div>
                      <p className="line-clamp-2 text-sm text-foreground">{lead.message_content}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {lead.detected_keyword && <Badge variant="secondary" className="text-xs">{lead.detected_keyword}</Badge>}
                        <Badge variant={intentColor(Number(lead.intent_score))} className="text-xs">Intent: {Math.round(Number(lead.intent_score) * 100)}%</Badge>
                        {typeof (lead as any).ai_score === "number" && (
                          <Badge variant={aiScoreVariant((lead as any).ai_score)} className="text-xs">
                            AI Score: {Math.round((lead as any).ai_score)}
                          </Badge>
                        )}
                        {typeof (lead as any).churn_risk === "number" && (lead as any).churn_risk > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Churn: {Math.round((lead as any).churn_risk)}%
                          </Badge>
                        )}
                        <IntentBadge
                          intentType={(lead as any).intent_type}
                          urgencyLevel={(lead as any).urgency_level}
                          recommendedAction={(lead as any).recommended_action}
                          compact
                        />
                        <Badge variant="outline" className="text-xs">{lead.status}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setSelectedLead(lead)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/reply-workspace?leadId=${lead.id}`)}><MessageSquare className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={prevPage} disabled={page === 0}><ChevronLeft className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" onClick={nextPage} disabled={page + 1 >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Lead Details</DialogTitle></DialogHeader>
            {selectedLead && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Source</p>
                    <p className="text-sm text-foreground">{selectedLead.source_name} ({selectedLead.source_type})</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Date</p>
                    <p className="text-sm text-foreground">{format(new Date(selectedLead.message_date), "PPpp")}</p>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Message</p>
                  <p className="rounded-lg bg-muted p-3 text-sm text-foreground">{selectedLead.message_content}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedLead.detected_keyword && <Badge variant="secondary">{selectedLead.detected_keyword}</Badge>}
                  <Badge variant={intentColor(Number(selectedLead.intent_score))}>Intent: {Math.round(Number(selectedLead.intent_score) * 100)}%</Badge>
                  {typeof selectedLead.ai_score === "number" && <Badge variant={aiScoreVariant(selectedLead.ai_score)}>AI Score: {Math.round(selectedLead.ai_score)}</Badge>}
                  {typeof selectedLead.churn_risk === "number" && selectedLead.churn_risk > 0 && <Badge variant="destructive">Churn Risk: {Math.round(selectedLead.churn_risk)}%</Badge>}
                  <Badge variant="outline">{selectedLead.status}</Badge>
                </div>
                {selectedLead.last_scored_at && (
                  <p className="text-xs text-muted-foreground">
                    Last scored {format(new Date(selectedLead.last_scored_at), "PPpp")}
                  </p>
                )}
                {selectedLead.score_factors && typeof selectedLead.score_factors === "object" && Object.keys(selectedLead.score_factors).length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">AI Score Breakdown</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(selectedLead.score_factors as Record<string, number>).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between rounded-md bg-muted px-2 py-1.5">
                          <span className="text-xs capitalize text-muted-foreground">{key}</span>
                          <span className="text-xs font-medium text-foreground">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedLead.suggested_reply && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Suggested Reply</p>
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <p className="mb-2 text-sm text-foreground">{selectedLead.suggested_reply}</p>
                      <Button size="sm" variant="outline" onClick={() => copyReply(selectedLead.suggested_reply!)}><Copy className="mr-1 h-3 w-3" /> Copy Reply</Button>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Select value={selectedLead.status} onValueChange={(v) => { updateStatus.mutate({ id: selectedLead.id, status: v }); setSelectedLead({ ...selectedLead, status: v }); }}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => { setSelectedLead(null); navigate(`/reply-workspace?leadId=${selectedLead.id}`); }}>
                    <MessageSquare className="mr-1 h-3 w-3" /> AI Reply
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Leads;