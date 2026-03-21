import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { THREAD_STATUSES, PRIORITY_LEVELS, type ConversationThread } from "@/hooks/useHelpdesk";
import { Headphones, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ThreadListProps {
  threads: ConversationThread[];
  total: number;
  isLoading: boolean;
  page: number;
  totalPages: number;
  onSelect: (thread: ConversationThread) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export const ThreadList = ({ threads, total, isLoading, page, totalPages, onSelect, onNextPage, onPrevPage }: ThreadListProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <Headphones className="h-5 w-5 text-primary" />
        Conversations ({total})
      </CardTitle>
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : threads.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No conversations yet. They will appear here as messages come in.
        </p>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => {
            const statusInfo = THREAD_STATUSES.find((s) => s.value === thread.status);
            const priorityInfo = PRIORITY_LEVELS.find((p) => p.value === thread.priority);
            const isOverdue = thread.sla_response_due && new Date(thread.sla_response_due) < new Date() && !thread.first_response_at;

            return (
              <div
                key={thread.id}
                className={`flex items-start justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${isOverdue ? "border-destructive/30 bg-destructive/5" : "border-border"}`}
                onClick={() => onSelect(thread)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground truncate">
                      {thread.subject || thread.contact_name || "Unnamed conversation"}
                    </span>
                    <Badge className={`text-xs ${statusInfo?.color ?? ""}`}>{statusInfo?.label}</Badge>
                    <Badge className={`text-xs ${priorityInfo?.color ?? ""}`}>{priorityInfo?.label}</Badge>
                    {isOverdue && <Badge variant="destructive" className="text-xs">SLA Overdue</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{thread.channel_type}</span>
                    {thread.contact_name && <span>{thread.contact_name}</span>}
                    <span>{thread.message_count} messages</span>
                    {thread.last_message_at && (
                      <span>{formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}</span>
                    )}
                  </div>
                  {thread.ai_summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{thread.ai_summary}</p>
                  )}
                </div>
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={onPrevPage} disabled={page === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={onNextPage} disabled={page + 1 >= totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </CardContent>
  </Card>
);
