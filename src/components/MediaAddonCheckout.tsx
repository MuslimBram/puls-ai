import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MEDIA_ADDON_PACKS } from "@/config/plans";
import { useMediaUsage } from "@/hooks/useMediaGeneration";
import { supabase } from "@/integrations/supabase/client";
import { Image, Video, ShoppingCart, Loader2, Zap } from "lucide-react";
import { toast } from "@/components/ui/sonner";

export const MediaAddonCheckout = () => {
  const usage = useMediaUsage();
  const [loading, setLoading] = useState<string | null>(null);

  const handlePurchase = async (pack: (typeof MEDIA_ADDON_PACKS)[0]) => {
    setLoading(pack.type);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          addonType: pack.type,
          addonLabel: pack.label,
          addonPrice: pack.price,
          addonQuantity: pack.quantity,
        },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  };

  const imagePacks = MEDIA_ADDON_PACKS.filter((p) => p.type.startsWith("image"));
  const videoPacks = MEDIA_ADDON_PACKS.filter((p) => p.type.startsWith("video"));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Extra Media Credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Running low? Purchase additional image or video generation credits.
          </p>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Image Packs</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {imagePacks.map((pack) => (
                <div key={pack.type} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{pack.label}</p>
                      <p className="text-xs text-muted-foreground">${pack.price}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePurchase(pack)}
                    disabled={loading === pack.type}
                  >
                    {loading === pack.type ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3 mr-1" />
                    )}
                    Buy
                  </Button>
                </div>
              ))}
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4">Video Packs</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {videoPacks.map((pack) => (
                <div key={pack.type} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{pack.label}</p>
                      <p className="text-xs text-muted-foreground">${pack.price}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePurchase(pack)}
                    disabled={loading === pack.type}
                  >
                    {loading === pack.type ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3 mr-1" />
                    )}
                    Buy
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
