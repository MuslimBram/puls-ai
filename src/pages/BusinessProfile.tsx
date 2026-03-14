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
import { Building2 } from "lucide-react";
import { businessProfileFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";
import { supabase } from "@/integrations/supabase/client";

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
      if (data?.reply) setter(data.reply.trim());
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

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Business Profile</h1>
            <p className="text-sm text-muted-foreground">Configure your business details for AI-powered lead discovery</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Information</CardTitle>
                <CardDescription>Tell us about your business</CardDescription>
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
                    <FormLabel>Main Services</FormLabel>
                    <FormControl><Textarea placeholder="List your main services" rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mission_values" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mission & Values</FormLabel>
                    <FormControl><Textarea placeholder="Your company mission and core values" rows={3} {...field} /></FormControl>
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
                      <FormLabel>AI Tone</FormLabel>
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
                      <FormLabel>Language</FormLabel>
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

            <Button type="submit" className="w-full" disabled={upsert.isPending}>
              {upsert.isPending ? "Saving..." : profile ? "Update Profile" : "Create Profile"}
            </Button>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
};

export default BusinessProfile;
