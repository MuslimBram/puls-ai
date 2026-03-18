import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { Shield, Megaphone, Rocket, Video } from "lucide-react";
import { AdminMediaStudioPanel } from "@/components/AdminMediaStudioPanel";

export const AdminLaunchControls = () => {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState("");
  const [sending, setSending] = useState(false);

  const handleBroadcastAnnouncement = async () => {
    if (!announcement.trim() || !user) return;
    setSending(true);

    try {
      const { data: profiles } = await supabase.from("profiles").select("user_id");
      if (!profiles?.length) throw new Error("No users found");

      const notifications = profiles.map((profile) => ({
        user_id: profile.user_id,
        title: "System Announcement",
        message: announcement.trim(),
        notification_type: "info" as const,
        category: "system",
      }));

      const { error } = await supabase.from("business_notifications").insert(notifications);
      if (error) throw error;

      toast.success(`Announcement sent to ${profiles.length} users`);
      setAnnouncement("");
    } catch (error: any) {
      toast.error(error.message || "Failed to send announcement");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" /> Registration status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">New registrations</span>
              <Badge variant="default" className="text-xs">Open</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Registration control is managed through authentication settings.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Rocket className="h-4 w-4" /> Platform status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">System mode</span>
              <Badge variant="default" className="text-xs">Live</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              All services are operational. Media generation workers and daily quota resets run automatically in the background.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Megaphone className="h-4 w-4" /> Broadcast announcement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Write a system-wide announcement..."
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            rows={3}
          />
          <Button size="sm" onClick={handleBroadcastAnnouncement} disabled={!announcement.trim() || sending}>
            {sending ? "Sending..." : "Send to all users"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Video className="h-4 w-4" /> Media Studio video architecture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AdminMediaStudioPanel />
        </CardContent>
      </Card>
    </div>
  );
};
