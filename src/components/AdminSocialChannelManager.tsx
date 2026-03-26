import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Globe, Plus, LogIn, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

const SOCIAL_PLATFORMS = [
  { value: "facebook", label: "Facebook", icon: "📘" },
  { value: "instagram", label: "Instagram", icon: "📷" },
  { value: "tiktok", label: "TikTok", icon: "🎵" },
  { value: "twitter", label: "X (Twitter)", icon: "🐦" },
  { value: "linkedin", label: "LinkedIn", icon: "💼" },
  { value: "youtube", label: "YouTube", icon: "▶️" },
  { value: "telegram_group", label: "Telegram Grup", icon: "✈️" },
  { value: "whatsapp_group", label: "WhatsApp Grup", icon: "💬" },
];

interface AdminSocialChannelManagerProps {
  businesses: Array<any>;
}

export const AdminSocialChannelManager = ({ businesses }: AdminSocialChannelManagerProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    business_id: "",
    platform: "",
    account_name: "",
    account_url: "",
    login_email: "",
    notes: "",
  });

  // Fetch social channel assignments
  const channelsQuery = useQuery({
    queryKey: ["admin-social-channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .in("channel_type", SOCIAL_PLATFORMS.map((p) => p.value))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addChannel = useMutation({
    mutationFn: async () => {
      if (!form.business_id || !form.platform || !form.account_name) {
        throw new Error("Plotësoni fushat e detyrueshme");
      }

      const business = businesses.find((b: any) => b.id === form.business_id);
      if (!business) throw new Error("Biznesi nuk u gjet");

      const { error } = await supabase
        .from("channels")
        .insert({
          user_id: business.user_id,
          workspace_id: business.workspace_id,
          channel_name: `${form.account_name} (${form.platform})`,
          channel_type: form.platform,
          is_enabled: true,
          credentials: {
            account_name: form.account_name,
            account_url: form.account_url,
            login_email: form.login_email,
            managed_by_admin: user!.id,
            notes: form.notes,
          },
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-social-channels"] });
      toast.success("Kanali social u shtua me sukses");
      setOpen(false);
      setForm({ business_id: "", platform: "", account_name: "", account_url: "", login_email: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const removeChannel = useMutation({
    mutationFn: async (channelId: string) => {
      const { error } = await supabase.from("channels").delete().eq("id", channelId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-social-channels"] });
      toast.success("Kanali u hoq");
    },
    onError: (e) => toast.error(e.message),
  });

  const channels = channelsQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Kanalet Sociale ({channels.length})
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3 w-3 mr-1" /> Lidh Kanal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Lidh Kanal Social me Biznes</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Biznesi *</Label>
                <Select value={form.business_id} onValueChange={(v) => setForm((f) => ({ ...f, business_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Zgjidhni biznesin" /></SelectTrigger>
                  <SelectContent>
                    {businesses.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>{b.business_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Platforma *</Label>
                <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}>
                  <SelectTrigger><SelectValue placeholder="Zgjidhni platformën" /></SelectTrigger>
                  <SelectContent>
                    {SOCIAL_PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.icon} {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Emri i Llogarisë *</Label>
                <Input
                  value={form.account_name}
                  onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
                  placeholder="p.sh. @biznesi_yt"
                />
              </div>
              <div>
                <Label>URL e Llogarisë</Label>
                <Input
                  value={form.account_url}
                  onChange={(e) => setForm((f) => ({ ...f, account_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>Email i Login-it</Label>
                <Input
                  value={form.login_email}
                  onChange={(e) => setForm((f) => ({ ...f, login_email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>Shënime</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Shënime shtesë..."
                />
              </div>
              <Button
                className="w-full"
                onClick={() => addChannel.mutate()}
                disabled={addChannel.isPending}
              >
                <LogIn className="h-3 w-3 mr-1" />
                {addChannel.isPending ? "Duke shtuar..." : "Lidh Kanalin"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Asnjë kanal social i lidhur. Shtoni kanale për bizneset.
          </p>
        ) : (
          <div className="space-y-2">
            {channels.map((ch: any) => {
              const platform = SOCIAL_PLATFORMS.find((p) => p.value === ch.channel_type);
              const creds = ch.credentials as any;
              return (
                <div key={ch.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span>{platform?.icon || "🔗"}</span>
                      <p className="text-sm font-medium text-foreground">{ch.channel_name}</p>
                      <Badge variant={ch.is_enabled ? "default" : "outline"} className="text-xs">
                        {ch.is_enabled ? "Aktiv" : "Joaktiv"}
                      </Badge>
                    </div>
                    {creds?.account_url && (
                      <p className="text-xs text-muted-foreground mt-0.5">{creds.account_url}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeChannel.mutate(ch.id)}
                    disabled={removeChannel.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
