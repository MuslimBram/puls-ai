import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserCheck, ShieldCheck } from "lucide-react";

export interface PublicProfile {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  offer_type: string | null;
}

export function PublicProfilesList() {
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPublicProfiles() {
      try {
        // Call RPC community_list_public_profiles
        const { data, error } = await supabase.rpc("community_list_public_profiles" as never);

        if (error) {
          console.error("Error loading public profiles:", error.message);
        } else {
          setProfiles((data as PublicProfile[]) || []);
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPublicProfiles();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground bg-card rounded-xl border border-border p-4">
        No public community profiles directory available yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
          <UserCheck className="h-4 w-4 text-emerald-500" />
          Verified Public Community Members
        </h3>
        <Badge variant="outline" className="text-[10px]">
          {profiles.length} Verified
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {profiles.map((profile) => (
          <Card key={profile.user_id} className="p-3 text-center hover:border-primary/40 transition-colors">
            <CardContent className="p-0 flex flex-col items-center space-y-2">
              <Avatar className="h-10 w-10 border border-border">
                <AvatarImage src={profile.avatar_url || ""} />
                <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                  {(profile.full_name || "Member").substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="space-y-0.5 max-w-full truncate">
                <p className="text-xs font-semibold text-foreground truncate">
                  {profile.full_name || "Community Member"}
                </p>
                {profile.offer_type && (
                  <Badge variant="secondary" className="text-[9px] uppercase px-1.5 py-0">
                    {profile.offer_type}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
