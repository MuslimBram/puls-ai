import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Star } from "lucide-react";

interface RateSellerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  onSuccess: () => void;
}

export function RateSellerModal({ open, onOpenChange, targetUserId, onSuccess }: RateSellerModalProps) {
  const { toast } = useToast();
  const [score, setScore] = useState<number>(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/community-rate-post`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          target_user_id: targetUserId,
          score,
          comment: comment || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || resData.message || "Failed to submit rating");
      }

      toast({
        title: "Rating Submitted!",
        description: "Your rating has been saved.",
      });

      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      toast({
        title: "Rating Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate Seller / User</DialogTitle>
          <DialogDescription>
            Share your rating and feedback (1 to 5 stars).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2 text-center">
            <Label className="text-sm">Rating Score</Label>
            <div className="flex items-center justify-center gap-2 pt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button aria-label="Favorite"
                  key={star}
                  type="button"
                  onClick={() => setScore(star)}
                  className="focus:outline-none transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-7 w-7 ${
                      star <= score ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comment">Feedback / Review (Optional)</Label>
            <Textarea
              id="comment"
              placeholder="How was your interaction or work experience?"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Rating
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
