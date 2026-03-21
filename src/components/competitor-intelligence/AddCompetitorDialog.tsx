import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { competitorFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";
import { toast } from "@/components/ui/sonner";
import { CATEGORIES, SCAN_FREQUENCIES } from "./constants";

interface AddCompetitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: { name: string; url: string; category: string; frequency: string }) => Promise<void>;
  isPending: boolean;
}

export const AddCompetitorDialog = ({ open, onOpenChange, onAdd, isPending }: AddCompetitorDialogProps) => {
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formCategory, setFormCategory] = useState("direct");
  const [formFrequency, setFormFrequency] = useState("weekly");
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const { profile } = useBusinessProfile();

  const handleSubmit = async () => {
    await onAdd({ name: formName, url: formUrl, category: formCategory, frequency: formFrequency });
    setFormName("");
    setFormUrl("");
    setFormCategory("direct");
    setFormFrequency("weekly");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Competitor</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <FieldLabelWithGuide
              label="Competitor Name"
              guide={getFieldGuide(competitorFieldGuides, "competitor_name")!}
              onAiSuggest={async () => {
                if (!profile) return;
                setAiSuggestLoading(true);
                try {
                  const { data } = await supabase.functions.invoke("ai-sales-assistant", {
                    body: { prompt: `Suggest 1 competitor name for a ${profile.industry || "general"} business offering ${profile.main_services || "services"}. Return only the company name, nothing else.` },
                  });
                  if (data?.reply) setFormName(data.reply.trim());
                } catch {
                  toast.error("AI suggestion failed");
                } finally {
                  setAiSuggestLoading(false);
                }
              }}
              isAiLoading={aiSuggestLoading}
            />
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Acme Corp" />
          </div>
          <div>
            <FieldLabelWithGuide label="Website URL" guide={getFieldGuide(competitorFieldGuides, "competitor_website")!} />
            <Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://competitor.com" />
          </div>
          <div>
            <FieldLabelWithGuide label="Category" guide={getFieldGuide(competitorFieldGuides, "competitor_category")!} />
            <Select value={formCategory} onValueChange={setFormCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabelWithGuide label="Scan Frequency" guide={getFieldGuide(competitorFieldGuides, "competitor_scan_frequency")!} />
            <Select value={formFrequency} onValueChange={setFormFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCAN_FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!formName.trim() || isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add & Scan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
