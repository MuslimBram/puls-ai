import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Globe, Search, Loader2, Save, Trash2, Eye, ExternalLink, Clock, FileText } from "lucide-react";
import { format } from "date-fns";

const SCAN_TYPES = [
  { value: "general", label: "Të përgjithshme" },
  { value: "products", label: "Produkte" },
  { value: "services", label: "Shërbime" },
  { value: "posts", label: "Postime / Artikuj" },
  { value: "news", label: "Lajme" },
  { value: "latest", label: "Më të rejat" },
  { value: "other", label: "Tjetër" },
];

interface SavedScan {
  id: string;
  scan_name: string;
  url: string;
  scan_type: string;
  content_markdown: string | null;
  metadata: Record<string, unknown>;
  extracted_items: unknown[];
  status: string;
  created_at: string;
}

export const AdminWebScanner = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [scanName, setScanName] = useState("");
  const [scanType, setScanType] = useState("general");
  const [scanning, setScanning] = useState(false);
  const [viewingScan, setViewingScan] = useState<SavedScan | null>(null);

  const { data: savedScans = [], isLoading } = useQuery({
    queryKey: ["admin-saved-scans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_saved_scans")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as SavedScan[];
    },
    enabled: !!user,
  });

  const deleteScan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admin_saved_scans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-saved-scans"] });
      toast.success("Skanimi u fshi");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleScan = async () => {
    if (!url.trim() || !scanName.trim()) {
      toast.error("Fut URL-në dhe emrin e skanimit");
      return;
    }

    setScanning(true);
    try {
      // Use Firecrawl via the ingest-website or a direct scrape
      const { data, error } = await supabase.functions.invoke("scan-and-save", {
        body: {
          url: url.trim(),
          scan_name: scanName.trim(),
          scan_type: scanType,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`"${scanName}" u skanua dhe u ruajt me sukses!`);
      queryClient.invalidateQueries({ queryKey: ["admin-saved-scans"] });
      setUrl("");
      setScanName("");
      setScanType("general");
    } catch (e: any) {
      toast.error(e.message || "Skanimi dështoi");
    }
    setScanning(false);
  };

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      products: "bg-blue-500/10 text-blue-500",
      services: "bg-green-500/10 text-green-500",
      posts: "bg-purple-500/10 text-purple-500",
      news: "bg-orange-500/10 text-orange-500",
      latest: "bg-pink-500/10 text-pink-500",
    };
    return colors[type] || "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-4">
      {/* Scanner Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Skano Faqe Web
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Emri i skanimit</Label>
              <Input
                placeholder="p.sh. Produktet e SmileShop"
                value={scanName}
                onChange={(e) => setScanName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipi</Label>
              <Select value={scanType} onValueChange={setScanType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCAN_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleScan();
                }}
              />
            </div>
            <Button onClick={handleScan} disabled={scanning || !url.trim() || !scanName.trim()}>
              {scanning ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Po skanon...</>
              ) : (
                <><Search className="h-4 w-4 mr-2" /> Skano & Ruaj</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Saved Scans */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Save className="h-4 w-4 text-primary" />
            Skanimet e Ruajtura ({savedScans.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : savedScans.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nuk ka skanime të ruajtura. Skano një faqe web për të filluar.
            </p>
          ) : (
            <div className="space-y-2">
              {savedScans.map((scan) => (
                <div key={scan.id} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{scan.scan_name}</p>
                      <Badge className={`text-xs ${getTypeBadgeColor(scan.scan_type)}`}>
                        {SCAN_TYPES.find((t) => t.value === scan.scan_type)?.label || scan.scan_type}
                      </Badge>
                      <Badge variant={scan.status === "completed" ? "default" : "secondary"} className="text-xs">
                        {scan.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        {scan.url}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(scan.created_at), "dd MMM yyyy, HH:mm")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button size="sm" variant="ghost" onClick={() => setViewingScan(scan)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteScan.mutate(scan.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Scan Dialog */}
      <Dialog open={!!viewingScan} onOpenChange={() => setViewingScan(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {viewingScan?.scan_name}
            </DialogTitle>
          </DialogHeader>
          {viewingScan && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
                <a href={viewingScan.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {viewingScan.url}
                </a>
              </div>

              {viewingScan.content_markdown && (
                <div className="rounded-lg border border-border p-4 bg-muted/30">
                  <h4 className="text-sm font-medium mb-2">Përmbajtja</h4>
                  <pre className="whitespace-pre-wrap text-xs text-foreground max-h-96 overflow-y-auto">
                    {viewingScan.content_markdown}
                  </pre>
                </div>
              )}

              {Array.isArray(viewingScan.extracted_items) && viewingScan.extracted_items.length > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <h4 className="text-sm font-medium mb-2">Elementet e nxjerra ({viewingScan.extracted_items.length})</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {viewingScan.extracted_items.map((item: any, i: number) => (
                      <div key={i} className="rounded border border-border p-2 text-xs">
                        <pre className="whitespace-pre-wrap">{JSON.stringify(item, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewingScan.metadata && Object.keys(viewingScan.metadata).length > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <h4 className="text-sm font-medium mb-2">Metadata</h4>
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {JSON.stringify(viewingScan.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingScan(null)}>Mbyll</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
