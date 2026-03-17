import { useState } from "react";
// Sources - renders as standalone content (embedded in Channels page)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useScanSources, PLATFORMS, SOURCE_TYPES, type NewScanSource } from "@/hooks/useScanSources";
import ScanResultViewer from "@/components/ScanResultViewer";
import { Plus, MoreHorizontal, Play, Pause, Trash2, Pencil, Globe, Loader2, Eye } from "lucide-react";

const platformIcons: Record<string, string> = {
  web: "🌐", instagram: "📸", facebook: "📘", telegram: "✈️",
  whatsapp: "💬", linkedin: "💼", other: "🔗",
};

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "active": return "default";
    case "scanning": return "secondary";
    case "error": return "destructive";
    default: return "outline";
  }
};

const isValidUrl = (v: string) => {
  try { new URL(v); return true; } catch { return false; }
};

const validateInput = (platform: string, value: string): string | null => {
  if (!value.trim()) return "URL or identifier is required";
  if (platform === "web" && !isValidUrl(value)) return "Must be a valid URL (https://...)";
  return null;
};

export default function Sources() {
  const { sources, isLoading, addSource, updateSource, deleteSource, triggerScan } = useScanSources();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewSourceId, setViewSourceId] = useState<string | null>(null);
  const [form, setForm] = useState<NewScanSource & { label: string }>({
    platform: "web", source_type: "website", url_or_identifier: "", label: "",
  });
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setForm({ platform: "web", source_type: "website", url_or_identifier: "", label: "" });
    setError(null);
  };

  const handleSubmit = () => {
    const err = validateInput(form.platform, form.url_or_identifier);
    if (err) { setError(err); return; }
    if (editId) {
      updateSource.mutate({ id: editId, ...form }, { onSuccess: () => { setEditId(null); setShowAdd(false); resetForm(); } });
    } else {
      addSource.mutate(form, { onSuccess: () => { setShowAdd(false); resetForm(); } });
    }
  };

  const openEdit = (s: any) => {
    setForm({ platform: s.platform, source_type: s.source_type, url_or_identifier: s.url_or_identifier, label: s.label || "" });
    setEditId(s.id);
    setShowAdd(true);
  };

  const viewingSource = sources.find((s) => s.id === viewSourceId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Source Management</h1>
          <p className="text-sm text-muted-foreground">Manage scan sources across platforms</p>
        </div>
        <Button onClick={() => { resetForm(); setEditId(null); setShowAdd(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Source
        </Button>
      </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Active Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : sources.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No sources added yet. Click "Add Source" to get started.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>URL / Identifier</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Scan</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <span className="mr-1">{platformIcons[s.platform] || "🔗"}</span>
                        <span className="capitalize">{s.platform}</span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs">{s.url_or_identifier}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{s.source_type}</Badge></TableCell>
                      <TableCell><Badge variant={statusVariant(s.scan_status)} className="capitalize">{s.scan_status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.last_scan_at ? new Date(s.last_scan_at).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewSourceId(s.id)}>
                              <Eye className="mr-2 h-4 w-4" /> View Insights
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(s)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => triggerScan.mutate(s.id)}
                              disabled={s.scan_status === "scanning" || triggerScan.isPending}
                            >
                              <Play className="mr-2 h-4 w-4" /> Scan Now
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateSource.mutate({ id: s.id, is_active: !s.is_active } as any)}>
                              <Pause className="mr-2 h-4 w-4" /> {s.is_active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteSource.mutate(s.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scan Result Viewer Sheet */}
      <Sheet open={!!viewSourceId} onOpenChange={(o) => { if (!o) setViewSourceId(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {viewingSource && (
                <>
                  <span>{platformIcons[viewingSource.platform] || "🔗"}</span>
                  <span className="truncate">{viewingSource.label || viewingSource.url_or_identifier}</span>
                </>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {viewSourceId && <ScanResultViewer sourceId={viewSourceId} />}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); resetForm(); setEditId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Source" : "Add New Source"}</DialogTitle>
            <DialogDescription>Configure a source for scanning across platforms.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="mr-2">{platformIcons[p]}</span>
                      <span className="capitalize">{p}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select value={form.source_type} onValueChange={(v) => setForm((f) => ({ ...f, source_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>URL or Identifier</Label>
              <Input
                placeholder={form.platform === "web" ? "https://example.com" : "@channel_name or https://..."}
                value={form.url_or_identifier}
                onChange={(e) => { setForm((f) => ({ ...f, url_or_identifier: e.target.value })); setError(null); }}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="text-xs text-muted-foreground">
                {form.platform === "web" ? "Enter a full URL" : "Enter a URL, @username, or group/channel identifier"}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Label (optional)</Label>
              <Input
                placeholder="e.g. Main website, Marketing group"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); resetForm(); setEditId(null); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={addSource.isPending || updateSource.isPending}>
              {(addSource.isPending || updateSource.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editId ? "Update" : "Add Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
