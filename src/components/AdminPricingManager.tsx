import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Save, DollarSign } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { usePricingSettings, type PricingSetting } from "@/hooks/usePricingSettings";

interface DraftSetting {
  monthly: string;
  annual: string;
  label: string;
  socialProfiles: string;
  channels: string;
  keywords: string;
  keywordsPerGroup: string;
  aiRepliesPerDay: string;
  teamMembers: string;
  conversationHistoryDays: string;
  leadsPerMonth: string;
  automationRules: string;
  dailyImageLimit: string;
  dailyVideoLimit: string;
  maxVideoSeconds: string;
  featureJson: string;
}

const getDraft = (setting: PricingSetting, overrides?: DraftSetting): DraftSetting => {
  if (overrides) return overrides;

  return {
    monthly: String(setting.monthly_price),
    annual: String(setting.annual_price),
    label: setting.donation_label || "",
    socialProfiles: String(setting.social_profiles_limit ?? ""),
    channels: String(setting.channels_limit ?? ""),
    keywords: String(setting.keywords_limit ?? ""),
    keywordsPerGroup: String(setting.keywords_per_group_limit ?? ""),
    aiRepliesPerDay: String(setting.ai_replies_per_day_limit ?? ""),
    teamMembers: String(setting.team_members_limit ?? ""),
    conversationHistoryDays: String(setting.conversation_history_days ?? ""),
    leadsPerMonth: String(setting.leads_per_month_limit ?? ""),
    automationRules: String(setting.automation_rules_limit ?? ""),
    dailyImageLimit: String(setting.daily_image_limit ?? ""),
    dailyVideoLimit: String(setting.daily_video_limit ?? ""),
    maxVideoSeconds: String(setting.max_video_seconds ?? ""),
    featureJson: JSON.stringify(setting.feature_entitlements || {}, null, 2),
  };
};

