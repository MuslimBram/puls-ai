import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

interface Notification {
  id: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export const NotificationBell = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!user) return;

    // Load recent high-intent leads as notifications
    const loadNotifications = async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, source_name, message_content, intent_score, created_at")
        .eq("user_id", user.id)
        .gte("intent_score", 0.7)
        .order("created_at", { ascending: false })
        .limit(10);

      if (data) {
        setNotifications(
          data.map((l) => ({
            id: l.id,
            message: `High-intent lead from ${l.source_name}: "${(l.message_content ?? "").slice(0, 60)}..."`,
            timestamp: l.created_at,
            read: false,
          }))
        );
      }
    };

    loadNotifications();

    // Subscribe to realtime new leads
    const channel = supabase
      .channel("lead-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const lead = payload.new as any;
          if (lead.intent_score >= 0.7) {
            setNotifications((prev) => [
              {
                id: lead.id,
                message: `New high-intent lead from ${lead.source_name}`,
                timestamp: lead.created_at,
                read: false,
              },
              ...prev,
            ].slice(0, 20));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-auto py-1" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`border-b border-border px-4 py-3 text-sm ${n.read ? "opacity-60" : ""}`}
              >
                <p className="text-foreground line-clamp-2">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(() => { try { return format(new Date(n.timestamp), "MMM d, HH:mm"); } catch { return "—"; } })()}
                </p>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
