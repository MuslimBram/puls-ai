import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
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



  const createBusiness = useMutation({
    mutationFn: async () => {
      if (!form.business_name.trim()) throw new Error("Business name is required");

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

      // Channels are NOT created here. Each real connection must go through
      // the canonical channel flow so business_id, package quota, credential
      // encryption, and connection validation are enforced consistently.
      return data.id;
    },
    onSuccess: async (businessId) => {
      await log("admin_create_business", "business", businessId, {
        business_name: form.business_name,
        assigned_to: form.assign_to_user === "__self__" ? user!.id : form.assign_to_user,
        channels_count: 0,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-businesses"] });
      toast.success("Business created successfully. Connect channels from the secure Channels flow.");
      setOpen(false);
      setForm({
        business_name: "", short_description: "", industry: "",
        target_audience: "", main_services: "", ai_tone: "professional",
        language: "sq", assign_to_user: "__self__",
      });

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

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Channels are connected separately.</strong> After the business is created, use the secure Channels flow to connect each channel. The customer package determines the allowed channel count: 2 / 4 / 8 / unlimited.
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
                disabled={createBusiness.isPending || !form.business_name.trim()}
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
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/admin/businesses/${b.id}/scan-insights`}>Open Business</Link>
                  </Button>
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
