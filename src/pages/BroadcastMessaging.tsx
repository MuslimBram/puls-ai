import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBroadcasts, useContactSegments, type Broadcast } from "@/hooks/useBroadcasts";
import { computeSpamScore, CHANNEL_LIMITS, useApproveBroadcast } from "@/hooks/useBroadcastCompliance";
import { ComplianceDashboard } from "@/components/ComplianceDashboard";
import {
  Send,
  Plus,
  Trash2,
  Eye,
  Loader2,
  Calendar,
  BarChart3,
  Users,
  Mail,
  MessageSquare,
  Clock,
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/10 text-blue-700",
  sending: "bg-yellow-500/10 text-yellow-700",
  completed: "bg-green-500/10 text-green-700",
  paused: "bg-orange-500/10 text-orange-700",
  failed: "bg-destructive/10 text-destructive",
};

const APPROVAL_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700",
  approved: "bg-green-500/10 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
};

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email", icon: Mail },
  { value: "telegram", label: "Telegram", icon: MessageSquare },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { value: "sms", label: "SMS", icon: MessageSquare },
];

const BroadcastMessaging = () => {
  const { broadcasts, isLoading, createBroadcast, updateBroadcast, deleteBroadcast } = useBroadcasts();
  const { segments } = useContactSegments();
  const [showCreate, setShowCreate] = useState(false);
  const [viewingBroadcast, setViewingBroadcast] = useState<Broadcast | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Broadcast Messaging</h1>
            <p className="text-sm text-muted-foreground">Send campaigns to contact segments across channels</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Broadcast
          </Button>
        </div>

        <Tabs defaultValue="broadcasts">
          <TabsList>
            <TabsTrigger value="broadcasts">Broadcasts</TabsTrigger>
            <TabsTrigger value="compliance">Compliance & Reputation</TabsTrigger>
          </TabsList>

          <TabsContent value="compliance">
            <ComplianceDashboard />
          </TabsContent>

          <TabsContent value="broadcasts">
        <div className="flex items-center justify-between hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Broadcast Messaging</h1>
            <p className="text-sm text-muted-foreground">Send campaigns to contact segments across channels</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Broadcast
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Send className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{broadcasts.length}</p>
                <p className="text-xs text-muted-foreground">Total Broadcasts</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                <BarChart3 className="h-4 w-4 text-green-700" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {broadcasts.reduce((sum, b) => sum + (b.sent_count || 0), 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total Sent</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Users className="h-4 w-4 text-blue-700" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{segments.length}</p>
                <p className="text-xs text-muted-foreground">Segments</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10">
                <Clock className="h-4 w-4 text-yellow-700" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {broadcasts.filter((b) => b.status === "scheduled").length}
                </p>
                <p className="text-xs text-muted-foreground">Scheduled</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Broadcasts List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : broadcasts.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Send className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-foreground mb-2">No broadcasts yet</p>
              <p className="text-sm text-muted-foreground mb-4">Send your first campaign message to a contact segment</p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create Broadcast
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {broadcasts.map((broadcast) => {
              const deliveryRate = broadcast.total_recipients
                ? Math.round((broadcast.delivered_count / broadcast.total_recipients) * 100)
                : 0;

              return (
                <Card key={broadcast.id} className="hover:border-primary/20 transition-colors">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Send className="h-4 w-4 text-primary shrink-0" />
                        <h3 className="font-medium text-foreground truncate">{broadcast.name}</h3>
                        <Badge className={`text-xs ${STATUS_COLORS[broadcast.status] || ""}`}>{broadcast.status}</Badge>
                        <Badge variant="secondary" className="text-xs">{broadcast.channel_type}</Badge>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{broadcast.total_recipients} recipients</span>
                        <span>{broadcast.sent_count} sent</span>
                        <span>{broadcast.opened_count} opened</span>
                        {broadcast.scheduled_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(broadcast.scheduled_at), "PP p")}
                          </span>
                        )}
                      </div>
                      {broadcast.total_recipients > 0 && (
                        <Progress value={deliveryRate} className="mt-2 h-1.5" />
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => setViewingBroadcast(broadcast)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteBroadcast.mutate(broadcast.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create Dialog */}
        {showCreate && (
          <CreateBroadcastDialog
            segments={segments}
            onClose={() => setShowCreate(false)}
            onCreate={(data) => {
              createBroadcast.mutate(data);
              setShowCreate(false);
            }}
          />
        )}

        {/* View Dialog */}
        {viewingBroadcast && (
          <BroadcastDetailDialog broadcast={viewingBroadcast} onClose={() => setViewingBroadcast(null)} />
        )}

          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

const CreateBroadcastDialog = ({
  segments,
  onClose,
  onCreate,
}: {
  segments: any[];
  onClose: () => void;
  onCreate: (data: Partial<Broadcast>) => void;
}) => {
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState("email");
  const [subject, setSubject] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [throttle, setThrottle] = useState("60");

  const spamScore = computeSpamScore(messageContent, subject);
  const channelLimit = CHANNEL_LIMITS[channelType] || CHANNEL_LIMITS.email;
  const effectiveThrottle = Math.min(Number(throttle) || 60, channelLimit.maxPerMinute);
  const needsApproval = channelLimit.requiresApproval;
  const hasUnsubscribeText = messageContent.toLowerCase().includes("unsubscribe") || messageContent.toLowerCase().includes("opt-out") || messageContent.toLowerCase().includes("opt out");

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Broadcast</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Broadcast Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring Sale Announcement" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Channel</Label>
              <Select value={channelType} onValueChange={setChannelType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Segment</Label>
              <Select value={segmentId} onValueChange={setSegmentId}>
                <SelectTrigger><SelectValue placeholder="Select segment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Contacts</SelectItem>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {channelType === "email" && (
            <div>
              <Label>Subject Line</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Don't miss our spring sale!" />
            </div>
          )}
          <div>
            <Label>Message</Label>
            <Textarea value={messageContent} onChange={(e) => setMessageContent(e.target.value)} placeholder="Your broadcast message..." rows={4} />
          </div>

          {/* Compliance indicators */}
          {messageContent.length > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Compliance Check</p>
              <div className="flex flex-wrap gap-2">
                <Badge className={spamScore <= 20 ? "bg-green-500/10 text-green-700" : spamScore <= 50 ? "bg-yellow-500/10 text-yellow-700" : "bg-destructive/10 text-destructive"}>
                  {spamScore <= 20 ? <ShieldCheck className="h-3 w-3 mr-1" /> : <ShieldAlert className="h-3 w-3 mr-1" />}
                  Spam Score: {spamScore}/100
                </Badge>
                <Badge className={hasUnsubscribeText ? "bg-green-500/10 text-green-700" : "bg-yellow-500/10 text-yellow-700"}>
                  {hasUnsubscribeText ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                  {hasUnsubscribeText ? "Opt-out included" : "No opt-out text"}
                </Badge>
                {needsApproval && (
                  <Badge className="bg-yellow-500/10 text-yellow-700">
                    <ShieldAlert className="h-3 w-3 mr-1" /> Requires approval
                  </Badge>
                )}
              </div>
              {spamScore > 50 && (
                <p className="text-xs text-destructive">⚠ High spam score. Consider removing promotional language and excessive caps.</p>
              )}
              {!hasUnsubscribeText && channelType === "email" && (
                <p className="text-xs text-yellow-700">⚠ Include opt-out/unsubscribe text for email compliance.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Schedule (optional)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <div>
              <Label>Throttle (max {channelLimit.maxPerMinute}/min)</Label>
              <Input type="number" value={throttle} onChange={(e) => setThrottle(e.target.value)} max={channelLimit.maxPerMinute} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name.trim() || !messageContent.trim() || spamScore > 80}
            onClick={() => {
              if (spamScore > 50 && !hasUnsubscribeText && channelType === "email") {
                toast.warning("Consider adding opt-out text before sending.");
              }
              onCreate({
                name,
                channel_type: channelType,
                subject: subject || null,
                message_content: messageContent,
                segment_id: segmentId && segmentId !== "all" ? segmentId : null,
                scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
                throttle_per_minute: effectiveThrottle,
                status: needsApproval ? "draft" : (scheduledAt ? "scheduled" : "draft"),
              });
            }}
          >
            {needsApproval ? "Submit for Approval" : scheduledAt ? "Schedule" : "Create Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const BroadcastDetailDialog = ({ broadcast, onClose }: { broadcast: Broadcast; onClose: () => void }) => {
  const openRate = broadcast.sent_count ? Math.round((broadcast.opened_count / broadcast.sent_count) * 100) : 0;
  const clickRate = broadcast.opened_count ? Math.round((broadcast.clicked_count / broadcast.opened_count) * 100) : 0;
  const responseRate = broadcast.sent_count ? Math.round((broadcast.response_count / broadcast.sent_count) * 100) : 0;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {broadcast.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{broadcast.sent_count}</p>
              <p className="text-xs text-muted-foreground">Sent</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{broadcast.delivered_count}</p>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{openRate}%</p>
              <p className="text-xs text-muted-foreground">Open Rate</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{clickRate}%</p>
              <p className="text-xs text-muted-foreground">Click Rate</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{responseRate}%</p>
              <p className="text-xs text-muted-foreground">Response Rate</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{broadcast.failed_count}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>

          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Message</p>
            <p className="text-sm text-foreground">{broadcast.message_content}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BroadcastMessaging;
