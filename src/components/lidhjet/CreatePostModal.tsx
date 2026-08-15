import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Paperclip, X } from "lucide-react";

interface CreatePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const PRICE_BANDS: Record<string, { min: number; max: number }> = {
  pune: { min: 200, max: 200000 },
  sherbim: { min: 300, max: 300000 },
  tregti: { min: 100, max: 2000000 },
  tjeter: { min: 0, max: 5000000 },
};

export function CreatePostModal({ open, onOpenChange, onSuccess }: CreatePostModalProps) {
  const { user } = useAuth();
  const { workspace, workspaces } = useWorkspace();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("pune");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [useBusinessIdentity, setUseBusinessIdentity] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const currentBand = PRICE_BANDS[category] || PRICE_BANDS.pune;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < currentBand.min || numPrice > currentBand.max) {
      toast({
        title: "Invalid Price",
        description: `Price must be between ${currentBand.min} and ${currentBand.max} ALL for category '${category}'`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      // 1. Upload files to user folder in community-attachments bucket
      const uploadedAttachments = [];
      for (const file of files) {
        const fileExt = file.name.split(".").pop();
        const storagePath = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("community-attachments")
          .upload(storagePath, file);

        if (uploadError) {
          throw new Error(`Failed to upload file '${file.name}': ${uploadError.message}`);
        }

        uploadedAttachments.push({
          storage_path: storagePath,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
        });
      }

      // 2. Call Edge Function community-post-create
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/community-post-create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          title,
          content,
          category,
          price: numPrice,
          location: location || null,
          workspace_id: useBusinessIdentity ? (selectedWorkspaceId || workspace?.id || null) : null,
          attachments: uploadedAttachments,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || resData.message || "Failed to create community post");
      }

      toast({
        title: "Post Published!",
        description: "Your post is now active on the Lidhjet feed.",
      });

      // Reset form
      setTitle("");
      setContent("");
      setPrice("");
      setLocation("");
      setFiles([]);
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      toast({
        title: "Submission Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish Lidhjet Post</DialogTitle>
          <DialogDescription>
            Create a community post under Punë, Shërbim, Tregti, or Tjetër.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Post Title</Label>
            <Input
              id="title"
              placeholder="e.g. Seeking Web Developer for E-Commerce Project"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pune">Punë (Jobs)</SelectItem>
                  <SelectItem value="sherbim">Shërbim (Services)</SelectItem>
                  <SelectItem value="tregti">Tregti (Trade)</SelectItem>
                  <SelectItem value="tjeter">Tjetër (Other)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="price">Price (ALL)</Label>
              <Input
                id="price"
                type="number"
                placeholder={`${currentBand.min} - ${currentBand.max}`}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Band: {currentBand.min.toLocaleString()} - {currentBand.max.toLocaleString()} ALL
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location">City / Location (Optional)</Label>
            <Input
              id="location"
              placeholder="e.g. Tirana, Durrës, Prishtina"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content">Description & Details</Label>
            <Textarea
              id="content"
              placeholder="Describe your offer, requirements, or terms..."
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />
          </div>

          {/* Business Workspace Identity Selector */}
          {workspaces.length > 0 && (
            <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="businessIdentity"
                  checked={useBusinessIdentity}
                  onChange={(e) => setUseBusinessIdentity(e.target.checked)}
                  className="rounded border-border"
                />
                <Label htmlFor="businessIdentity" className="text-xs font-semibold cursor-pointer">
                  Publish under Business Identity (Workspace)
                </Label>
              </div>

              {useBusinessIdentity && (
                <Select value={selectedWorkspaceId || workspace?.id || ""} onValueChange={setSelectedWorkspaceId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Business Workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id} className="text-xs">
                        {ws.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* File Attachments */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Attachments (Images/Docs)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                multiple
                onChange={handleFileSelect}
                className="text-xs"
                accept="image/*,.pdf"
              />
            </div>

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded text-xs">
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate max-w-[120px]">{file.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Publish Post
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
