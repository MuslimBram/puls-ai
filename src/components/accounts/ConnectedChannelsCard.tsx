import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link2, Link2Off, Plus } from "lucide-react";
import { format } from "date-fns";
import { useChannels } from "@/hooks/useChannels";
import { iconFor } from "./channelIcons";

interface Props {
  onConnectClick: () => void;
}

export const ConnectedChannelsCard = ({ onConnectClick }: Props) => {
  const { channels } = useChannels();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link2 className="h-5 w-5 text-primary" />
            Connected Channels
          </CardTitle>
          <CardDescription>
            Each channel is authorized independently. Logging in does not auto-connect channels.
          </CardDescription>
        </div>
        <Button size="sm" onClick={onConnectClick}>
          <Plus className="h-4 w-4 mr-1" />
          Connect
        </Button>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Link2Off className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No channels connected yet.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onConnectClick}>
              Connect a Channel
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {channels.map((ch) => {
              const Icon = iconFor(ch.channel_type);
              return (
                <div
                  key={ch.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{ch.channel_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ch.channel_type} · Added {format(new Date(ch.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        ch.connection_status === "connected"
                          ? "default"
                          : ch.connection_status === "needs_config"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {ch.connection_status === "connected"
                        ? "Connected"
                        : ch.connection_status === "needs_config"
                        ? "Needs Config"
                        : "Disconnected"}
                    </Badge>
                    <Badge variant={ch.is_enabled ? "default" : "secondary"}>
                      {ch.is_enabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
