import { useTr } from "@/lib/uiSq";
import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMyTickets, useSubmitTicket, useTicketMessages, useReplyTicket } from "@/hooks/useSupportTickets";
import { LifeBuoy, Plus, Send } from "lucide-react";

const statusColor = (s: string) => ({
  open: "default", pending: "secondary", resolved: "outline", closed: "outline",
}[s] ?? "default") as any;

export default function SupportTickets() {
  const tr = useTr();
  const { data: tickets = [], isLoading } = useMyTickets();
  const submit = useSubmitTicket();
  const reply = useReplyTicket();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: "", description: "", category: "general", priority: "normal" });
  const [replyBody, setReplyBody] = useState("");

  const { data: messages = [] } = useTicketMessages(selected);

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.description.trim()) return;
    await submit.mutateAsync(form);
    setForm({ subject: "", description: "", category: "general", priority: "normal" });
    setOpen(false);
  };

  const handleReply = async () => {
    if (!selected || !replyBody.trim()) return;
    await reply.mutateAsync({ ticket_id: selected, body: replyBody, sender_role: "user" });
    setReplyBody("");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><LifeBuoy className="h-6 w-6" /> {tr("Support Tickets")}</h1>
            <p className="text-muted-foreground">{tr("Get help from the support team.")}</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> {tr("New Ticket")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{tr("Create Support Ticket")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{tr("Subject")}</Label>
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{tr("Category")}</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">{tr("General")}</SelectItem>
                        <SelectItem value="billing">{tr("Billing")}</SelectItem>
                        <SelectItem value="technical">{tr("Technical")}</SelectItem>
                        <SelectItem value="bug">{tr("Bug Report")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{tr("Priority")}</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">{tr("Normal")}</SelectItem>
                        <SelectItem value="high">{tr("High")}</SelectItem>
                        <SelectItem value="urgent">{tr("Urgent")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>{tr("Description")}</Label>
                  <Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <Button onClick={handleSubmit} disabled={submit.isPending} className="w-full">
                  {submit.isPending ? "Submitting..." : "Submit Ticket"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>{tr("My Tickets")}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!isLoading && tickets.length === 0 && (
                <p className="text-sm text-muted-foreground">{tr("No tickets yet.")}</p>
              )}
              {tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`w-full text-left rounded-md border p-3 hover:bg-muted ${selected === t.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{t.subject}</span>
                    <Badge variant={statusColor(t.status)}>{t.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.category} • {t.priority} • {new Date(t.updated_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>{selected ? "Conversation" : tr("Select a ticket")}</CardTitle></CardHeader>
            <CardContent>
              {!selected && <p className="text-sm text-muted-foreground">{tr("Choose a ticket from the left to view messages.")}</p>}
              {selected && (
                <div className="space-y-3">
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-md p-3 text-sm ${m.sender_role === "admin" ? "bg-primary/10" : "bg-muted"}`}
                      >
                        <div className="text-xs text-muted-foreground mb-1">
                          {m.sender_role === "admin" ? "Support Agent" : "You"} • {new Date(m.created_at).toLocaleString()}
                        </div>
                        <div className="whitespace-pre-wrap">{m.body}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea rows={2} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Reply..." />
                    <Button aria-label={tr("Send")} onClick={handleReply} disabled={!replyBody.trim() || reply.isPending}>
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
