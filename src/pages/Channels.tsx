import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChannels, ChannelData } from "@/hooks/useChannels";
import { useChannelRegistry } from "@/hooks/useChannelRegistry";
import { Plus, Trash2, Radio, MessageSquare, Mail, Globe, Share2, Webhook } from "lucide-react";

const CATEGORY_ICONS: Record<string, any> = {
  messaging: MessageSquare,
  email: Mail,
  website: Globe,
  social: Share2,
  custom: Webhook,
};

const CATEGORY_LABELS: Record<string, string> = {
  messaging: "Messaging",
  email: "Email",
  website: "Website",
  social: "Social",
  custom: "Custom",
  voice: "Voice",
};

const Channels = () => {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<ChannelData>({ channel_type: "telegram", channel_name: "" });
  const { channels, isLoading, addChannel, toggleChannel, deleteChannel } = useChannels();
  const { registry } = useChannelRegistry();

  const handleAdd = () => {
    if (!form.channel_name.trim()) return;
    addChannel.mutate(form, {
      onSuccess: () => {
        setShowAdd(false);
        setForm({ channel_type: "telegram", channel_name: "" });
      },
    });
  };

  // Group registry by category
  const categories = registry.reduce<Record<string, typeof registry>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Connected Channels */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Radio className="h-5 w-5 text-primary" />
                Connected Channels
              </CardTitle>
              <CardDescription>Manage your active communication channels.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Channel
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : channels.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No channels configured. Add a channel to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {channels.map((ch) => (
                  <div key={ch.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{ch.channel_name}</span>
                      <Badge variant="secondary" className="text-xs">{ch.channel_type}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={ch.is_enabled}
                        onCheckedChange={(checked) => toggleChannel.mutate({ id: ch.id, is_enabled: checked })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => deleteChannel.mutate(ch.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Channel Registry */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Available Channels</CardTitle>
            <CardDescription>All supported channel integrations. Channels marked as available can be connected now.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={Object.keys(categories)[0] || "messaging"}>
              <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                {Object.keys(categories).map((cat) => {
                  const Icon = CATEGORY_ICONS[cat] || Radio;
                  return (
                    <TabsTrigger key={cat} value={cat} className="gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {CATEGORY_LABELS[cat] || cat}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {Object.entries(categories).map(([cat, items]) => (
                <TabsContent key={cat} value={cat}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <span className="text-sm font-medium text-foreground">{item.name}</span>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                          )}
                        </div>
                        <Badge variant={item.is_available ? "default" : "outline"} className="text-xs">
                          {item.is_available ? "Available" : "Coming Soon"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Add Channel Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Channel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Type</label>
                <Select value={form.channel_type} onValueChange={(v) => setForm((f) => ({ ...f, channel_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {registry.filter((r) => r.is_available).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                    {/* Also allow non-available for placeholder */}
                    {registry.filter((r) => !r.is_available).slice(0, 5).map((r) => (
                      <SelectItem key={r.id} value={r.id} disabled>{r.name} (Coming Soon)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Name</label>
                <Input
                  placeholder="e.g. Main Telegram Group"
                  value={form.channel_name}
                  onChange={(e) => setForm((f) => ({ ...f, channel_name: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={addChannel.isPending}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Channels;
