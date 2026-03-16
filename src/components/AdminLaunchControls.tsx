import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { Shield, Megaphone, AlertTriangle, Rocket } from "lucide-react";

export const AdminLaunchControls = () => {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState("");
  const [sending, setSending] = useState(false);

  const handleBroadcastAnnouncement = async () => {
    if (!announcement.trim() || !user) return;
    setSending(true);
    try {
      // Get all user IDs from profiles
      const { data: profiles } = await supabase.from("profiles").select("user_id");
      if (!profiles?.length) throw new Error("No users found");

      const notifications = profiles.map((p) => ({
        user_id: p.user_id,
        title: "System Announcement",
        message: announcement.trim(),
        notification_type: "info" as const,
        category: "system",
      }));

      const { error } = await supabase.from("business_notifications").insert(notifications);
      if (error) throw error;

      toast.success(`Announcement sent to ${profiles.length} users`);
      setAnnouncement("");
    } catch (e: any) {
      toast.error(e.message || "Failed to send announcement");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> Registration Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">New registrations</span>
              <Badge variant="default" className="text-xs">Open</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Registration control is managed through authentication settings.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Rocket className="h-4 w-4" /> Platform Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">System mode</span>
              <Badge variant="default" className="text-xs">Live</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              All services are operational. Maintenance mode can be activated via edge function config.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Broadcast Announcement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Write a system-wide announcement..."
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            rows={3}
          />
          <Button
            size="sm"
            onClick={handleBroadcastAnnouncement}
            disabled={!announcement.trim() || sending}
          >
            {sending ? "Sending..." : "Send to All Users"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
