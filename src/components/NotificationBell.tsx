import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useBusinessNotifications } from "@/hooks/useBusinessInsights";
import { format, parseISO } from "date-fns";

const typeColors: Record<string, string> = {
  info: "border-l-primary",
  recommendation: "border-l-yellow-500",
  warning: "border-l-orange-500",
  critical: "border-l-destructive",
};

export const NotificationBell = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useBusinessNotifications();
  const [open, setOpen] = useState(false);

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
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-auto py-1" onClick={() => markAllRead.mutate()}>
                Mark all read
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-xs h-auto py-1" onClick={() => { setOpen(false); navigate("/business-insights"); }}>
              View all
            </Button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            notifications.slice(0, 15).map((n) => (
              <div
                key={n.id}
                className={`border-b border-border border-l-2 px-4 py-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors ${
                  typeColors[n.notification_type] || "border-l-border"
                } ${n.is_read ? "opacity-60" : ""}`}
                onClick={() => {
                  markRead.mutate(n.id);
                  if (n.action_url) { setOpen(false); navigate(n.action_url); }
                }}
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-foreground font-medium text-xs line-clamp-1">{n.title}</p>
                  <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{n.notification_type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {(() => { try { return format(parseISO(n.created_at), "MMM d, HH:mm"); } catch { return "—"; } })()}
                </p>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
