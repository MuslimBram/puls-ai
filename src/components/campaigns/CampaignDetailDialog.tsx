import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Campaign, useCampaignContent } from "@/hooks/useCampaigns";
import { FUNNEL_COLORS } from "./constants";
import { Megaphone, Sparkles, Target, Users, MessageSquare, TrendingUp, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

interface CampaignDetailDialogProps {
  campaign: Campaign;
  onClose: () => void;
}

export const CampaignDetailDialog = ({ campaign, onClose }: CampaignDetailDialogProps) => {
  const { data: content } = useCampaignContent(campaign.id);
  const [expandedFunnel, setExpandedFunnel] = useState<string | null>(null);

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
