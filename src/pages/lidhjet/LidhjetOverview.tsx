import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Users, Briefcase, Tag, ShieldCheck, ArrowRight, HeartHandshake, Sparkles, AlertCircle } from "lucide-react";

export default function LidhjetOverview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkProfile() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from("community_profiles")
          .select("status, verification_status, under_review_until")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Error fetching community profile:", error.message);
        }

        if (data) {
          setProfileStatus(data.status);
        } else {
          setProfileStatus(null);
        }
      } catch (err) {
        console.error("Error checking community profile:", err);
      } finally {
        setLoading(false);
      }
    }

    checkProfile();
  }, [user]);

  const handleEnterLidhjet = () => {
    if (!profileStatus) {
      navigate("/lidhjet/onboarding");
    } else {
      navigate("/lidhjet/feed");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8 py-4">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card via-card/90 to-primary/5 p-8 border border-border shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-3 py-1 font-semibold text-xs tracking-wide">
                  NATIVE MODULE • FREE
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  v2.3.1
                </Badge>
              </div>

              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                Lidhjet — Business ↔ People Community
              </h1>

              <p className="text-muted-foreground text-base leading-relaxed">
                Empowering individuals and businesses to connect, trade, publish job offers, hire services, and collaborate seamlessly within a safe, AI-moderated community network.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row md:flex-col gap-3 w-full md:w-auto">
              <Button size="lg" onClick={handleEnterLidhjet} className="gap-2 font-medium">
                {profileStatus ? "Enter Lidhjet Feed" : "Activate Free Profile"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/lidhjet/interests")} className="gap-2">
                My Interests
              </Button>
            </div>
          </div>
        </div>

        {/* Profile Status Alert */}
        {!loading && !profileStatus && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Community Profile Inactive</p>
                <p className="text-xs text-muted-foreground">Activate your free community profile to publish posts and interact with others.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate("/lidhjet/onboarding")}>
              Onboard Now
            </Button>
          </div>
        )}

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-2">
                <Briefcase className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Publish Offers & Services</CardTitle>
              <CardDescription>
                Create structured listings across Jobs (Punë), Services (Shërbim), Trade (Tregti), and Other categories with predefined price bands.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-2">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Safe Interests & Offers</CardTitle>
              <CardDescription>
                Submit offers on community posts. Sellers pay a nominal service tax via EUR wallet to unlock direct messaging.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-2">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">AI & Staff Moderation</CardTitle>
              <CardDescription>
                Server-side contact policy detection protects user safety. User reports are reviewed by staff before confirming violations.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Categories Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Supported Community Price Bands
            </CardTitle>
            <CardDescription>Price bands enforced natively across Lidhjet categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                <p className="font-semibold text-foreground">Punë (Jobs)</p>
                <p className="text-xs text-muted-foreground mt-1">200 - 200,000 ALL</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                <p className="font-semibold text-foreground">Shërbim (Services)</p>
                <p className="text-xs text-muted-foreground mt-1">300 - 300,000 ALL</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                <p className="font-semibold text-foreground">Tregti (Trade)</p>
                <p className="text-xs text-muted-foreground mt-1">100 - 2,000,000 ALL</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                <p className="font-semibold text-foreground">Tjetër (Other)</p>
                <p className="text-xs text-muted-foreground mt-1">0 - 5,000,000 ALL</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
