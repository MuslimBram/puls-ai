import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Users, Link2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface AdminCreateBusinessProps {
  profiles: Array<{ id: string; user_id: string; full_name: string | null }>;
  businesses: Array<any>;
}

const toneOptions = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
];

const channelTypes = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "twitter", label: "Twitter / X" },
  { value: "youtube", label: "YouTube" },
  { value: "website", label: "Website" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "email", label: "Email" },
];

interface ChannelEntry {
  type: string;
  identifier: string;
}

export const AdminCreateBusiness = ({ profiles, businesses }: AdminCreateBusinessProps) => {
  const { user } = useAuth();
  const { log } = useAuditLog();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    business_name: "",
    short_description: "",
    industry: "",
    target_audience: "",
    main_services: "",
    ai_tone: "professional",
    language: "sq",
    assign_to_user: "__self__",
  });

  const [channels, setChannels] = useState<ChannelEntry[]>([
    { type: "instagram", identifier: "" },
    { type: "linkedin", identifier: "" },
  ]);

  const addChannel = () => {
    const usedTypes = channels.map((c) => c.type);
    const nextType = channelTypes.find((ct) => !usedTypes.includes(ct.value))?.value || "website";
    setChannels((prev) => [...prev, { type: nextType, identifier: "" }]);
  };

  const removeChannel = (index: number) => {
    if (channels.length <= 2) return; // min 2
    setChannels((prev) => prev.filter((_, i) => i !== index));
  };

  const updateChannel = (index: number, field: keyof ChannelEntry, value: string) => {
    setChannels((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const validChannels = channels.filter((c) => c.identifier.trim());

  const createBusiness = useMutation({
    mutationFn: async () => {
      if (!form.business_name.trim()) throw new Error("Business name is required");
      if (validChannels.length < 2) throw new Error("At least 2 channels must be filled in");

      const targetUserId = form.assign_to_user === "__self__" ? user!.id : form.assign_to_user;

      const { data: workspace } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", targetUserId)
        .limit(1)
        .single();

      if (!workspace) throw new Error("User has no workspace");

      const { data, error } = await supabase
        .from("business_profiles")
        .insert({
          business_name: form.business_name.trim(),
          short_description: form.short_description,
          industry: form.industry,
          target_audience: form.target_audience,
          main_services: form.main_services,
          ai_tone: form.ai_tone,
          language: form.language,
          user_id: targetUserId,
          workspace_id: workspace.id,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Insert channels into channel_registry
      const channelInserts = validChannels.map((ch) => ({
        workspace_id: workspace.id,
        channel_type: ch.type,
        channel_identifier: ch.identifier.trim(),
        is_active: true,
        user_id: targetUserId,
      }));

      const { error: chError } = await (supabase.from("channel_registry") as any).insert(channelInserts);
      if (chError) console.error("Channel insert error:", chError);

      return data.id;
    },
    onSuccess: async (businessId) => {
      await log("admin_create_business", "business", businessId, {
        business_name: form.business_name,
        assigned_to: form.assign_to_user === "__self__" ? user!.id : form.assign_to_user,
        channels_count: validChannels.length,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-businesses"] });
      toast.success("Business created successfully with " + validChannels.length + " channels");
      setOpen(false);
      setForm({
        business_name: "", short_description: "", industry: "",
        target_audience: "", main_services: "", ai_tone: "professional",
        language: "sq", assign_to_user: "__self__",
      });
      setChannels([
        { type: "instagram", identifier: "" },
        { type: "linkedin", identifier: "" },
      ]);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Businesses ({businesses.length})
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3 w-3 mr-1" /> Create Business
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Business (Admin)</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Business Name *</Label>
                <Input
                  value={form.business_name}
                  onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                  placeholder="Business name"
                />
              </div>
              <div>
                <Label>Short Description</Label>
                <Textarea
                  value={form.short_description}
                  onChange={(e) => setForm((f) => ({ ...f, short_description: e.target.value }))}
                  placeholder="Description..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Industry</Label>
                  <Input
                    value={form.industry}
                    onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                    placeholder="e.g. Technology"
                  />
                </div>
                <div>
                  <Label>AI Tone</Label>
                  <Select value={form.ai_tone} onValueChange={(v) => setForm((f) => ({ ...f, ai_tone: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {toneOptions.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Channels section - minimum 2 required */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    Channels (min. 2) *
                  </Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addChannel}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>

                {validChannels.length < 2 && (
                  <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Fill in at least 2 channels (e.g. Instagram & LinkedIn, Website, etc.)
                  </div>
                )}

                {channels.map((ch, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={ch.type} onValueChange={(v) => updateChannel(idx, "type", v)}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {channelTypes.map((ct) => (
                          <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={ch.identifier}
                      onChange={(e) => updateChannel(idx, "identifier", e.target.value)}
                      placeholder={ch.type === "website" ? "https://..." : "@username or URL"}
                      className="flex-1"
                    />
                    {channels.length > 2 && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeChannel(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <Label>Assign to User</Label>
                <Select value={form.assign_to_user} onValueChange={(v) => setForm((f) => ({ ...f, assign_to_user: v }))}>
                  <SelectTrigger><SelectValue placeholder="Self (Admin)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__self__">Self (Admin)</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.full_name || p.user_id.substring(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={() => createBusiness.mutate()}
                disabled={createBusiness.isPending || !form.business_name.trim() || validChannels.length < 2}
              >
                {createBusiness.isPending ? "Creating..." : "Create Business"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {businesses.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No businesses</p>
        ) : (
          <div className="space-y-2">
            {businesses.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{b.business_name}</p>
                    <Badge variant="secondary" className="text-xs">{b.industry || "No industry"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {b.short_description?.substring(0, 80) || "No description"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{b.ai_tone}</Badge>
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
