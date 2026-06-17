import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Check } from "lucide-react";
import * as Icons from "lucide-react";
import type { IndustryPack } from "@/hooks/useIndustryPacks";

type Props = {
  pack: IndustryPack;
  installed?: boolean;
  onPreview: (pack: IndustryPack) => void;
};

export function IndustryPackCard({ pack, installed, onPreview }: Props) {
  const IconCmp =
    (pack.icon && (Icons as Record<string, unknown>)[pack.icon] as React.ComponentType<{ className?: string }>) ||
    Icons.Package;
  const c = pack.contents ?? {};
  const color = pack.color || "#6366f1";

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${color}1a`, color }}
            >
              <IconCmp className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{pack.name}</CardTitle>
              <CardDescription className="text-xs capitalize">
                {pack.industry.replace("_", " ")}
              </CardDescription>
            </div>
          </div>
          {installed && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Check className="h-3 w-3" /> Installed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground line-clamp-2">{pack.description}</p>
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <Badge variant="outline">{c.pipeline?.stages?.length ?? 0} stages</Badge>
          <Badge variant="outline">{c.automations?.length ?? 0} automations</Badge>
          <Badge variant="outline">{c.broadcasts?.length ?? 0} templates</Badge>
          <Badge variant="outline">{c.knowledge?.length ?? 0} KB</Badge>
          <Badge variant="outline">{c.widgets?.length ?? 0} widgets</Badge>
        </div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Download className="h-3 w-3" />
            {pack.install_count}
          </span>
          <Button size="sm" variant={installed ? "outline" : "default"} onClick={() => onPreview(pack)}>
            {installed ? "View details" : "Preview & install"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
