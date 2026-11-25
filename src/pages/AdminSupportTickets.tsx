import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAllTickets, useTicketMessages, useReplyTicket, useUpdateTicketStatus } from "@/hooks/useSupportTickets";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LifeBuoy, Send } from "lucide-react";

const statusColor = (s: string) => ({
  open: "default", pending: "secondary", resolved: "outline", closed: "outline",
}[s] ?? "default") as any;

export default function AdminSupportTickets() {
  const { data: tickets = [], isLoading } = useAllTickets();
  const reply = useReplyTicket();
  const updateStatus = useUpdateTicketStatus();

  const [selected, setSelected] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [filter, setFilter] = useState("all");

  const { data: messages = [] } = useTicketMessages(selected);
  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);
  const current = tickets.find((t) => t.id === selected);

  const handleReply = async () => {
    if (!selected || !replyBody.trim()) return;
    await reply.mutateAsync({
      ticket_id: selected,
      body: replyBody,
      sender_role: "admin",
      internal_note: internal,
    });
    setReplyBody("");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><LifeBuoy className="h-6 w-6" /> Admin Support Inbox</h1>
            <p className="text-muted-foreground">All user support tickets</p>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>Tickets ({filtered.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`w-full text-left rounded-md border p-3 hover:bg-muted ${selected === t.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{t.subject}</span>
                    <Badge variant={statusColor(t.status)}>{t.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {t.requester_email} • {t.priority} • {new Date(t.updated_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{current ? current.subject : "Select a ticket"}</span>
                {current && (
                  <Select
                    value={current.status}
                    onValueChange={(v) => updateStatus.mutate({ id: current.id, status: v })}
                  >
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!current && <p className="text-sm text-muted-foreground">Choose a ticket on the left.</p>}
              {current && (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    From: {current.requester_email} • Category: {current.category} • Priority: {current.priority}
                  </div>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-md p-3 text-sm ${
                          m.internal_note ? "bg-yellow-500/10 border border-yellow-500/30" :
                          m.sender_role === "admin" ? "bg-primary/10" : "bg-muted"
                        }`}
                      >
                        <div className="text-xs text-muted-foreground mb-1 flex justify-between">
                          <span>{m.sender_role === "admin" ? "Support" : "User"} • {new Date(m.created_at).toLocaleString()}</span>
                          {m.internal_note && <span className="font-semibold">Internal note</span>}
                        </div>
                        <div className="whitespace-pre-wrap">{m.body}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="internal" checked={internal} onCheckedChange={setInternal} />
                    <Label htmlFor="internal" className="text-xs">Internal note (only visible to admins)</Label>
                  </div>
                  <div className="flex gap-2">
                    <Textarea rows={3} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Reply..." />
                    <Button aria-label="Send" onClick={handleReply} disabled={!replyBody.trim() || reply.isPending}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
