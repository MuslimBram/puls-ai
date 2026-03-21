import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { campaignFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";
import { OBJECTIVES, CHANNELS } from "./constants";
import { Sparkles, Loader2 } from "lucide-react";

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    name: string;
    objective: string;
    target_audience: string | null;
    budget_min: number;
    budget_max: number;
    duration_start: string | null;
    duration_end: string | null;
    preferred_channels: string[];
  }) => void;
  isPending: boolean;
}

export const CreateCampaignDialog = ({ open, onOpenChange, onCreate, isPending }: CreateCampaignDialogProps) => {
  const [formName, setFormName] = useState("");
  const [formObjective, setFormObjective] = useState("lead_generation");
  const [formAudience, setFormAudience] = useState("");
  const [formBudgetMin, setFormBudgetMin] = useState("");
  const [formBudgetMax, setFormBudgetMax] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formChannels, setFormChannels] = useState<string[]>([]);
  const [aiSuggestField, setAiSuggestField] = useState<string | null>(null);
  const { profile } = useBusinessProfile();

  const resetForm = () => {
    setFormName(""); setFormObjective("lead_generation"); setFormAudience("");
    setFormBudgetMin(""); setFormBudgetMax(""); setFormStart(""); setFormEnd("");
    setFormChannels([]);
  };

  const toggleChannel = (ch: string) => {
    setFormChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);
  };

  const handleSubmit = () => {
    onCreate({
      name: formName,
      objective: formObjective,
      target_audience: formAudience || null,
      budget_min: Number(formBudgetMin) || 0,
      budget_max: Number(formBudgetMax) || 0,
      duration_start: formStart ? new Date(formStart).toISOString() : null,
      duration_end: formEnd ? new Date(formEnd).toISOString() : null,
      preferred_channels: formChannels,
    });
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <FieldLabelWithGuide
              label="Campaign Name"
              guide={getFieldGuide(campaignFieldGuides, "campaign_name")!}
              onAiSuggest={async () => {
                setAiSuggestField("campaign_name");
                try {
                  const { data } = await supabase.functions.invoke("ai-sales-assistant", {
                    body: { prompt: `Suggest 1 campaign name for a ${profile?.industry || "general"} business. Objective: ${formObjective}. Return only the name.` },
                  });
                  if (data?.reply) setFormName(data.reply.trim());
                } catch {} finally { setAiSuggestField(null); }
              }}
              isAiLoading={aiSuggestField === "campaign_name"}
            />
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Summer Lead Gen Campaign" />
          </div>
          <div>
            <FieldLabelWithGuide
              label="Objective"
              guide={getFieldGuide(campaignFieldGuides, "campaign_objective")!}
            />
            <Select value={formObjective} onValueChange={setFormObjective}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabelWithGuide
              label="Target Audience"
              guide={getFieldGuide(campaignFieldGuides, "campaign_audience")!}
              onAiSuggest={async () => {
                setAiSuggestField("campaign_audience");
                try {
                  const { data } = await supabase.functions.invoke("ai-sales-assistant", {
                    body: { prompt: `Suggest a target audience description for a ${profile?.industry || "general"} business offering ${profile?.main_services || "services"}. Campaign objective: ${formObjective}. Return 1-2 sentences.` },
                  });
                  if (data?.reply) setFormAudience(data.reply.trim());
                } catch {} finally { setAiSuggestField(null); }
              }}
              isAiLoading={aiSuggestField === "campaign_audience"}
            />
            <Textarea value={formAudience} onChange={(e) => setFormAudience(e.target.value)} placeholder="Small business owners in tech sector..." rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabelWithGuide
                label="Budget Min ($)"
                guide={getFieldGuide(campaignFieldGuides, "campaign_budget")!}
              />
              <Input type="number" value={formBudgetMin} onChange={(e) => setFormBudgetMin(e.target.value)} placeholder="500" />
            </div>
            <div>
              <Label>Budget Max ($)</Label>
              <Input type="number" value={formBudgetMax} onChange={(e) => setFormBudgetMax(e.target.value)} placeholder="2000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <FieldLabelWithGuide
              label="Preferred Channels"
              guide={getFieldGuide(campaignFieldGuides, "campaign_channels")!}
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {CHANNELS.map((ch) => (
                <div key={ch} className="flex items-center gap-1.5">
                  <Checkbox checked={formChannels.includes(ch)} onCheckedChange={() => toggleChannel(ch)} id={`ch-${ch}`} />
                  <label htmlFor={`ch-${ch}`} className="text-sm capitalize cursor-pointer">{ch}</label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!formName.trim() || isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Create & Generate Strategy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
