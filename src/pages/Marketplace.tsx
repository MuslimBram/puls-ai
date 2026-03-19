import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useMarketplacePlugins, useMarketplaceTemplates, useMarketplaceAIPacks } from "@/hooks/useMarketplace";
import { Package, FileText, Brain, Star, Download, Plug, Sparkles } from "lucide-react";

const PluginCard = ({ plugin, installed, onInstall, onToggle, onUninstall }: any) => {
  const wp = installed?.find((i: any) => i.plugin_id === plugin.id);
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Plug className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">{plugin.name}</CardTitle>
              <CardDescription className="text-xs">{plugin.author_name || "Community"}</CardDescription>
            </div>
          </div>
          {plugin.is_verified && <Badge variant="secondary" className="text-[10px]">Verified</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <p className="text-xs text-muted-foreground line-clamp-2">{plugin.description || "No description"}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Download className="h-3 w-3" />{plugin.install_count}</span>
          <span className="flex items-center gap-1"><Star className="h-3 w-3" />{plugin.avg_rating || "—"}</span>
          {plugin.price_cents > 0 && <Badge variant="outline" className="text-[10px]">${(plugin.price_cents / 100).toFixed(2)}/mo</Badge>}
          {plugin.price_cents === 0 && <Badge variant="outline" className="text-[10px] text-green-600">Free</Badge>}
        </div>
        {wp ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={wp.is_enabled} onCheckedChange={(v) => onToggle({ id: wp.id, is_enabled: v })} />
              <span className="text-xs">{wp.is_enabled ? "Enabled" : "Disabled"}</span>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => onUninstall(wp.id)}>Remove</Button>
          </div>
        ) : (
          <Button size="sm" className="w-full text-xs" onClick={() => onInstall(plugin.id)}>Install</Button>
        )}
      </CardContent>
    </Card>
  );
};

const TemplateCard = ({ template, onInstall }: any) => (
  <Card>
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <CardTitle className="text-sm">{template.name}</CardTitle>
      </div>
      <div className="flex gap-1 flex-wrap">
        <Badge variant="secondary" className="text-[10px]">{template.template_type}</Badge>
        <Badge variant="outline" className="text-[10px]">{template.category}</Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-2">
      <p className="text-xs text-muted-foreground line-clamp-2">{template.description || "Ready-to-use template"}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1"><Download className="h-3 w-3" />{template.install_count}</span>
        <Button size="sm" className="text-xs" onClick={() => onInstall(template.id)}>Install</Button>
      </div>
    </CardContent>
  </Card>
);

const AIPackCard = ({ pack, onInstall }: any) => (
  <Card>
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <CardTitle className="text-sm">{pack.name}</CardTitle>
      </div>
      {pack.industry && <Badge variant="secondary" className="text-[10px]">{pack.industry}</Badge>}
    </CardHeader>
    <CardContent className="space-y-2">
      <p className="text-xs text-muted-foreground line-clamp-2">{pack.description || "AI knowledge pack"}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{pack.pack_type}</span>
        <Button size="sm" className="text-xs" onClick={() => onInstall({ packId: pack.id })}>Install</Button>
      </div>
    </CardContent>
  </Card>
);

const Marketplace = () => {
  const { plugins, installed, installPlugin, togglePlugin, uninstallPlugin } = useMarketplacePlugins();
  const { templates, installTemplate } = useMarketplaceTemplates();
  const { packs, installPack } = useMarketplaceAIPacks();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6 text-primary" /> Marketplace</h1>
          <p className="text-sm text-muted-foreground mt-1">Extend your platform with plugins, templates, and AI packs</p>
        </div>

        <Tabs defaultValue="plugins">
          <TabsList>
            <TabsTrigger value="plugins" className="gap-1"><Plug className="h-3 w-3" />Plugins</TabsTrigger>
            <TabsTrigger value="templates" className="gap-1"><FileText className="h-3 w-3" />Templates</TabsTrigger>
            <TabsTrigger value="ai-packs" className="gap-1"><Brain className="h-3 w-3" />AI Packs</TabsTrigger>
            <TabsTrigger value="installed" className="gap-1"><Sparkles className="h-3 w-3" />Installed</TabsTrigger>
          </TabsList>

          <TabsContent value="plugins" className="mt-4">
            {plugins.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No plugins available yet. Check back soon!</CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {plugins.map((p: any) => (
                  <PluginCard key={p.id} plugin={p} installed={installed}
                    onInstall={(id: string) => installPlugin.mutate(id)}
                    onToggle={(v: any) => togglePlugin.mutate(v)}
                    onUninstall={(id: string) => uninstallPlugin.mutate(id)} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            {templates.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No templates available yet.</CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {templates.map((t: any) => <TemplateCard key={t.id} template={t} onInstall={(id: string) => installTemplate.mutate(id)} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ai-packs" className="mt-4">
            {packs.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No AI packs available yet.</CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {packs.map((p: any) => <AIPackCard key={p.id} pack={p} onInstall={(v: any) => installPack.mutate(v)} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="installed" className="mt-4">
            {installed.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No plugins installed. Browse the marketplace to get started.</CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {installed.map((wp: any) => (
                  <Card key={wp.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{wp.marketplace_plugins?.name || "Plugin"}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch checked={wp.is_enabled} onCheckedChange={(v) => togglePlugin.mutate({ id: wp.id, is_enabled: v })} />
                          <span className="text-xs">{wp.is_enabled ? "Active" : "Inactive"}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => uninstallPlugin.mutate(wp.id)}>Remove</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Marketplace;
