import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2 } from "lucide-react";
import type { IndustryPack } from "@/hooks/useIndustryPacks";

type Props = {
  pack: IndustryPack | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (pack: IndustryPack) => Promise<unknown>;
  alreadyInstalled?: boolean;
};

export function IndustryPackInstallDialog({
  pack,
  open,
  onOpenChange,
  onConfirm,
  alreadyInstalled,
}: Props) {
  const [installing, setInstalling] = useState(false);

  if (!pack) return null;
  const c = pack.contents ?? {};

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await onConfirm(pack);
      onOpenChange(false);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {pack.name}
            <Badge variant="secondary" className="text-[10px]">v{pack.version}</Badge>
          </DialogTitle>
          <DialogDescription>{pack.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {c.pipeline && (
            <Section title={`Pipeline · ${c.pipeline.stages.length} stages`}>
              <div className="flex flex-wrap gap-1.5">
                {c.pipeline.stages.map((s) => (
                  <Badge
                    key={s.name}
                    variant="outline"
                    style={{ borderColor: s.color, color: s.color }}
                    className="text-xs"
                  >
                    {s.name}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {c.automations && c.automations.length > 0 && (
            <Section title={`Automations · ${c.automations.length}`}>
              <ul className="space-y-1 text-muted-foreground">
                {c.automations.map((a) => (
                  <li key={a.name} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                    {a.name}
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {a.trigger_type}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Installed as inactive — review and turn on in Automations.
              </p>
            </Section>
          )}

          {c.broadcasts && c.broadcasts.length > 0 && (
            <Section title={`Broadcast templates · ${c.broadcasts.length}`}>
              <ul className="space-y-1 text-muted-foreground">
                {c.broadcasts.map((b) => (
                  <li key={b.name} className="flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px]">{b.channel}</Badge>
                    <span className="text-xs truncate">{b.body}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {c.knowledge && c.knowledge.length > 0 && (
            <Section title={`Knowledge base · ${c.knowledge.length} entries`}>
              <ul className="space-y-1 text-muted-foreground">
                {c.knowledge.map((k) => (
                  <li key={k.title}>· {k.title}</li>
                ))}
              </ul>
            </Section>
          )}

          {c.widgets && c.widgets.length > 0 && (
            <Section title={`Dashboard widgets · ${c.widgets.length}`}>
              <ul className="space-y-1 text-muted-foreground">
                {c.widgets.map((w) => (
                  <li key={w.key}>· {w.title}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={installing}>
            Cancel
          </Button>
          <Button onClick={handleInstall} disabled={installing || alreadyInstalled}>
            {installing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {alreadyInstalled ? "Already installed" : "Install pack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-medium mb-2">{title}</div>
      {children}
      <Separator className="mt-3" />
    </div>
  );
}
