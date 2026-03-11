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
import { Copy, Eye, Search, Target } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";

const Leads = () => {
  const [filters, setFilters] = useState<LeadFilters>({});
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const { leads, isLoading } = useLeads(filters);
  const { keywords } = useKeywords();

  const copyReply = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Reply copied to clipboard");
  };

  const intentColor = (score: number) => {
    if (score >= 0.7) return "default";
    if (score >= 0.4) return "secondary";
    return "outline";
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Select
              value={filters.keyword ?? "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, keyword: v === "all" ? undefined : v }))}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Keyword" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All keywords</SelectItem>
                {keywords.map((k) => (
                  <SelectItem key={k.id} value={k.keyword}>{k.keyword}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              className="w-40"
              value={filters.dateFrom ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
            />
            <Input
              type="date"
              className="w-40"
              value={filters.dateTo ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))}
            />
            <Button variant="ghost" size="sm" onClick={() => setFilters({})}>Clear</Button>
          </CardContent>
        </Card>

        {/* Leads List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              Discovered Leads ({leads.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : leads.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No leads found. Add keywords and scan Telegram groups to discover leads.
              </p>
            ) : (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">{lead.source_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(lead.message_date), "MMM d, HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">{lead.message_content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {lead.detected_keyword && (
                          <Badge variant="secondary" className="text-xs">{lead.detected_keyword}</Badge>
                        )}
                        <Badge variant={intentColor(Number(lead.intent_score))} className="text-xs">
                          Intent: {Math.round(Number(lead.intent_score) * 100)}%
                        </Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedLead(lead)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lead Detail Dialog */}
        <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Lead Details</DialogTitle>
            </DialogHeader>
            {selectedLead && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Source</p>
                  <p className="text-sm text-foreground">{selectedLead.source_name} ({selectedLead.source_type})</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Date</p>
                  <p className="text-sm text-foreground">{format(new Date(selectedLead.message_date), "PPpp")}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Message</p>
                  <p className="text-sm text-foreground rounded-lg bg-muted p-3">{selectedLead.message_content}</p>
                </div>
                <div className="flex gap-2">
                  {selectedLead.detected_keyword && (
                    <Badge variant="secondary">{selectedLead.detected_keyword}</Badge>
                  )}
                  <Badge variant={intentColor(Number(selectedLead.intent_score))}>
                    Intent: {Math.round(Number(selectedLead.intent_score) * 100)}%
                  </Badge>
                </div>
                {selectedLead.suggested_reply && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Reply</p>
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                      <p className="text-sm text-foreground mb-2">{selectedLead.suggested_reply}</p>
                      <Button size="sm" variant="outline" onClick={() => copyReply(selectedLead.suggested_reply!)}>
                        <Copy className="h-3 w-3 mr-1" /> Copy Reply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Leads;
