import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";

/**
 * Generic hook to query a Supabase table scoped to the current user.
 */
export function useUserQuery<T>(
  table: string,
  queryKey: string,
  options?: {
    orderBy?: string;
    ascending?: boolean;
    limit?: number;
    filters?: Record<string, unknown>;
    select?: string;
  },
) {
  const { user } = useAuth();
  const orderBy = options?.orderBy ?? "created_at";
  const ascending = options?.ascending ?? false;
  const limit = options?.limit ?? 50;
  const select = options?.select ?? "*";

  return useQuery({
    queryKey: [queryKey, user?.id, options?.filters],
    queryFn: async () => {
      let q = (supabase as any)
        .from(table)
        .select(select)
        .eq("user_id", user!.id)
        .order(orderBy, { ascending })
        .limit(limit);

      if (options?.filters) {
        for (const [key, value] of Object.entries(options.filters)) {
          if (value !== undefined && value !== null) {
            q = q.eq(key, value);
          }
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as T[];
    },
    enabled: !!user,
  });
}

/**
 * Generic toggle mutation (flip a boolean + optional timestamp).
 */
export function useToggleMutation(
  table: string,
  invalidateKey: string,
  boolField = "is_completed",
  timestampField = "completed_at",
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const update: Record<string, unknown> = {
        [boolField]: value,
        [timestampField]: value ? new Date().toISOString() : null,
      };
      const { error } = await (supabase as any).from(table).update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [invalidateKey] }),
  });
}

/**
 * Generic create-record mutation scoped to user + workspace.
 */
export function useInsertMutation<TInput extends Record<string, unknown>>(
  table: string,
  invalidateKey: string,
  successMessage?: string,
) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: TInput) => {
      const { error } = await (supabase as any).from(table).insert({
        ...data,
        user_id: user!.id,
        workspace_id: workspace?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [invalidateKey] });
      if (successMessage) toast({ title: successMessage });
    },
  });
}

/**
 * Generic resolve/update-field mutation.
 */
export function useUpdateFieldMutation(
  table: string,
  invalidateKey: string,
  successMessage?: string,
) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from(table).update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [invalidateKey] });
      if (successMessage) toast({ title: successMessage });
    },
  });
}
