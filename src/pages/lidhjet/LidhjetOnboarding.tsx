import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Clock, ArrowRight, Loader2 } from "lucide-react";

interface CommunityProfileRecord {
  user_id: string;
  status: string;
  verification_status: string;
  under_review_until: string;
  offer_type?: string | null;
}

export default function LidhjetOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [profile, setProfile] = useState<CommunityProfileRecord | null>(null);
  const [selectedOfferType, setSelectedOfferType] = useState<string>("pune");

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from("community_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Error loading community profile:", error.message);
        }

        if (data) {
          setProfile(data as CommunityProfileRecord);
          if (data.offer_type) {
            setSelectedOfferType(data.offer_type);
          }
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [user]);

  const handleActivateProfile = async () => {
    setActivating(true);
    try {
      // Call community_activate_profile RPC
      const { data, error } = await supabase.rpc("community_activate_profile" as never);

      if (error) {
        toast({
          title: "Activation Failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      // Update offer_type choice
      if (selectedOfferType) {
        await supabase
          .from("community_profiles")
          .update({ offer_type: selectedOfferType })
          .eq("user_id", user?.id);
      }

      setProfile(data as CommunityProfileRecord);
      toast({
        title: "Community Profile Activated!",
        description: "Your 24-hour review period has started. You can now browse and interact on Lidhjet.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to activate profile";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setActivating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6 py-6">
        <div className="text-center space-y-2">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            Lidhjet Onboarding
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">Activate Your Community Profile</h1>
          <p className="text-sm text-muted-foreground">
            Activate your free Lidhjet identity to participate in the Business ↔ People community.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Community Activation Agreement
            </CardTitle>
            <CardDescription>
              All community members undergo an initial 24-hour safety review window.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!profile ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Primary Offer Category
                  </label>
                  <Select value={selectedOfferType} onValueChange={setSelectedOfferType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select primary category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pune">Punë (Jobs & Hiring)</SelectItem>
                      <SelectItem value="sherbim">Shërbim (Professional Services)</SelectItem>
                      <SelectItem value="tregti">Tregti (Commerce & Trade)</SelectItem>
                      <SelectItem value="tjeter">Tjetër (General / Other)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 rounded-lg bg-muted/60 space-y-2 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Community Safety & Contact Policy:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Direct contact information (phone, email, social handles) in public posts/messages is strictly prohibited.</li>
                    <li>Sellers unlock direct chat after accepting an offer and paying a service tax via EUR wallet.</li>
                    <li>AI & staff monitor community interactions for safe operations.</li>
                  </ul>
                </div>

                <Button
                  onClick={handleActivateProfile}
                  disabled={activating}
                  className="w-full gap-2"
                  size="lg"
                >
                  {activating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Activate Free Profile
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Active / Under Review Badge */}
                <div className="p-4 rounded-xl bg-card border border-border flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Verification Status:</span>
                    <Badge variant={profile.verification_status === "approved" ? "default" : "secondary"}>
                      {profile.verification_status || "approved"}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Profile Status:</span>
                    <Badge variant="outline" className="uppercase text-xs">
                      {profile.status}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
                    <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>
                      Review window ends: {new Date(profile.under_review_until).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button onClick={() => navigate("/lidhjet/feed")} className="gap-2">
                    Proceed to Lidhjet Feed
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
