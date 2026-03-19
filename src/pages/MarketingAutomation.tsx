import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useMarketingCampaigns, useCreateMarketingCampaign, useContentLibrary, useGenerateContent, useMarketingAnalytics } from "@/hooks/useMarketingAutomation";
import { CalendarDays, Plus, Megaphone, FileText, BarChart3, Loader2, Mail, MessageSquare, Radio, Share2 } from "lucide-react";

const CHANNELS = [
  { id: "email", label: "Email", icon: Mail },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "broadcast", label: "Broadcast", icon: Radio },
  { id: "social", label: "Social", icon: Share2 },
];

const MarketingAutomation = () => {
  const { data: campaigns, isLoading } = useMarketingCampaigns();
  const { data: content } = useContentLibrary();
  const { data: analytics } = useMarketingAnalytics();
  const createCampaign = useCreateMarketingCampaign();
  const generateContent = useGenerateContent();

  const [campName, setCampName] = useState("");
  const [campChannels, setCampChannels] = useState<string[]>(["email"]);
  const [campDialogOpen, setCampDialogOpen] = useState(false);

  const [contentType, setContentType] = useState("social_post");
  const [contentTone, setContentTone] = useState("professional");
  const [contentBody, setContentBody] = useState("");
  const [contentDialogOpen, setContentDialogOpen] = useState(false);

  const handleCreateCampaign = async () => {
    if (!campName.trim()) return;
    await createCampaign.mutateAsync({ name: campName, channels: campChannels });
    setCampName("");
    setCampDialogOpen(false);
  };

  const handleGenerateContent = async () => {
    if (!contentBody.trim()) return;
    await generateContent.mutateAsync({ content_type: contentType, tone: contentTone, channel: "multi", body: contentBody });
    setContentBody("");
    setContentDialogOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Marketing Automation</h1>
            <p className="text-sm text-muted-foreground">Orchestrate multi-channel campaigns and AI-powered content</p>
          </div>
        </div>

        {/* Overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Megaphone className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{analytics?.total ?? 0}</p><p className="text-xs text-muted-foreground">Total Campaigns</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CalendarDays className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold">{analytics?.active ?? 0}</p><p className="text-xs text-muted-foreground">Active</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><FileText className="h-8 w-8 text-accent" /><div><p className="text-2xl font-bold">{content?.length ?? 0}</p><p className="text-xs text-muted-foreground">Content Pieces</p></div></div></CardContent></Card>
        </div>

        <Tabs defaultValue="campaigns">
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="content">Content Library</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-3">
            <div className="flex justify-end">
              <Dialog open={campDialogOpen} onOpenChange={setCampDialogOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />New Campaign</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-2">
                    <Input placeholder="Campaign name" value={campName} onChange={(e) => setCampName(e.target.value)} />
                    <div>
                      <p className="text-sm font-medium mb-2">Channels</p>
                      <div className="flex flex-wrap gap-3">
                        {CHANNELS.map((ch) => (
                          <label key={ch.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={campChannels.includes(ch.id)}
                              onCheckedChange={(checked) =>
                                setCampChannels((prev) => checked ? [...prev, ch.id] : prev.filter((c) => c !== ch.id))
                              }
                            />
                            {ch.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <Button onClick={handleCreateCampaign} disabled={createCampaign.isPending} className="w-full">
                      {createCampaign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {(campaigns || []).length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No campaigns yet</CardContent></Card>
            ) : (
              (campaigns || []).map((c) => (
                <Card key={c.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <div className="flex gap-1 mt-1">{c.channels.map((ch) => <Badge key={ch} variant="secondary" className="text-[10px]">{ch}</Badge>)}</div>
                    </div>
                    <Badge variant={c.status === "active" ? "default" : "outline"}>{c.status}</Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="content" className="space-y-3">
            <div className="flex justify-end">
              <Dialog open={contentDialogOpen} onOpenChange={setContentDialogOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Generate Content</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>AI Content Generator</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-2">
                    <Select value={contentType} onValueChange={setContentType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="social_post">Social Post</SelectItem>
                        <SelectItem value="email_draft">Email Draft</SelectItem>
                        <SelectItem value="outreach">Outreach Message</SelectItem>
                        <SelectItem value="call_script">Call Script</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={contentTone} onValueChange={setContentTone}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="friendly">Friendly</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea placeholder="Content body or prompt..." value={contentBody} onChange={(e) => setContentBody(e.target.value)} rows={4} />
                    <Button onClick={handleGenerateContent} disabled={generateContent.isPending} className="w-full">Save Content</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {(content || []).map((item) => (
              <Card key={item.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-[10px]">{item.content_type}</Badge>
                        <Badge variant="outline" className="text-[10px]">{item.tone}</Badge>
                      </div>
                      <p className="text-sm line-clamp-2">{item.body}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="analytics">
            <Card>
              <CardHeader><CardTitle className="text-base">Channel Distribution</CardTitle></CardHeader>
              <CardContent>
                {analytics?.channelReach && Object.keys(analytics.channelReach).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(analytics.channelReach).map(([ch, count]) => (
                      <div key={ch} className="flex items-center justify-between">
                        <span className="text-sm capitalize">{ch}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(20, count * 40)}px` }} />
                          <span className="text-sm font-medium">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No campaign data yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default MarketingAutomation;
