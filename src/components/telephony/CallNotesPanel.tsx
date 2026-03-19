import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCallNotes } from "@/hooks/useCallNotes";
import { StickyNote, Tag, X, Plus, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CallNotesPanelProps {
  callRecordId: string;
}

const PRESET_TAGS = [
  "Follow-up", "Interested", "Not Interested", "Callback",
  "Voicemail", "Wrong Number", "Escalated", "Resolved",
];

export const CallNotesPanel = ({ callRecordId }: CallNotesPanelProps) => {
  const { notes, tags, addNote, deleteNote, addTag, removeTag } = useCallNotes(callRecordId);
  const [noteText, setNoteText] = useState("");
  const [customTag, setCustomTag] = useState("");

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNote.mutate(noteText.trim());
    setNoteText("");
  };

  const handleAddCustomTag = () => {
    if (!customTag.trim()) return;
    addTag.mutate(customTag.trim());
    setCustomTag("");
  };

  const existingTagNames = tags.map((t) => t.tag);

  return (
    <div className="space-y-4">
      {/* Tags Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" /> Tags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <Badge key={t.id} variant="secondary" className="text-xs gap-1">
                {t.tag}
                <button onClick={() => removeTag.mutate(t.id)} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESET_TAGS.filter((t) => !existingTagNames.includes(t)).map((tag) => (
              <Button
                key={tag}
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => addTag.mutate(tag)}
              >
                <Plus className="h-2.5 w-2.5 mr-0.5" /> {tag}
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            <Input
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              placeholder="Custom tag..."
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === "Enter" && handleAddCustomTag()}
            />
            <Button size="sm" className="h-7 text-xs" onClick={handleAddCustomTag}>Add</Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <StickyNote className="h-3.5 w-3.5" /> Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a call note..."
            className="text-xs min-h-[60px]"
          />
          <Button size="sm" className="w-full h-7 text-xs" onClick={handleAddNote} disabled={!noteText.trim()}>
            Add Note
          </Button>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {notes.map((note) => (
              <div key={note.id} className="rounded-md border border-border p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-foreground whitespace-pre-wrap flex-1">{note.note_text}</p>
                  <button onClick={() => deleteNote.mutate(note.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
