import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useDialerCampaigns, DialerCampaign } from "@/hooks/useDialerCampaigns";
import {
  Plus, Play, Pause, Phone, Users, Target, BarChart3,
  CheckCircle2, XCircle, Clock, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  running: "bg-green-500/10 text-green-600",
  paused: "bg-yellow-500/10 text-yellow-600",
  completed: "bg-primary/10 text-primary",
};

export const DialerCampaignPanel = () => {
  const { campaigns, isLoading, createCampaign, addContacts, startCampaign, pauseCampaign } = useDialerCampaigns();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddContacts, setShowAddContacts] = useState(false);
  const [contactsCsv, setContactsCsv] = useState("");
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    description: "",
    dialer_mode: "preview",
    caller_id: "",
    script: "",
    max_attempts: 3,
    pacing_ratio: 1.0,
  });

  const selected = campaigns.find((c) => c.id === selectedId);

  const handleCreate = () => {
    if (!newCampaign.name.trim()) return;
    createCampaign.mutate(newCampaign);
    setShowCreate(false);
    setNewCampaign({ name: "", description: "", dialer_mode: "preview", caller_id: "", script: "", max_attempts: 3, pacing_ratio: 1.0 });
  };

  const handleAddContacts = () => {
    if (!selectedId || !contactsCsv.trim()) return;
    const lines = contactsCsv.trim().split("\n").filter(Boolean);
    const contacts = lines.map((line) => {
      const [phone_number, contact_name] = line.split(",").map((s) => s.trim());
      return { phone_number, contact_name };
    });
    addContacts.mutate({ campaignId: selectedId, contacts });
    setShowAddContacts(false);
    setContactsCsv("");
  };

  const getProgress = (c: DialerCampaign) => {
    if (c.total_contacts === 0) return 0;
    return Math.round((c.contacted / c.total_contacts) * 100);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Phone className="h-4 w-4" /> Dialer Campaigns
        </h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create Dialer Campaign</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Campaign Name</Label><Input value={newCampaign.name} onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })} placeholder="e.g. Q1 Outreach" /></div>
              <div><Label>Description</Label><Textarea value={newCampaign.description} onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Dialer Mode</Label>
                  <Select value={newCampaign.dialer_mode} onValueChange={(v) => setNewCampaign({ ...newCampaign, dialer_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preview">Preview</SelectItem>
                      <SelectItem value="progressive">Progressive</SelectItem>
                      <SelectItem value="predictive">Predictive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Max Attempts</Label>
                  <Input type="number" value={newCampaign.max_attempts} onChange={(e) => setNewCampaign({ ...newCampaign, max_attempts: Number(e.target.value) })} />
                </div>
              </div>
              <div><Label>Caller ID</Label><Input value={newCampaign.caller_id} onChange={(e) => setNewCampaign({ ...newCampaign, caller_id: e.target.value })} placeholder="+1234567890" /></div>
              <div><Label>Agent Script</Label><Textarea value={newCampaign.script} onChange={(e) => setNewCampaign({ ...newCampaign, script: e.target.value })} placeholder="Hi, this is [name] from [company]..." /></div>
              <Button onClick={handleCreate} className="w-full">Create Campaign</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
      ) : campaigns.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No dialer campaigns yet. Create one to start outbound calling.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              className={cn("cursor-pointer transition-colors hover:bg-muted/50",
                selectedId === campaign.id && "ring-1 ring-primary"
              )}
              onClick={() => setSelectedId(campaign.id === selectedId ? null : campaign.id)}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{campaign.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{campaign.dialer_mode} dialer</p>
                  </div>
                  <Badge className={cn("text-[10px]", statusColors[campaign.status])}>
                    {campaign.status}
                  </Badge>
                </div>
                <Progress value={getProgress(campaign)} className="h-1.5" />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5"><Users className="h-3 w-3" /> {campaign.total_contacts} contacts</span>
                  <span className="flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> {campaign.answered} answered</span>
                  <span className="flex items-center gap-0.5"><XCircle className="h-3 w-3" /> {campaign.no_answer} no answer</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Selected campaign actions */}
      {selected && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{selected.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selected.script && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">Agent Script</p>
                <div className="rounded-md bg-muted/50 p-2 text-xs text-foreground whitespace-pre-wrap">
                  {selected.script}
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-border p-2 text-center">
                <p className="text-sm font-bold text-foreground">{selected.contacted}</p>
                <p className="text-[10px] text-muted-foreground">Contacted</p>
              </div>
              <div className="rounded-md border border-border p-2 text-center">
                <p className="text-sm font-bold text-foreground">{selected.busy}</p>
                <p className="text-[10px] text-muted-foreground">Busy</p>
              </div>
              <div className="rounded-md border border-border p-2 text-center">
                <p className="text-sm font-bold text-foreground">{selected.failed}</p>
                <p className="text-[10px] text-muted-foreground">Failed</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {selected.status === "draft" || selected.status === "paused" ? (
                <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => startCampaign.mutate(selected.id)}>
                  <Play className="h-3 w-3 mr-1" /> Start
                </Button>
              ) : selected.status === "running" ? (
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => pauseCampaign.mutate(selected.id)}>
                  <Pause className="h-3 w-3 mr-1" /> Pause
                </Button>
              ) : null}
              <Dialog open={showAddContacts} onOpenChange={setShowAddContacts}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <Upload className="h-3 w-3 mr-1" /> Add Contacts
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Contacts</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Paste contacts (one per line: phone,name)</Label>
                      <Textarea
                        value={contactsCsv}
                        onChange={(e) => setContactsCsv(e.target.value)}
                        placeholder={"+1234567890, John Doe\n+0987654321, Jane Smith"}
                        rows={8}
                      />
                    </div>
                    <Button onClick={handleAddContacts} className="w-full">Import Contacts</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
