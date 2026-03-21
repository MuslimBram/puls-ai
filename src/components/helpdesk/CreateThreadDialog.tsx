import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PRIORITY_LEVELS, type ConversationThread } from "@/hooks/useHelpdesk";

interface CreateThreadDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: Partial<ConversationThread>) => void;
}

export const CreateThreadDialog = ({ open, onClose, onCreate }: CreateThreadDialogProps) => {
  const [subject, setSubject] = useState("");
  const [contactName, setContactName] = useState("");
  const [channelType, setChannelType] = useState("email");
  const [priority, setPriority] = useState("normal");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Conversation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Support request..." />
          </div>
          <div>
            <Label>Contact Name</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Doe" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Channel</Label>
              <Select value={channelType} onValueChange={setChannelType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="website_chat">Website Chat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_LEVELS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!subject.trim()}
            onClick={() => {
              onCreate({ subject, contact_name: contactName || null, channel_type: channelType, priority });
              setSubject("");
              setContactName("");
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
