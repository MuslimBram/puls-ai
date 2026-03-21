import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { crmFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";

interface NewDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (deal: { title: string; contact_name: string; contact_email: string; deal_value: number; priority: string; source_channel: string }) => void;
  isPending: boolean;
}

export const NewDealDialog = ({ open, onOpenChange, onCreate, isPending }: NewDealDialogProps) => {
  const [form, setForm] = useState({
    title: "", contact_name: "", contact_email: "", deal_value: 0, priority: "medium", source_channel: "manual",
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    onCreate(form);
    onOpenChange(false);
    setForm({ title: "", contact_name: "", contact_email: "", deal_value: 0, priority: "medium", source_channel: "manual" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Deal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <FieldLabelWithGuide label="Title *" guide={getFieldGuide(crmFieldGuides, "deal_title")!} />
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Deal title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabelWithGuide label="Contact Name" guide={getFieldGuide(crmFieldGuides, "deal_contact_name")!} />
              <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabelWithGuide label="Value ($)" guide={getFieldGuide(crmFieldGuides, "deal_value")!} />
              <Input type="number" value={form.deal_value} onChange={(e) => setForm((f) => ({ ...f, deal_value: Number(e.target.value) }))} />
            </div>
            <div>
              <FieldLabelWithGuide label="Priority" guide={getFieldGuide(crmFieldGuides, "deal_priority")!} />
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Source</label>
            <Select value={form.source_channel} onValueChange={(v) => setForm((f) => ({ ...f, source_channel: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="website_chat">Website Chat</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
