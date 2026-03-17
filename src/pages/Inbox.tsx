import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInbox, InboxFilters } from "@/hooks/useInbox";
import { useLeads } from "@/hooks/useLeads";
import { AIContextPanel } from "@/components/AIContextPanel";
import { CustomerIntelligenceProfile } from "@/components/CustomerIntelligenceProfile";
import { Inbox as InboxIcon, Search, Star, Eye, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { IntentBadge, INTENT_TYPE_OPTIONS } from "@/components/IntentBadge";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const Inbox = () => {
  const [filters, setFilters] = useState<InboxFilters>({});
  const [selectedMsg, setSelectedMsg] = useState<any>(null);
  const { messages, total, isLoading, markRead, updateStatus, updatePriority, subscribeRealtime, page, pageSize, nextPage, prevPage, setPage } = useInbox(filters);
  const { updateStatus: updateLeadStatus } = useLeads();
  const navigate = useNavigate();

  useEffect(() => {
    const channel = subscribeRealtime();
    return () => { channel.unsubscribe(); };
  }, []);

  const handleOpen = (msg: any) => {
    setSelectedMsg(msg);
    if (msg.is_unread) markRead.mutate(msg.id);
  };

  const priorityColor = (p: string) => {
    if (p === "high") return "destructive" as const;
    if (p === "medium") return "secondary" as const;
    return "outline" as const;
  };

  const unreadCount = messages.filter((m) => m.is_unread).length;
  const totalPages = Math.ceil(total / pageSize);

  const handleFilterChange = (fn: (f: InboxFilters) => InboxFilters) => {
    setPage(0);
    setFilters(fn);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search messages..." className="w-48" value={filters.search ?? ""} onChange={(e) => handleFilterChange((f) => ({ ...f, search: e.target.value || undefined }))} />
            <Select value={filters.channelType ?? "all"} onValueChange={(v) => handleFilterChange((f) => ({ ...f, channelType: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Channel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="website_chat">Website Chat</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.priority ?? "all"} onValueChange={(v) => handleFilterChange((f) => ({ ...f, priority: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.status ?? "all"} onValueChange={(v) => handleFilterChange((f) => ({ ...f, status: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => { setPage(0); setFilters({}); }}>Clear</Button>
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <InboxIcon className="h-5 w-5 text-primary" />
              Inbox ({total})
              {unreadCount > 0 && <Badge variant="destructive" className="text-xs">{unreadCount} new</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No messages yet. Connect a Telegram channel and add keywords to start receiving messages.
              </p>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-start justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${msg.is_unread ? "border-primary/30 bg-primary/5" : "border-border"}`}
                    onClick={() => handleOpen(msg)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {msg.is_unread && <div className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                        <span className="text-xs font-medium text-muted-foreground">{msg.sender_name || "Unknown"}</span>
                        <Badge variant="secondary" className="text-xs">{msg.channel_type}</Badge>
                        <span className="text-xs text-muted-foreground">{msg.source_name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{format(new Date(msg.message_timestamp), "MMM d, HH:mm")}</span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-1">{msg.message_content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {msg.matched_keywords?.length > 0 && msg.matched_keywords.map((kw: string) => (
                          <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
                        ))}
                        <Badge variant={priorityColor(msg.priority)} className="text-xs">{msg.priority}</Badge>
                        {msg.intent_score > 0 && <Badge variant="outline" className="text-xs">Intent: {Math.round(Number(msg.intent_score) * 100)}%</Badge>}
                        <IntentBadge
                          intentType={(msg as any).intent_type}
                          urgencyLevel={(msg as any).urgency_level}
                          recommendedAction={(msg as any).recommended_action}
                          compact
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Pagination */}
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

        {/* Message Detail */}
        <Dialog open={!!selectedMsg} onOpenChange={() => setSelectedMsg(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Message Details</DialogTitle></DialogHeader>
            {selectedMsg && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Sender</p>
                    <p className="text-sm text-foreground">{selectedMsg.sender_name || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Channel</p>
                    <p className="text-sm text-foreground">{selectedMsg.source_name} ({selectedMsg.channel_type})</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Date</p>
                    <p className="text-sm text-foreground">{format(new Date(selectedMsg.message_timestamp), "PPpp")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Intent Score</p>
                    <p className="text-sm text-foreground">{Math.round(Number(selectedMsg.intent_score) * 100)}%</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Message</p>
                  <p className="text-sm text-foreground rounded-lg bg-muted p-3">{selectedMsg.message_content}</p>
                </div>
                {selectedMsg.matched_keywords?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Matched Keywords</p>
                    <div className="flex gap-1">{selectedMsg.matched_keywords.map((kw: string) => <Badge key={kw} variant="secondary">{kw}</Badge>)}</div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { updateStatus.mutate({ id: selectedMsg.id, status: "reviewed" }); setSelectedMsg({ ...selectedMsg, status: "reviewed" }); }}>Mark Reviewed</Button>
                  <Button size="sm" variant="outline" onClick={() => { updatePriority.mutate({ id: selectedMsg.id, priority: selectedMsg.priority === "high" ? "normal" : "high" }); setSelectedMsg({ ...selectedMsg, priority: selectedMsg.priority === "high" ? "normal" : "high" }); }}>
                    <Star className="h-3 w-3 mr-1" />{selectedMsg.priority === "high" ? "Unmark Priority" : "Mark Priority"}
                  </Button>
                  {selectedMsg.lead_id && (
                    <Button size="sm" onClick={() => { setSelectedMsg(null); navigate(`/reply-workspace?leadId=${selectedMsg.lead_id}`); }}>
                      <MessageSquare className="h-3 w-3 mr-1" /> AI Reply
                    </Button>
                  )}
                </div>
                <CustomerIntelligenceProfile
                  contactIdentifier={selectedMsg.sender_identifier || selectedMsg.sender_name}
                  contactName={selectedMsg.sender_name}
                />
                <AIContextPanel
                  contactIdentifier={selectedMsg.sender_name || selectedMsg.sender_identifier}
                  contactName={selectedMsg.sender_name}
                  leadId={selectedMsg.lead_id}
                  channelType={selectedMsg.channel_type}
                  latestMessage={selectedMsg.message_content}
                />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Inbox;
