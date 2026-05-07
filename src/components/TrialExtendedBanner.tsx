import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Gift } from "lucide-react";

/**
 * Banner shown on dashboard if the user's trial was auto-extended.
 * Reads subscriptions.trial_extended_at; dismissal stored locally.
 */
export const TrialExtendedBanner = () => {
  const { user } = useAuth();
  const [extension, setExtension] = useState<{ days: number; newEnd: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem(`trial-ext-seen:${user.id}`)) { setDismissed(true); return; }
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("trial_extended_at, trial_extension_days, trial_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.trial_extended_at && data.trial_extension_days && data.trial_end) {
        setExtension({ days: data.trial_extension_days, newEnd: new Date(data.trial_end).toLocaleDateString() });
      }
    })();
  }, [user]);

  if (!extension || dismissed) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <Gift className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">Your trial was extended by {extension.days} days 🎁</div>
            <div className="text-xs text-muted-foreground">New end date: {extension.newEnd}</div>
          </div>
        </div>
        <button
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => { localStorage.setItem(`trial-ext-seen:${user!.id}`, "1"); setDismissed(true); }}
        >
          Dismiss
        </button>
      </CardContent>
    </Card>
  );
};