const numericOrNull = (value: string) => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const AdminPricingManager = () => {
  const { settings, updatePrice } = usePricingSettings();
  const [drafts, setDrafts] = useState<Record<string, DraftSetting>>({});

  const setField = (id: string, setting: PricingSetting, field: keyof DraftSetting, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...getDraft(setting, prev[id]),
        [field]: value,
      },
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Pricing Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {settings.map((setting) => {
            const draft = getDraft(setting, drafts[setting.id]);
            const serializedCurrentFeatures = JSON.stringify(setting.feature_entitlements || {}, null, 2);
            const hasChanges =
              draft.monthly !== String(setting.monthly_price) ||
              draft.annual !== String(setting.annual_price) ||
              draft.label !== (setting.donation_label || "") ||
              draft.socialProfiles !== String(setting.social_profiles_limit ?? "") ||
              draft.channels !== String(setting.channels_limit ?? "") ||
              draft.keywords !== String(setting.keywords_limit ?? "") ||
              draft.keywordsPerGroup !== String(setting.keywords_per_group_limit ?? "") ||
              draft.aiRepliesPerDay !== String(setting.ai_replies_per_day_limit ?? "") ||
              draft.teamMembers !== String(setting.team_members_limit ?? "") ||
              draft.conversationHistoryDays !== String(setting.conversation_history_days ?? "") ||
              draft.leadsPerMonth !== String(setting.leads_per_month_limit ?? "") ||
              draft.automationRules !== String(setting.automation_rules_limit ?? "") ||
              draft.dailyImageLimit !== String(setting.daily_image_limit ?? "") ||
              draft.dailyVideoLimit !== String(setting.daily_video_limit ?? "") ||
              draft.maxVideoSeconds !== String(setting.max_video_seconds ?? "") ||
              draft.featureJson !== serializedCurrentFeatures;

            return (
              <div key={setting.id} className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground capitalize">
                      {setting.plan_key.replace(/_/g, " ")}
                    </p>
                    {setting.is_donation && <Badge variant="secondary" className="text-xs">Donation</Badge>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!hasChanges || updatePrice.isPending}
                    onClick={() => {
                      try {
                        const featureEntitlements = setting.is_donation ? undefined : JSON.parse(draft.featureJson || "{}");
                        updatePrice.mutate({
                          id: setting.id,
                          plan_key: setting.plan_key,
                          is_donation: setting.is_donation,
                          monthly_price: Number(draft.monthly || 0),
                          annual_price: Number(draft.annual || 0),
                          donation_label: draft.label || undefined,
                          social_profiles_limit: numericOrNull(draft.socialProfiles),
                          channels_limit: numericOrNull(draft.channels),
                          keywords_limit: numericOrNull(draft.keywords),
                          keywords_per_group_limit: numericOrNull(draft.keywordsPerGroup),
                          ai_replies_per_day_limit: numericOrNull(draft.aiRepliesPerDay),
                          team_members_limit: numericOrNull(draft.teamMembers),
                          conversation_history_days: numericOrNull(draft.conversationHistoryDays),
                          leads_per_month_limit: numericOrNull(draft.leadsPerMonth),
                          automation_rules_limit: numericOrNull(draft.automationRules),
                          daily_image_limit: numericOrNull(draft.dailyImageLimit),
                          daily_video_limit: numericOrNull(draft.dailyVideoLimit),
                          max_video_seconds: numericOrNull(draft.maxVideoSeconds),
                          feature_entitlements: featureEntitlements,
                        });
                      } catch {
                        toast.error("Feature entitlements JSON is invalid");
                      }
                    }}
                  >
                    <Save className="h-3 w-3 mr-1" /> Save
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Monthly $</span>
                    <Input type="number" value={draft.monthly} onChange={(e) => setField(setting.id, setting, "monthly", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Annual $</span>
                    <Input type="number" value={draft.annual} onChange={(e) => setField(setting.id, setting, "annual", e.target.value)} />
                  </div>
                  {setting.is_donation ? (
                    <div className="space-y-1 md:col-span-2 xl:col-span-4">
                      <span className="text-xs text-muted-foreground">Donation label</span>
                      <Input value={draft.label} onChange={(e) => setField(setting.id, setting, "label", e.target.value)} />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">Social profiles</span><Input type="number" value={draft.socialProfiles} onChange={(e) => setField(setting.id, setting, "socialProfiles", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">Channels</span><Input type="number" value={draft.channels} onChange={(e) => setField(setting.id, setting, "channels", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">Keywords</span><Input type="number" value={draft.keywords} onChange={(e) => setField(setting.id, setting, "keywords", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">Keywords/group</span><Input type="number" value={draft.keywordsPerGroup} onChange={(e) => setField(setting.id, setting, "keywordsPerGroup", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">AI replies/day</span><Input type="number" value={draft.aiRepliesPerDay} onChange={(e) => setField(setting.id, setting, "aiRepliesPerDay", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">Team members</span><Input type="number" value={draft.teamMembers} onChange={(e) => setField(setting.id, setting, "teamMembers", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">History days</span><Input type="number" value={draft.conversationHistoryDays} onChange={(e) => setField(setting.id, setting, "conversationHistoryDays", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">Leads/month</span><Input type="number" value={draft.leadsPerMonth} onChange={(e) => setField(setting.id, setting, "leadsPerMonth", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">Automation rules</span><Input type="number" value={draft.automationRules} onChange={(e) => setField(setting.id, setting, "automationRules", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">Daily images</span><Input type="number" value={draft.dailyImageLimit} onChange={(e) => setField(setting.id, setting, "dailyImageLimit", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">Daily videos</span><Input type="number" value={draft.dailyVideoLimit} onChange={(e) => setField(setting.id, setting, "dailyVideoLimit", e.target.value)} /></div>
                      <div className="space-y-1"><span className="text-xs text-muted-foreground">Max video sec</span><Input type="number" value={draft.maxVideoSeconds} onChange={(e) => setField(setting.id, setting, "maxVideoSeconds", e.target.value)} /></div>
                    </>
                  )}
                </div>

                {!setting.is_donation && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Feature entitlements JSON</span>
                    <Textarea
                      value={draft.featureJson}
                      onChange={(e) => setField(setting.id, setting, "featureJson", e.target.value)}
                      rows={8}
                      className="font-mono text-xs"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
