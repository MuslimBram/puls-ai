import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCallRecords, CallRecord } from "@/hooks/useCallRecords";
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Plus, Clock, ChevronLeft, ChevronRight,
  Bot, FileText, ArrowUpRight,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const outcomeColors: Record<string, string> = {
  interested: "bg-green-500/10 text-green-700",
  not_interested: "bg-destructive/10 text-destructive",
  follow_up: "bg-yellow-500/10 text-yellow-700",
  won: "bg-primary/10 text-primary",
  lost: "bg-destructive/10 text-destructive",
  no_answer: "bg-muted text-muted-foreground",
  voicemail: "bg-secondary text-secondary-foreground",
};

const DirectionIcon = ({ dir }: { dir: string }) => {
  if (dir === "inbound") return <PhoneIncoming className="h-4 w-4 text-primary" />;
  return <PhoneOutgoing className="h-4 w-4 text-accent-foreground" />;
};

const CallHistory = () => {
  const {
    calls, total, isLoading, addCall, updateCall,
    page, pageSize, nextPage, prevPage,
    directionFilter, setDirectionFilter,
    statusFilter, setStatusFilter,
  } = useCallRecords();

  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCall, setNewCall] = useState({
    contact_name: "", contact_phone: "", call_direction: "outbound",
    call_status: "completed", call_outcome: "no_answer", call_duration: 0, notes: "",
  });

  const handleAddCall = () => {
    addCall.mutate(newCall as any);
    setShowAdd(false);
    setNewCall({ contact_name: "", contact_phone: "", call_direction: "outbound", call_status: "completed", call_outcome: "no_answer", call_duration: 0, notes: "" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Call History</h1>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Log Call</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log a Call</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Contact Name</Label><Input value={newCall.contact_name} onChange={(e) => setNewCall({ ...newCall, contact_name: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={newCall.contact_phone} onChange={(e) => setNewCall({ ...newCall, contact_phone: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Direction</Label>
                    <Select value={newCall.call_direction} onValueChange={(v) => setNewCall({ ...newCall, call_direction: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inbound">Inbound</SelectItem>
                        <SelectItem value="outbound">Outbound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Outcome</Label>
                    <Select value={newCall.call_outcome} onValueChange={(v) => setNewCall({ ...newCall, call_outcome: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interested">Interested</SelectItem>
                        <SelectItem value="not_interested">Not Interested</SelectItem>
                        <SelectItem value="follow_up">Follow Up</SelectItem>
                        <SelectItem value="won">Won</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                        <SelectItem value="no_answer">No Answer</SelectItem>
                        <SelectItem value="voicemail">Voicemail</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Duration (seconds)</Label><Input type="number" value={newCall.call_duration} onChange={(e) => setNewCall({ ...newCall, call_duration: Number(e.target.value) })} /></div>
                <div><Label>Notes</Label><Textarea value={newCall.notes} onChange={(e) => setNewCall({ ...newCall, notes: e.target.value })} /></div>
                <Button onClick={handleAddCall} className="w-full">Save Call</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Direction" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Directions</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
              <SelectItem value="ringing">Ringing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Call List */}
          <div className="lg:col-span-2 space-y-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
            ) : calls.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No call records yet. Log your first call.</CardContent></Card>
            ) : (
              calls.map((call) => (
                <Card
                  key={call.id}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedCall?.id === call.id ? "ring-1 ring-primary" : ""}`}
                  onClick={() => setSelectedCall(call)}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <DirectionIcon dir={call.call_direction} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{call.contact_name || call.contact_phone || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{call.contact_phone}</p>
                    </div>
                    <Badge className={`text-xs ${outcomeColors[call.call_outcome] || "bg-muted text-muted-foreground"}`}>
                      {call.call_outcome.replace("_", " ")}
                    </Badge>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{format(parseISO(call.created_at), "MMM d, HH:mm")}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {Math.floor(call.call_duration / 60)}:{String(call.call_duration % 60).padStart(2, "0")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            {total > pageSize && (
              <div className="flex items-center justify-between pt-2">
                <Button size="sm" variant="outline" onClick={prevPage} disabled={page === 0}>
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / pageSize)}</span>
                <Button size="sm" variant="outline" onClick={nextPage} disabled={(page + 1) * pageSize >= total}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Call Detail */}
          <div>
            {selectedCall ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DirectionIcon dir={selectedCall.call_direction} />
                    {selectedCall.contact_name || "Call Details"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Phone:</span><p className="font-medium text-foreground">{selectedCall.contact_phone || "—"}</p></div>
                    <div><span className="text-muted-foreground">Provider:</span><p className="font-medium text-foreground capitalize">{selectedCall.channel_provider}</p></div>
                    <div><span className="text-muted-foreground">Duration:</span><p className="font-medium text-foreground">{Math.floor(selectedCall.call_duration / 60)}m {selectedCall.call_duration % 60}s</p></div>
                    <div><span className="text-muted-foreground">Outcome:</span><Badge className={outcomeColors[selectedCall.call_outcome] || ""}>{selectedCall.call_outcome.replace("_", " ")}</Badge></div>
                  </div>

                  {selectedCall.notes && (
                    <div><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm text-foreground">{selectedCall.notes}</p></div>
                  )}

                  {/* AI Placeholders */}
                  <div className="space-y-2 border-t border-border pt-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Bot className="h-3.5 w-3.5" /> AI Transcription
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      {selectedCall.ai_transcription || "Transcription will appear here when VoIP integration is active."}
                    </p>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" /> AI Call Summary
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      {selectedCall.ai_call_summary || "AI summary will be generated after transcription."}
                    </p>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ArrowUpRight className="h-3.5 w-3.5" /> Follow-up Recommendation
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      {selectedCall.follow_up_recommendation || "AI follow-up suggestions will appear here."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Select a call to view details</CardContent></Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CallHistory;
