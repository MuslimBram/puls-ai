import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { useKeywords } from "@/hooks/useKeywords";
import { useChannels } from "@/hooks/useChannels";
import { useLeads } from "@/hooks/useLeads";
import { useMemo } from "react";

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
  completed: boolean;
  weight: number;
}

export const useOnboarding = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { profile } = useBusinessProfile();
  const { keywords } = useKeywords();
  const { channels } = useChannels();
  const { leads } = useLeads();

  const progressQuery = useQuery({
    queryKey: ["onboarding-progress", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_progress" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!user,
  });

  const steps: OnboardingStep[] = useMemo(() => {
    const hasProfile = !!profile?.business_name;
    const profileComplete = hasProfile && !!profile?.industry && !!profile?.target_audience && !!profile?.main_services;
    const hasKeywords = (keywords ?? []).length > 0;
    const hasChannel = (channels ?? []).length > 0;
    const hasTelegram = (channels ?? []).some((c) => c.channel_type === "telegram" && c.is_enabled);
    const hasLeads = (leads ?? []).length > 0;

    return [
      {
        id: "business_profile",
        label: "Complete Business Profile",
        description: "Add your business name, industry, services, and target audience for AI context.",
        href: "/business-profile",
        completed: profileComplete,
        weight: 25,
      },
      {
        id: "keywords",
        label: "Add Monitoring Keywords",
        description: "Define keywords to discover leads from conversations across channels.",
        href: "/keywords",
        completed: hasKeywords,
        weight: 20,
      },
      {
        id: "channels",
        label: "Connect a Channel",
        description: "Connect Telegram, Email, Website Chat, or another communication channel.",
        href: "/channels",
        completed: hasChannel,
        weight: 20,
      },
      {
        id: "competitors",
        label: "Add a Competitor",
        description: "Track at least one competitor to unlock competitive intelligence insights.",
        href: "/competitor-intelligence",
        completed: false, // Will be checked dynamically
        weight: 15,
      },
      {
        id: "campaigns",
        label: "Create First Campaign",
        description: "Launch an AI-powered marketing campaign with strategy generation.",
        href: "/campaigns",
        completed: false,
        weight: 10,
      },
      {
        id: "leads",
        label: "Lead Discovery Active",
        description: "Start receiving and managing discovered leads in your inbox.",
        href: "/leads",
        completed: hasLeads,
        weight: 10,
      },
    ];
  }, [profile, keywords, channels, leads]);

  const completionScore = useMemo(() => {
    const totalWeight = steps.reduce((sum, s) => sum + s.weight, 0);
    const completedWeight = steps.filter((s) => s.completed).reduce((sum, s) => sum + s.weight, 0);
    return Math.round((completedWeight / totalWeight) * 100);
  }, [steps]);

  const isDismissed = progressQuery.data?.is_dismissed ?? false;

  const nextStep = steps.find((s) => !s.completed);

  const coachTips = useMemo(() => {
    const tips: { message: string; action: string; href: string }[] = [];
    if (!steps[0].completed) {
      tips.push({
        message: "Complete your business profile so AI can generate personalized content and replies.",
        action: "Set up profile",
        href: "/business-profile",
      });
    }
    if (!steps[1].completed) {
      tips.push({
        message: "Add keywords to start discovering leads from conversations across your channels.",
        action: "Add keywords",
        href: "/keywords",
      });
    }
    if (!steps[2].completed) {
      tips.push({
        message: "You'll start getting leads faster if you connect at least one messaging channel.",
        action: "Connect channel",
        href: "/channels",
      });
    }
    if (steps[0].completed && steps[1].completed && !steps[3].completed) {
      tips.push({
        message: "Track competitors to discover market opportunities and improve your positioning.",
        action: "Add competitor",
        href: "/competitor-intelligence",
      });
    }
    return tips;
  }, [steps]);

  const dismiss = useMutation({
    mutationFn: async () => {
      if (progressQuery.data) {
        await supabase
          .from("onboarding_progress" as any)
          .update({ is_dismissed: true, updated_at: new Date().toISOString() } as any)
          .eq("id", (progressQuery.data as any).id);
      } else {
        await supabase
          .from("onboarding_progress" as any)
          .insert({
            user_id: user!.id,
            is_dismissed: true,
            completion_score: completionScore,
            steps_completed: Object.fromEntries(steps.map((s) => [s.id, s.completed])),
          } as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-progress"] });
    },
  });

  const reopen = useMutation({
    mutationFn: async () => {
      if (progressQuery.data) {
        await supabase
          .from("onboarding_progress" as any)
          .update({ is_dismissed: false, updated_at: new Date().toISOString() } as any)
          .eq("id", (progressQuery.data as any).id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-progress"] });
    },
  });

  return {
    steps,
    completionScore,
    isDismissed,
    nextStep,
    coachTips,
    dismiss,
    reopen,
    isLoading: progressQuery.isLoading,
  };
};
