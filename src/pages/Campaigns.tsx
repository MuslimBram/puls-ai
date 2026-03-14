import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { campaignFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";
import {
  useCampaigns,
  useCampaignContent,
  useCreateCampaign,
  useGenerateCampaignStrategy,
  useUpdateCampaign,
  useDeleteCampaign,
  Campaign,
  CampaignContent,
} from "@/hooks/useCampaigns";
import {
  Megaphone,
  Plus,
  Sparkles,
  Loader2,
  Trash2,
  Eye,
  Target,
  Users,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const OBJECTIVES = [
  { value: "lead_generation", label: "Lead Generation" },
  { value: "sales", label: "Sales" },
  { value: "brand_awareness", label: "Brand Awareness" },
  { value: "traffic", label: "Website Traffic" },
];

const CHANNELS = ["facebook", "instagram", "linkedin", "tiktok", "twitter", "email", "website"];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  strategy_ready: "bg-primary/10 text-primary",
  active: "bg-green-500/10 text-green-700",
  paused: "bg-yellow-500/10 text-yellow-700",
  completed: "bg-accent/10 text-accent-foreground",
};

const FUNNEL_COLORS: Record<string, string> = {
  awareness: "border-l-blue-500",
  consideration: "border-l-yellow-500",
  conversion: "border-l-green-500",
  retention: "border-l-purple-500",
};

const Campaigns = () => {
  const { data: campaigns, isLoading } = useCampaigns();
  const createMutation = useCreateCampaign();
  const generateMutation = useGenerateCampaignStrategy();
  const updateMutation = useUpdateCampaign();
  const deleteMutation = useDeleteCampaign();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [expandedFunnel, setExpandedFunnel] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formObjective, setFormObjective] = useState("lead_generation");
  const [formAudience, setFormAudience] = useState("");
  const [formBudgetMin, setFormBudgetMin] = useState("");
  const [formBudgetMax, setFormBudgetMax] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formChannels, setFormChannels] = useState<string[]>([]);
  const [aiSuggestField, setAiSuggestField] = useState<string | null>(null);
  const { profile } = useBusinessProfile();

  const resetForm = () => {
    setFormName(""); setFormObjective("lead_generation"); setFormAudience("");
    setFormBudgetMin(""); setFormBudgetMax(""); setFormStart(""); setFormEnd("");
    setFormChannels([]);
  };

  const handleCreate = async () => {
    const campaign = await createMutation.mutateAsync({
      name: formName,
      objective: formObjective,
      target_audience: formAudience || null,
      budget_min: Number(formBudgetMin) || 0,
      budget_max: Number(formBudgetMax) || 0,
      duration_start: formStart ? new Date(formStart).toISOString() : null,
      duration_end: formEnd ? new Date(formEnd).toISOString() : null,
      preferred_channels: formChannels,
    });
    setShowCreate(false);
    resetForm();
    // Auto-generate strategy
    if (campaign) {
      generateMutation.mutate({
        campaignId: campaign.id,
        campaignData: campaign,
      });
    }
  };

  const toggleChannel = (ch: string) => {
    setFormChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Campaign Builder</h1>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        </div>

        {/* Active Strategy Generation */}
        {generateMutation.isPending && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">AI is generating campaign strategy...</p>
                <p className="text-xs text-muted-foreground">This includes positioning, funnel stages, personas, and content suggestions</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Campaign List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !campaigns?.length ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Megaphone className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-foreground mb-2">No campaigns yet</p>
              <p className="text-sm text-muted-foreground mb-4">Create your first AI-powered marketing campaign</p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onView={() => setSelectedCampaign(campaign)}
                onDelete={() => deleteMutation.mutate(campaign.id)}
                onRegenerate={() => generateMutation.mutate({ campaignId: campaign.id, campaignData: campaign })}
                isRegenerating={generateMutation.isPending}
              />
            ))}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <FieldLabelWithGuide
                  label="Campaign Name"
                  guide={getFieldGuide(campaignFieldGuides, "campaign_name")!}
                  onAiSuggest={async () => {
                    setAiSuggestField("campaign_name");
                    try {
                      const { data } = await supabase.functions.invoke("ai-sales-assistant", {
                        body: { prompt: `Suggest 1 campaign name for a ${profile?.industry || "general"} business. Objective: ${formObjective}. Return only the name.` },
                      });
                      if (data?.reply) setFormName(data.reply.trim());
                    } catch {} finally { setAiSuggestField(null); }
                  }}
                  isAiLoading={aiSuggestField === "campaign_name"}
                />
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Summer Lead Gen Campaign" />
              </div>
              <div>
                <FieldLabelWithGuide
                  label="Objective"
                  guide={getFieldGuide(campaignFieldGuides, "campaign_objective")!}
                />
                <Select value={formObjective} onValueChange={setFormObjective}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OBJECTIVES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabelWithGuide
                  label="Target Audience"
                  guide={getFieldGuide(campaignFieldGuides, "campaign_audience")!}
                  onAiSuggest={async () => {
                    setAiSuggestField("campaign_audience");
                    try {
                      const { data } = await supabase.functions.invoke("ai-sales-assistant", {
                        body: { prompt: `Suggest a target audience description for a ${profile?.industry || "general"} business offering ${profile?.main_services || "services"}. Campaign objective: ${formObjective}. Return 1-2 sentences.` },
                      });
                      if (data?.reply) setFormAudience(data.reply.trim());
                    } catch {} finally { setAiSuggestField(null); }
                  }}
                  isAiLoading={aiSuggestField === "campaign_audience"}
                />
                <Textarea value={formAudience} onChange={(e) => setFormAudience(e.target.value)} placeholder="Small business owners in tech sector..." rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabelWithGuide
                    label="Budget Min ($)"
                    guide={getFieldGuide(campaignFieldGuides, "campaign_budget")!}
                  />
                  <Input type="number" value={formBudgetMin} onChange={(e) => setFormBudgetMin(e.target.value)} placeholder="500" />
                </div>
                <div>
                  <Label>Budget Max ($)</Label>
                  <Input type="number" value={formBudgetMax} onChange={(e) => setFormBudgetMax(e.target.value)} placeholder="2000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <FieldLabelWithGuide
                  label="Preferred Channels"
                  guide={getFieldGuide(campaignFieldGuides, "campaign_channels")!}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {CHANNELS.map((ch) => (
                    <div key={ch} className="flex items-center gap-1.5">
                      <Checkbox checked={formChannels.includes(ch)} onCheckedChange={() => toggleChannel(ch)} id={`ch-${ch}`} />
                      <label htmlFor={`ch-${ch}`} className="text-sm capitalize cursor-pointer">{ch}</label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!formName.trim() || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Create & Generate Strategy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Campaign Detail Dialog */}
        {selectedCampaign && (
          <CampaignDetail
            campaign={selectedCampaign}
            onClose={() => setSelectedCampaign(null)}
            expandedFunnel={expandedFunnel}
            setExpandedFunnel={setExpandedFunnel}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

const CampaignCard = ({
  campaign,
  onView,
  onDelete,
  onRegenerate,
  isRegenerating,
}: {
  campaign: Campaign;
  onView: () => void;
  onDelete: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) => (
  <Card className="hover:border-primary/20 transition-colors">
    <CardContent className="flex items-center justify-between py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone className="h-4 w-4 text-primary shrink-0" />
          <h3 className="font-medium text-foreground truncate">{campaign.name}</h3>
          <Badge className={STATUS_COLORS[campaign.status] || ""}>{campaign.status.replace("_", " ")}</Badge>
          {campaign.ai_generated && <Badge variant="secondary" className="text-xs"><Sparkles className="h-3 w-3 mr-1" />AI</Badge>}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="capitalize">{campaign.objective.replace("_", " ")}</span>
          {campaign.preferred_channels?.length > 0 && (
            <span>{campaign.preferred_channels.join(", ")}</span>
          )}
          {campaign.budget_max > 0 && <span>${campaign.budget_min}–${campaign.budget_max}</span>}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" variant="ghost" onClick={onView}><Eye className="h-4 w-4" /></Button>
        {campaign.status === "draft" && (
          <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={isRegenerating}>
            <Sparkles className="h-4 w-4" />
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </CardContent>
  </Card>
);

const CampaignDetail = ({
  campaign,
  onClose,
  expandedFunnel,
  setExpandedFunnel,
}: {
  campaign: Campaign;
  onClose: () => void;
  expandedFunnel: string | null;
  setExpandedFunnel: (s: string | null) => void;
}) => {
  const { data: content } = useCampaignContent(campaign.id);

  const funnelStages = campaign.funnel_stages || [];
  const personas = campaign.audience_personas || [];
  const pillars = campaign.messaging_pillars || [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            {campaign.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="strategy" className="space-y-4">
          <TabsList>
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
            <TabsTrigger value="personas">Personas ({personas.length})</TabsTrigger>
            <TabsTrigger value="funnel">Funnel ({funnelStages.length})</TabsTrigger>
            <TabsTrigger value="content">Content ({content?.length || 0})</TabsTrigger>
          </TabsList>

          {/* Strategy Tab */}
          <TabsContent value="strategy" className="space-y-4">
            {campaign.positioning_statement ? (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Positioning</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{campaign.positioning_statement}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Value Proposition</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{campaign.value_proposition}</p>
                  </CardContent>
                </Card>

                {pillars.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Messaging Pillars</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {pillars.map((p: any, i: number) => (
                        <div key={i} className="rounded-lg border border-border p-3">
                          <p className="text-sm font-medium text-foreground">{p.pillar}</p>
                          <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {campaign.cta_strategy && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">CTA Strategy</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{campaign.cta_strategy}</p>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Sparkles className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p>No strategy generated yet. Click the sparkle icon to generate.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Personas Tab */}
          <TabsContent value="personas" className="space-y-4">
            {personas.length ? personas.map((p: any, i: number) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> {p.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                  {p.interests?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">Interests</p>
                      <div className="flex flex-wrap gap-1">
                        {p.interests.map((int: string, j: number) => (
                          <Badge key={j} variant="secondary" className="text-xs">{int}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {p.pain_points?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">Pain Points</p>
                      <div className="flex flex-wrap gap-1">
                        {p.pain_points.map((pp: string, j: number) => (
                          <Badge key={j} variant="outline" className="text-xs">{pp}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No personas generated.</CardContent></Card>
            )}
          </TabsContent>

          {/* Funnel Tab */}
          <TabsContent value="funnel" className="space-y-3">
            {funnelStages.length ? funnelStages.map((stage: any, i: number) => {
              const stageContent = (content || []).filter((c) => c.funnel_stage === stage.stage);
              const isExpanded = expandedFunnel === stage.stage;
              return (
                <Card key={i} className={`border-l-4 ${FUNNEL_COLORS[stage.stage] || "border-l-muted"}`}>
                  <CardContent className="py-3">
                    <button
                      className="flex w-full items-center justify-between text-left"
                      onClick={() => setExpandedFunnel(isExpanded ? null : stage.stage)}
                    >
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm capitalize">{stage.stage}</span>
                        <Badge variant="outline" className="text-xs">{stageContent.length} content</Badge>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <p className="text-xs text-muted-foreground mt-1">{stage.goal}</p>
                    {isExpanded && stageContent.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {stageContent.map((c) => (
                          <div key={c.id} className="rounded border border-border p-2">
                            <p className="text-xs font-medium text-foreground">{c.title || c.content_type}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{c.body}</p>
                            {c.hashtags?.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {c.hashtags.slice(0, 5).map((h, j) => (
                                  <span key={j} className="text-[10px] text-primary">#{h}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No funnel stages generated.</CardContent></Card>
            )}
          </TabsContent>

          {/* Content Tab */}
          <TabsContent value="content" className="space-y-3">
            {content?.length ? content.map((c) => (
              <Card key={c.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs capitalize">{c.funnel_stage}</Badge>
                        <Badge variant="outline" className="text-xs">{c.content_type}</Badge>
                      </div>
                      <p className="text-sm font-medium text-foreground">{c.title || "Untitled"}</p>
                      <p className="text-xs text-muted-foreground mt-1">{c.body}</p>
                    </div>
                  </div>
                  {c.hashtags?.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {c.hashtags.map((h, j) => (
                        <Badge key={j} variant="secondary" className="text-[10px]">#{h}</Badge>
                      ))}
                    </div>
                  )}
                  {c.media_suggestion && (
                    <p className="text-[10px] text-muted-foreground mt-1">📷 {c.media_suggestion}</p>
                  )}
                </CardContent>
              </Card>
            )) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No content generated for this campaign.</CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default Campaigns;
