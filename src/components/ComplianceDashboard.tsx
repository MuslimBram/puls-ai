import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useSuppressionList,
  useAddSuppression,
  useRemoveSuppression,
  useSendingReputation,
  useSendQueueStats,
  reputationColor,
  reputationLabel,
} from "@/hooks/useSendingCompliance";
import { useOptouts, useApproveBroadcast, computeSpamScore, CHANNEL_LIMITS } from "@/hooks/useBroadcastCompliance";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ShieldCheck,
  ShieldAlert,
  Ban,
  Plus,
  Trash2,
  BarChart3,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileCheck,
} from "lucide-react";
import { format } from "date-fns";

export const ComplianceDashboard = () => {
  const { suppressions, isLoading: loadingSuppressions } = useSuppressionList();
  const { optouts, isLoading: loadingOptouts } = useOptouts();
  const { reputation, isLoading: loadingRep } = useSendingReputation();
  const addSuppression = useAddSuppression();
  const removeSuppression = useRemoveSuppression();
  const [showAdd, setShowAdd] = useState(false);

  const totalSuppressed = suppressions.length + optouts.length;
  const avgReputation = reputation.length > 0
    ? Math.round(reputation.reduce((s, r) => s + Number(r.reputation_score), 0) / reputation.length)
    : 100;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{avgReputation}</p>
              <p className="text-xs text-muted-foreground">Avg Reputation</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
              <Ban className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{totalSuppressed}</p>
              <p className="text-xs text-muted-foreground">Suppressed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-700" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">
                {suppressions.filter(s => s.suppression_type === "bounce").length}
              </p>
              <p className="text-xs text-muted-foreground">Bounces</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <BarChart3 className="h-4 w-4 text-blue-700" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{reputation.length}</p>
              <p className="text-xs text-muted-foreground">Channels Tracked</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="reputation">
        <TabsList>
          <TabsTrigger value="reputation">Reputation</TabsTrigger>
          <TabsTrigger value="approvals">Template Approvals</TabsTrigger>
          <TabsTrigger value="suppressions">Suppression List ({suppressions.length})</TabsTrigger>
          <TabsTrigger value="optouts">Opt-outs ({optouts.length})</TabsTrigger>
          <TabsTrigger value="rules">Sending Rules</TabsTrigger>
        </TabsList>

        {/* Reputation Tab */}
        <TabsContent value="reputation">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sending Reputation by Channel</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRep ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : reputation.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sending data yet. Reputation will be tracked once broadcasts are sent.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Bounced</TableHead>
                      <TableHead>Complaints</TableHead>
                      <TableHead>Unsubs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reputation.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium capitalize">{r.channel_type}</TableCell>
                        <TableCell>
                          <span className={`font-bold ${reputationColor(Number(r.reputation_score))}`}>
                            {Number(r.reputation_score).toFixed(0)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({reputationLabel(Number(r.reputation_score))})
                          </span>
                        </TableCell>
                        <TableCell>{r.total_sent}</TableCell>
                        <TableCell>{r.total_bounced}</TableCell>
                        <TableCell>{r.total_complained}</TableCell>
                        <TableCell>{r.total_unsubscribed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suppression List Tab */}
        <TabsContent value="suppressions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Global Suppression List</CardTitle>
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent>
              {loadingSuppressions ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : suppressions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No suppressed contacts.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppressions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.contact_identifier}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{s.channel_type}</Badge></TableCell>
                        <TableCell>
                          <Badge className={
                            s.suppression_type === "bounce" ? "bg-destructive/10 text-destructive" :
                            s.suppression_type === "complaint" ? "bg-yellow-500/10 text-yellow-700" :
                            "bg-muted text-muted-foreground"
                          }>
                            {s.suppression_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.reason || "—"}</TableCell>
                        <TableCell className="text-xs">{format(new Date(s.suppressed_at), "PP")}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="text-destructive h-7"
                            onClick={() => removeSuppression.mutate(s.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opt-outs Tab */}
        <TabsContent value="optouts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Broadcast Opt-outs</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingOptouts ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : optouts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No opt-outs recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {optouts.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">{o.contact_identifier}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{o.channel_type}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{o.reason || "—"}</TableCell>
                        <TableCell className="text-xs">{format(new Date(o.opted_out_at), "PP")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Suppression Dialog */}
      {showAdd && (
        <AddSuppressionDialog
          onClose={() => setShowAdd(false)}
          onAdd={(data) => {
            addSuppression.mutate(data);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
};

const AddSuppressionDialog = ({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (data: { contact_identifier: string; channel_type: string; suppression_type: string; reason?: string }) => void;
}) => {
  const [contact, setContact] = useState("");
  const [channel, setChannel] = useState("all");
  const [type, setType] = useState("manual");
  const [reason, setReason] = useState("");

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add to Suppression List</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Contact (email / phone)</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="user@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="bounce">Bounce</SelectItem>
                  <SelectItem value="complaint">Complaint</SelectItem>
                  <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer requested removal" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!contact.trim()} onClick={() => onAdd({ contact_identifier: contact, channel_type: channel, suppression_type: type, reason })}>
            Suppress Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
