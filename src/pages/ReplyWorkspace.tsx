import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useLeads } from "@/hooks/useLeads";
import { useReplyDrafts, useReplyTemplates, useGenerateReply } from "@/hooks/useReplyWorkspace";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { AIContextPanel } from "@/components/AIContextPanel";
import { Copy, RefreshCw, Star, Trash2, Plus, MessageSquare, Save } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "sales", label: "Sales" },
  { value: "custom", label: "Business Profile Tone" },
];

const ReplyWorkspace = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const leadId = searchParams.get("leadId") || undefined;
  const inboxMessageId = searchParams.get("messageId") || undefined;

  const { leads } = useLeads();
  const lead = useMemo(() => leads.find((l) => l.id === leadId), [leads, leadId]);
  const { profile } = useBusinessProfile();
  const { drafts, saveDraft, setPreferred, deleteDraft } = useReplyDrafts(leadId, inboxMessageId);
  const { templates, addTemplate, deleteTemplate } = useReplyTemplates();
  const generateReply = useGenerateReply();

  const [tone, setTone] = useState("professional");
  const [generatedReply, setGeneratedReply] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", content: "", tone: "professional" });

  const handleGenerate = async () => {
    if (!lead) {
      toast.error("No lead selected");
      return;
    }
    const selectedTone = tone === "custom" ? (profile?.ai_tone || "professional") : tone;
    const result = await generateReply.mutateAsync({
      message: lead.message_content,
      senderName: lead.source_name,
      channelType: lead.source_type,
      keywords: lead.detected_keyword ? [lead.detected_keyword] : [],
      tone: selectedTone,
      businessProfile: profile,
    });
    setGeneratedReply(result.reply);
  };

  const handleSaveDraft = () => {
    if (!generatedReply.trim()) return;
    saveDraft.mutate({
      lead_id: leadId,
      inbox_message_id: inboxMessageId,
      tone,
      reply_content: generatedReply,
      internal_notes: internalNotes || undefined,
    });
  };

  const handleSaveTemplate = () => {
    if (!templateForm.name.trim() || !templateForm.content.trim()) return;
    addTemplate.mutate(templateForm);
    setShowTemplateForm(false);
    setTemplateForm({ name: "", content: "", tone: "professional" });
  };

  const applyTemplate = (content: string) => {
    let filled = content;
    if (profile) {
      filled = filled.replace(/\{business_name\}/g, profile.business_name || "");
      filled = filled.replace(/\{service_name\}/g, profile.main_services || "");
    }
    if (lead) {
      filled = filled.replace(/\{sender_name\}/g, lead.source_name || "");
      filled = filled.replace(/\{channel_type\}/g, lead.source_type || "");
    }
    setGeneratedReply(filled);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (!leadId && !inboxMessageId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Select a lead from the Leads page or Inbox to open the reply workspace.</p>
            <div className="flex gap-3 justify-center mt-4">
              <Button variant="outline" onClick={() => navigate("/leads")}>Go to Leads</Button>
              <Button variant="outline" onClick={() => navigate("/inbox")}>Go to Inbox</Button>
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Lead Context */}
        {lead && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lead Context</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Source</p>
                  <p className="text-sm text-foreground">{lead.source_name} ({lead.source_type})</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Date</p>
                  <p className="text-sm text-foreground">{format(new Date(lead.message_date), "PPpp")}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Keyword</p>
                  <p className="text-sm text-foreground">{lead.detected_keyword || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Intent Score</p>
                  <Badge variant={Number(lead.intent_score) >= 0.7 ? "default" : "secondary"}>
                    {Math.round(Number(lead.intent_score) * 100)}%
                  </Badge>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Original Message</p>
                <p className="text-sm text-foreground rounded-lg bg-muted p-3">{lead.message_content}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reply Generator */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Generate Reply</CardTitle>
            <CardDescription>Select a tone and generate an AI-powered reply.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleGenerate} disabled={generateReply.isPending}>
                <RefreshCw className={`h-4 w-4 mr-1 ${generateReply.isPending ? "animate-spin" : ""}`} />
                {generateReply.isPending ? "Generating..." : "Generate Reply"}
              </Button>
            </div>

            {generatedReply && (
              <div className="space-y-3">
                <Textarea
                  value={generatedReply}
                  onChange={(e) => setGeneratedReply(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyText(generatedReply)}>
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generateReply.isPending}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                  </Button>
                  <Button size="sm" onClick={handleSaveDraft} disabled={saveDraft.isPending}>
                    <Save className="h-3 w-3 mr-1" /> Save Draft
                  </Button>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Internal Notes</p>
                  <Input
                    placeholder="Add private notes about this reply..."
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Templates */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Reply Templates</CardTitle>
              <CardDescription>Reusable templates with placeholders: {"{business_name}"}, {"{service_name}"}, {"{sender_name}"}, {"{channel_type}"}</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowTemplateForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No templates yet.</p>
            ) : (
              <div className="space-y-2">
                {templates.map((tpl) => (
                  <div key={tpl.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                        <Badge variant="secondary" className="text-xs">{tpl.tone}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{tpl.content}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => applyTemplate(tpl.content)}>Use</Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteTemplate.mutate(tpl.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Saved Drafts */}
        {drafts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Saved Drafts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {drafts.map((d) => (
                <div key={d.id} className={`rounded-lg border p-3 ${d.is_preferred ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">{d.tone}</Badge>
                    {d.is_preferred && <Badge variant="default" className="text-xs">Preferred</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">{format(new Date(d.created_at), "MMM d, HH:mm")}</span>
                  </div>
                  <p className="text-sm text-foreground mb-2">{d.reply_content}</p>
                  {d.internal_notes && (
                    <p className="text-xs text-muted-foreground italic mb-2">Note: {d.internal_notes}</p>
                  )}
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => copyText(d.reply_content)}>
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPreferred.mutate(d.id)}>
                      <Star className="h-3 w-3 mr-1" /> Prefer
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteDraft.mutate(d.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Template Form Dialog */}
        <Dialog open={showTemplateForm} onOpenChange={setShowTemplateForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Template name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Textarea
                placeholder="Template content with {business_name}, {sender_name} placeholders..."
                value={templateForm.content}
                onChange={(e) => setTemplateForm((f) => ({ ...f, content: e.target.value }))}
                rows={4}
              />
              <Select value={templateForm.tone} onValueChange={(v) => setTemplateForm((f) => ({ ...f, tone: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONES.filter((t) => t.value !== "custom").map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTemplateForm(false)}>Cancel</Button>
              <Button onClick={handleSaveTemplate}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ReplyWorkspace;
