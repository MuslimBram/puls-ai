import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface CallNote {
  id: string;
  call_record_id: string;
  user_id: string;
  workspace_id: string;
  note_text: string;
  created_at: string;
  updated_at: string;
}

export interface CallTag {
  id: string;
  call_record_id: string;
  user_id: string;
  workspace_id: string;
  tag: string;
  created_at: string;
}

export const useCallNotes = (callRecordId?: string) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const notesQuery = useQuery({
    queryKey: ["call-notes", callRecordId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_notes")
        .select("*")
        .eq("call_record_id", callRecordId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CallNote[];
    },
    enabled: !!callRecordId,
  });

  const tagsQuery = useQuery({
    queryKey: ["call-tags", callRecordId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_tags")
        .select("*")
        .eq("call_record_id", callRecordId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CallTag[];
    },
    enabled: !!callRecordId,
  });

  const addNote = useMutation({
    mutationFn: async (noteText: string) => {
      const { error } = await supabase.from("call_notes").insert({
        call_record_id: callRecordId!,
        user_id: user!.id,
        workspace_id: workspace!.id,
        note_text: noteText,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-notes", callRecordId] });
      toast.success("Note added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from("call_notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-notes", callRecordId] }),
  });

  const addTag = useMutation({
    mutationFn: async (tag: string) => {
      const { error } = await supabase.from("call_tags").insert({
        call_record_id: callRecordId!,
        user_id: user!.id,
        workspace_id: workspace!.id,
        tag,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-tags", callRecordId] });
      toast.success("Tag added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTag = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase.from("call_tags").delete().eq("id", tagId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-tags", callRecordId] }),
  });

  return {
    notes: notesQuery.data ?? [],
    tags: tagsQuery.data ?? [],
    addNote,
    deleteNote,
    addTag,
    removeTag,
    isLoading: notesQuery.isLoading,
  };
};
