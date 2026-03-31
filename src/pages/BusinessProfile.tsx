import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useBusinessProfile, BusinessProfileData } from "@/hooks/useBusinessProfile";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Handshake, Lock, AlertTriangle, Link2 } from "lucide-react";
import { businessProfileFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useRolePermissions } from "@/hooks/useRolePermissions";

const schema = z.object({
  business_name: z.string().min(1, "Business name is required").max(100),
  short_description: z.string().max(500).optional().default(""),
  industry: z.string().max(100).optional().default(""),
  target_audience: z.string().max(500).optional().default(""),
  mission_values: z.string().max(1000).optional().default(""),
  main_services: z.string().max(1000).optional().default(""),
  ai_tone: z.string().default("professional"),
  language: z.string().default("en"),
});

const toneOptions = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "persuasive", label: "Persuasive" },
];

const languageOptions = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
];

const BusinessProfile = () => {
  const { profile, isLoading, upsert } = useBusinessProfile();
  const [aiField, setAiField] = useState<string | null>(null);
  const { workspace: currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { roles, isAdmin } = useRolePermissions();

  const accountType = user?.user_metadata?.account_type;
  const isFreelancer = accountType === "freelancer" || roles.includes("freelancer" as any);
  const isAmbassador = accountType === "ambassador" || roles.includes("ambassador" as any);

  // Check if freelancer has paid for this business (subscription with payment_status = 'paid')
  const { data: subscription } = useQuery({
    queryKey: ["user-subscription-status", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("payment_status, plan, trial_end")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const hasPaidSubscription = subscription?.payment_status === "paid";
  const isInActiveTrial = subscription?.payment_status === "trial" && 
    subscription?.trial_end && new Date(subscription.trial_end) > new Date();
  
  // Ambassadors are referral-only — they don't manage businesses and don't buy packages
  // Freelancers need to have paid or be in active trial
  const freelancerCanAccessProfile = isAdmin || (!isFreelancer && !isAmbassador) || hasPaidSubscription || isInActiveTrial;

  // Fetch partner ownership info
  const { data: ownerPartner } = useQuery({
    queryKey: ["workspace-owner-partner", currentWorkspace?.id],
    queryFn: async () => {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("workspace_owner_partner_id, referred_by_partner_id, payment_mode")
        .eq("id", currentWorkspace!.id)
        .maybeSingle();
      if (!ws?.workspace_owner_partner_id && !ws?.referred_by_partner_id) return null;
      const partnerId = ws.workspace_owner_partner_id || ws.referred_by_partner_id;
      const { data: partner } = await supabase
        .from("partner_accounts")
        .select("partner_name, referral_code")
        .eq("id", partnerId!)
        .maybeSingle();
      return partner ? { ...partner, payment_mode: ws.payment_mode } : null;
    },
    enabled: !!currentWorkspace?.id,
  });

  // Count social channels linked to this workspace
  const { data: socialChannelCount = 0 } = useQuery({
    queryKey: ["social-channel-count", currentWorkspace?.id],
    queryFn: async () => {
      const { count, error } = await (supabase
        .from("channel_registry") as any)
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", currentWorkspace!.id)
        .eq("is_active", true);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!currentWorkspace?.id,
  });

  const form = useForm<BusinessProfileData>({
    resolver: zodResolver(schema),
    defaultValues: {
      business_name: "",
      short_description: "",
      industry: "",
      target_audience: "",
      mission_values: "",
      main_services: "",
      ai_tone: "professional",
      language: "en",
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        business_name: profile.business_name,
        short_description: profile.short_description || "",
        industry: profile.industry || "",
        target_audience: profile.target_audience || "",
        mission_values: profile.mission_values || "",
        main_services: profile.main_services || "",
        ai_tone: profile.ai_tone || "professional",
        language: profile.language || "en",
      });
    }
  }, [profile, form]);

  const onSubmit = (values: BusinessProfileData) => {
    upsert.mutate(values);
  };

  const aiSuggest = async (fieldId: string, prompt: string, setter: (v: string) => void) => {
    setAiField(fieldId);
    try {
      const { data } = await supabase.functions.invoke("ai-sales-assistant", {
        body: { prompt },
      });
      if (data?.result) setter(data.result.trim());
    } catch {} finally { setAiField(null); }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  // Ambassadors are referral-only — they cannot manage business profiles
  if (isAmbassador && !isAdmin) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-lg py-12">
          <Card className="border-muted">
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Handshake className="h-7 w-7 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground text-center">
                Referrals Only
              </h2>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Your account is Ambassador type — you earn commission from business referrals. Business profile is not available for this account type.
              </p>
              <Button variant="outline" onClick={() => window.location.href = "/dashboard"} className="mt-2">
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Gate for freelancers without paid subscription
  if (!freelancerCanAccessProfile) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-lg py-12">
          <Card className="border-destructive/30">
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <Lock className="h-7 w-7 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-foreground text-center">
                Business Profile Locked
              </h2>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                To complete the business profile, you need to purchase one of the plans (Start, Growth, PRO, or Enterprise) with your applicable discount.
                <br /><br />
                Each business you register requires its own plan.
              </p>
              <Button onClick={() => window.location.href = "/complete-payment"} className="mt-2">
                Buy Plan
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Business Profile</h1>
            <p className="text-sm text-muted-foreground">Configure your business details so AI can suggest posts, competitors and audience</p>
          </div>
        </div>

        {/* Minimum 2 social channels notice */}
        {socialChannelCount < 2 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-3 py-4">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Connect at least 2 social channels
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  To enable AI suggestions for posts, competitors and audience, connect at least 2 social networks (e.g. Instagram & LinkedIn).
                  You currently have {socialChannelCount} channel{socialChannelCount !== 1 ? "s" : ""}.
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.href = "/channels"}>
                  <Link2 className="h-3 w-3 mr-1" /> Connect Channels
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info card: fill as much as possible */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">💡 Fill in as much information as possible</strong> — AI uses this data to suggest what to post, analyze competitors, and select the right audience.
            </p>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Partner ownership badge */}
            {ownerPartner && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex items-center gap-3 py-4">
                  <Handshake className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Managed by Partner: {ownerPartner.partner_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {ownerPartner.referral_code && (
                        <Badge variant="outline" className="text-xs">Code: {ownerPartner.referral_code}</Badge>
                      )}
                      <Badge variant="secondary" className="text-xs capitalize">
                        {(ownerPartner as any).payment_mode?.replace("_", " ") || "Undeclared"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Information</CardTitle>
                <CardDescription>Tell us about your business — more details mean better AI suggestions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="business_name" render={({ field }) => (
                  <FormItem>
                    <FieldLabelWithGuide label="Business Name *" guide={getFieldGuide(businessProfileFieldGuides, "business_name")!} />
                    <FormControl><Input placeholder="Your company name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="short_description" render={({ field }) => (
                  <FormItem>
                    <FieldLabelWithGuide
                      label="Short Description"
                      guide={getFieldGuide(businessProfileFieldGuides, "short_description")!}
                      onAiSuggest={() => aiSuggest("short_description", `Write a 1-2 sentence business description for a ${form.getValues("industry") || "general"} company named "${form.getValues("business_name")}". Return only the description.`, (v) => form.setValue("short_description", v))}
                      isAiLoading={aiField === "short_description"}
                    />
                    <FormControl><Textarea placeholder="Brief description of your business" rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="industry" render={({ field }) => (
                    <FormItem>
                      <FieldLabelWithGuide label="Industry" guide={getFieldGuide(businessProfileFieldGuides, "industry")!} />
                      <FormControl><Input placeholder="e.g. Technology, Marketing" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="target_audience" render={({ field }) => (
                    <FormItem>
                      <FieldLabelWithGuide
                        label="Target Audience"
                        guide={getFieldGuide(businessProfileFieldGuides, "target_audience")!}
                        onAiSuggest={() => aiSuggest("target_audience", `Suggest a target audience for a ${form.getValues("industry") || "general"} business offering ${form.getValues("main_services") || "services"}. Return 1 sentence.`, (v) => form.setValue("target_audience", v))}
                        isAiLoading={aiField === "target_audience"}
                      />
                      <FormControl><Input placeholder="e.g. Small businesses, Startups" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Services & Values</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="main_services" render={({ field }) => (
                  <FormItem>
                    <FieldLabelWithGuide
                      label="Main Services"
                      guide={getFieldGuide(businessProfileFieldGuides, "main_services")!}
                      onAiSuggest={() => aiSuggest("main_services", `List 3-5 main services for a ${form.getValues("industry") || "general"} company named "${form.getValues("business_name")}". Return a comma-separated list.`, (v) => form.setValue("main_services", v))}
                      isAiLoading={aiField === "main_services"}
                    />
                    <FormControl><Textarea placeholder="List your main services" rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mission_values" render={({ field }) => (
                  <FormItem>
                    <FieldLabelWithGuide
                      label="Mission & Values"
                      guide={getFieldGuide(businessProfileFieldGuides, "mission_values")!}
                      onAiSuggest={() => aiSuggest("mission_values", `Write a short mission statement for a ${form.getValues("industry") || "general"} company named "${form.getValues("business_name")}". Return 1-2 sentences.`, (v) => form.setValue("mission_values", v))}
                      isAiLoading={aiField === "mission_values"}
                    />
                    <FormControl><Textarea placeholder="Your company's mission and core values" rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">AI Configuration</CardTitle>
                <CardDescription>How should AI communicate on your behalf?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="ai_tone" render={({ field }) => (
                    <FormItem>
                      <FieldLabelWithGuide label="AI Tone" guide={getFieldGuide(businessProfileFieldGuides, "ai_tone")!} />
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {toneOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="language" render={({ field }) => (
                    <FormItem>
                      <FieldLabelWithGuide label="Language" guide={getFieldGuide(businessProfileFieldGuides, "language")!} />
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {languageOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" disabled={upsert.isPending || socialChannelCount < 2}>
              {socialChannelCount < 2
                ? "Connect at least 2 channels to save"
                : upsert.isPending ? "Saving..." : profile ? "Update Profile" : "Create Profile"}
            </Button>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
};

export default BusinessProfile;
