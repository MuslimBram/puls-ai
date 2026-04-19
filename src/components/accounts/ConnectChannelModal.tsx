import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, ExternalLink, ArrowLeft, Plus } from "lucide-react";
import { useChannelRegistry, type ChannelRegistryItem } from "@/hooks/useChannelRegistry";
import { useChannels } from "@/hooks/useChannels";
import { iconFor } from "./channelIcons";
import { toast } from "@/components/ui/sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ConnectChannelModal = ({ open, onOpenChange }: Props) => {
  const { registry, isLoading } = useChannelRegistry();
  const { addChannel } = useChannels();
  const [selected, setSelected] = useState<ChannelRegistryItem | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [name, setName] = useState("");

  const grouped = useMemo(() => {
    const m = new Map<string, ChannelRegistryItem[]>();
    for (const item of registry) {
      const arr = m.get(item.category) ?? [];
      arr.push(item);
      m.set(item.category, arr);
    }
    return Array.from(m.entries());
  }, [registry]);

  const reset = () => {
    setSelected(null);
    setCredentials({});
    setName("");
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const handleSelect = (item: ChannelRegistryItem) => {
    setSelected(item);
    setName(item.name);
  };

  const handleSubmit = async () => {
    if (!selected) return;
    const missing = selected.credential_fields
      .filter((f) => f.required && !credentials[f.key]?.trim())
      .map((f) => f.label);
    if (missing.length > 0) {
      toast.error(`Missing: ${missing.join(", ")}`);
      return;
    }
    try {
      await addChannel.mutateAsync({
        channel_type: selected.id,
        channel_name: name.trim() || selected.name,
        connection_mode: "professional",
        provider_metadata: { credentials },
      });
      close();
    } catch {
      // toast handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            {selected && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reset}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1">
              <DialogTitle>
                {selected ? `Connect ${selected.name}` : "Connect a New Channel"}
              </DialogTitle>
              <DialogDescription>
                {selected
                  ? selected.description
                  : "Choose where you want to talk to your audience."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!selected && (
          <ScrollArea className="max-h-[60vh]">
            <div className="p-6 space-y-6">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                grouped.map(([category, items]) => (
                  <div key={category} className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {category.replace(/_/g, " ")}
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {items.map((item) => {
                        const Icon = iconFor(item.id);
                        const live = item.integration_status === "live";
                        const comingSoon = !item.is_available;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={comingSoon}
                            onClick={() => handleSelect(item)}
                            className="group relative flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                                <Icon className="h-5 w-5" />
                              </div>
                              {live && (
                                <Badge variant="default" className="text-[10px] px-1.5">
                                  Live
                                </Badge>
                              )}
                              {comingSoon && (
                                <Badge variant="secondary" className="text-[10px] px-1.5">
                                  Soon
                                </Badge>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{item.name}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {item.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {/* Request a channel card */}
              <div className="rounded-lg border border-dashed border-border p-4 flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Need another channel?</p>
                  <p className="text-xs text-muted-foreground">
                    Tell us what you'd like to connect next.
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <a href="mailto:support@kohablerjeve.top?subject=Channel%20request">
                    <Plus className="h-4 w-4 mr-1" />
                    Request
                  </a>
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}

        {selected && (
          <div className="p-6 space-y-4">
            {selected.setup_instructions && (
              <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                {selected.setup_instructions}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ch-name">Display name</Label>
              <Input
                id="ch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={selected.name}
              />
            </div>

            {selected.credential_fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Input
                  id={field.key}
                  type={field.type === "password" ? "password" : "text"}
                  placeholder={field.placeholder}
                  value={credentials[field.key] ?? ""}
                  onChange={(e) =>
                    setCredentials((c) => ({ ...c, [field.key]: e.target.value }))
                  }
                />
              </div>
            ))}

            {selected.help_url && (
              <a
                href={selected.help_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Where do I find these? <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={addChannel.isPending}>
                {addChannel.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Connect {selected.name}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
