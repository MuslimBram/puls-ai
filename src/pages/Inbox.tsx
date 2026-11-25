import { useTr } from "@/lib/uiSq";
import { useState, useEffect } from "react";
import { InboxEmptyState } from "@/components/EmptyState";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInbox, InboxFilters } from "@/hooks/useInbox";
import { useLeads } from "@/hooks/useLeads";
import { AIContextPanel } from "@/components/AIContextPanel";
import { CustomerIntelligenceProfile } from "@/components/CustomerIntelligenceProfile";
import { Inbox as InboxIcon, Search, Star, MessageSquare, ChevronLeft, ChevronRight, Send, Loader2 } from "lucide-react";
import { IntentBadge, INTENT_TYPE_OPTIONS } from "@/components/IntentBadge";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { CoachTour } from "@/components/CoachTour";
import { useSendMessage } from "@/hooks/useSendMessage";

const Inbox = () => {
  const tr = useTr();
  const [filters, setFilters] = useState<InboxFilters>({});
  const [selectedMsg, setSelectedMsg] = useState<any>(null);
  const [selectedThreadMessages, setSelectedThreadMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  const { messages, conversations, total, isLoading, markThreadRead, updateStatus, updatePriority, subscribeRealtime, page, pageSize, nextPage, prevPage, setPage } = useInbox(filters);
  const { updateStatus: updateLeadStatus } = useLeads();
  const sendMessage = useSendMessage();
  const navigate = useNavigate();

  useEffect(() => {
    const channel = subscribeRealtime();
    return () => { channel.unsubscribe(); };
  }, []);

  const handleOpen = (conversation: any) => {
    setSelectedThreadMessages(conversation.messages);
    const replyAnchor = [...conversation.messages].reverse().find((message: any) => message.direction === "inbound")
      || conversation.latest;
    setSelectedMsg({
      ...replyAnchor,
      sender_identifier: conversation.contactIdentifier,
      sender_name: conversation.contactName,
    });
    if (conversation.unreadCount > 0 && conversation.id) {
      markThreadRead.mutate(conversation.id);
    }
  };

  const handleChannelReply = async () => {
    const message = replyText.trim();
    if (!selectedMsg || !message) return;

    if (selectedMsg.channel_type === "telegram") {
      const chatId = selectedMsg.metadata?.chat_id;
      if (!chatId) return;
      await sendMessage.mutateAsync({
        channel: "telegram",
        to: String(chatId),
        chat_id: String(chatId),
        message,
        reply_to_message_id: selectedMsg.provider_message_id || undefined,
      });
    } else if (selectedMsg.channel_type === "whatsapp") {
      const recipient = selectedMsg.sender_identifier;
      if (!recipient) return;
      await sendMessage.mutateAsync({
        channel: "whatsapp",
        to: String(recipient),
        message,
        type: "text",
      });
    } else {
      return;
    }

    setReplyText("");
  };

  const priorityColor = (p: string) => {
    if (p === "high") return "destructive" as const;
    if (p === "medium") return "secondary" as const;
    return "outline" as const;
  };


  const unreadCount = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const totalPages = Math.ceil(total / pageSize);

  const handleFilterChange = (fn: (f: InboxFilters) => InboxFilters) => {
    setPage(0);
    setFilters(fn);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Filters */}
        <Card data-tour="inbox-filters">
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder={tr(tr("Search messages..."))} className="w-48" value={filters.search ?? ""} onChange={(e) => handleFilterChange((f) => ({ ...f, search: e.target.value || undefined }))} />
            <Select value={filters.channelType ?? "all"} onValueChange={(v) => handleFilterChange((f) => ({ ...f, channelType: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-36"><SelectValue placeholder={tr("Channel")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr(tr("All channels"))}</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">{tr(tr("Email"))}</SelectItem>
                <SelectItem value="website_chat">{tr(tr("Website Chat"))}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.priority ?? "all"} onValueChange={(v) => handleFilterChange((f) => ({ ...f, priority: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-32"><SelectValue placeholder={tr("Priority")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="urgent">{tr("Urgent")}</SelectItem>
                <SelectItem value="high">{tr("High")}</SelectItem>
                <SelectItem value="normal">{tr("Normal")}</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.status ?? "all"} onValueChange={(v) => handleFilterChange((f) => ({ ...f, status: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-32"><SelectValue placeholder={tr("Status")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="in_progress">{tr("In Progress")}</SelectItem>
                <SelectItem value="waiting">{tr("Waiting")}</SelectItem>
                <SelectItem value="resolved">{tr("Resolved")}</SelectItem>
                <SelectItem value="closed">{tr("Closed")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => { setPage(0); setFilters({}); }}>{tr("Clear")}</Button>
          </CardContent>
        </Card>

        {/* Messages */}
        <Card data-tour="inbox-messages">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <InboxIcon className="h-5 w-5 text-primary" />
              Inbox ({conversations.length})
              {unreadCount > 0 && <Badge variant="destructive" className="text-xs">{unreadCount} new</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : messages.length === 0 ? (
              <InboxEmptyState />
            ) : (
              <div className="space-y-2">
                {conversations.map((conversation) => {
                  const msg = conversation.latest;
                  return (
                    <div
                      key={conversation.key}
                      className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 ${conversation.unreadCount > 0 ? "border-primary/30 bg-primary/5" : "border-border"}`}
                      onClick={() => handleOpen(conversation)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          {conversation.unreadCount > 0 && <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                          <span className="text-xs font-medium text-muted-foreground">{conversation.contactName || "Unknown"}</span>
                          <Badge variant="secondary" className="text-xs">{conversation.channelType}</Badge>
                          <span className="text-xs text-muted-foreground">{conversation.messages.length} messages</span>
                          <span className="ml-auto text-xs text-muted-foreground">{format(new Date(msg.message_timestamp), "MMM d, HH:mm")}</span>
                        </div>
                        <p className="line-clamp-1 text-sm text-foreground">
                          {msg.direction === "outbound" ? "You: " : ""}{msg.message_content}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant={priorityColor(msg.priority)} className="text-xs">{msg.priority}</Badge>
                          {conversation.unreadCount > 0 && <Badge variant="destructive" className="text-xs">{conversation.unreadCount} new</Badge>}
                        </div>
                      </div>
                    </div>
                  );
                })}

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
        <Dialog open={!!selectedMsg} onOpenChange={() => { setSelectedMsg(null); setSelectedThreadMessages([]); }}>
          <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-[calc(100vw-0.75rem)] flex-col overflow-hidden p-3 sm:max-w-2xl sm:p-5">
            <DialogHeader><DialogTitle>{tr(tr("Message Details"))}</DialogTitle></DialogHeader>
            {selectedMsg && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{tr("Sender")}</p>
                    <p className="text-sm text-foreground">{selectedMsg.sender_name || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{tr("Channel")}</p>
                    <p className="text-sm text-foreground">{selectedMsg.source_name} ({selectedMsg.channel_type})</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{tr("Date")}</p>
                    <p className="text-sm text-foreground">{format(new Date(selectedMsg.message_timestamp), "PPpp")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{tr(tr("Intent Score"))}</p>
                    <p className="text-sm text-foreground">{Math.round(Number(selectedMsg.intent_score) * 100)}%</p>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{tr(tr("Conversation"))}</p>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-2">
                    {selectedThreadMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${message.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                          <p>{message.message_content}</p>
                          <p className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {message.direction === "outbound" ? "You" : (message.sender_name || "Contact")} · {format(new Date(message.message_timestamp), "MMM d, HH:mm")}
                            {message.direction === "outbound" && message.delivery_status ? ` · ${message.delivery_status}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {(
                  (selectedMsg.channel_type === "telegram" && selectedMsg.metadata?.chat_id)
                  || (selectedMsg.channel_type === "whatsapp" && selectedMsg.sender_identifier)
                ) && (
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Reply on {selectedMsg.channel_type === "whatsapp" ? "WhatsApp" : "Telegram"}
                    </p>
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={tr(tr("Write a reply..."))}
                      rows={3}
                      maxLength={4096}
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={handleChannelReply}
                        disabled={!replyText.trim() || sendMessage.isPending}
                      >
                        {sendMessage.isPending
                          ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          : <Send className="mr-1 h-3.5 w-3.5" />}
                        Send Reply
                      </Button>
                    </div>
                  </div>
                )}
                {selectedMsg.matched_keywords?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{tr(tr("Matched Keywords"))}</p>
                    <div className="flex gap-1">{selectedMsg.matched_keywords.map((kw: string) => <Badge key={kw} variant="secondary">{kw}</Badge>)}</div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { updateStatus.mutate({ id: selectedMsg.id, threadId: selectedMsg.thread_id, status: "reviewed" }); setSelectedMsg({ ...selectedMsg, status: "reviewed" }); }}>{tr(tr("Mark Reviewed"))}</Button>
                  <Button size="sm" variant="outline" onClick={() => { updatePriority.mutate({ id: selectedMsg.id, threadId: selectedMsg.thread_id, priority: selectedMsg.priority === "high" ? "normal" : "high" }); setSelectedMsg({ ...selectedMsg, priority: selectedMsg.priority === "high" ? "normal" : "high" }); }}>
                    <Star className="h-3 w-3 mr-1" />{selectedMsg.priority === "high" ? "Unmark Priority" : tr("Mark Priority")}
                  </Button>
                  {selectedMsg.lead_id && (
                    <Button size="sm" onClick={() => { setSelectedMsg(null); navigate(`/reply-workspace?leadId=${selectedMsg.lead_id}`); }}>
                      <MessageSquare className="h-3 w-3 mr-1" /> AI Reply
                    </Button>
                  )}
                </div>
                <details className="max-h-[38dvh] shrink-0 overflow-y-auto rounded-lg border border-border">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                    {tr(tr("Customer intelligence & AI context"))}
                  </summary>
                  <div className="space-y-4 border-t border-border p-3">
                    <CustomerIntelligenceProfile
                      contactIdentifier={selectedMsg.sender_identifier || selectedMsg.sender_name}
                      contactName={selectedMsg.sender_name}
                    />
                    <AIContextPanel
                      contactIdentifier={selectedMsg.sender_name || selectedMsg.sender_identifier}
                      contactName={selectedMsg.sender_name}
                      leadId={selectedMsg.lead_id}
                      channelType={selectedMsg.channel_type}
                      latestMessage={selectedThreadMessages
                        .map((message) => `${message.direction === "outbound" ? "Business" : "Customer"}: ${message.message_content}`)
                        .join("\n")}
                    />
                  </div>
                </details>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <CoachTour
        tourId="inbox-v1"
        steps={[
          { selector: '[data-tour="inbox-filters"]', title: tr("Filter your inbox"), body: tr("Narrow messages by channel, priority and status — your view is saved as you change it.") },
          { selector: '[data-tour="inbox-messages"]', title: tr("All conversations in one place"), body: tr("WhatsApp, Telegram, Email and Web Chat unified here. Click any message to reply with AI assistance.") },
        ]}
      />
    </DashboardLayout>
  );
};

export default Inbox;