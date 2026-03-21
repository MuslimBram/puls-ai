import { useUserQuery, useToggleMutation, useInsertMutation, useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";

export interface CompetitiveSignal {
  id: string;
  user_id: string;
  signal_type: string;
  title: string;
  description: string | null;
  competitor_id: string | null;
  severity: string;
  is_read: boolean;
  is_actioned: boolean;
  metadata: Record<string, unknown>;
  detected_at: string;
  created_at: string;
}

export interface CompetitiveAction {
  id: string;
  signal_id: string | null;
  action_text: string;
  action_type: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export const useCompetitiveSignals = () =>
  useUserQuery<CompetitiveSignal>("competitive_signals", "competitive-signals", {
    orderBy: "detected_at",
    limit: 50,
  });

export const useCompetitiveActions = (signalId?: string | null) =>
  useUserQuery<CompetitiveAction>("competitive_actions", "competitive-actions", {
    limit: 100,
    filters: signalId ? { signal_id: signalId } : undefined,
  });

export const useMarkSignalRead = () =>
  useUpdateFieldMutation("competitive_signals", "competitive-signals");

export const useToggleCompetitiveAction = () =>
  useToggleMutation("competitive_actions", "competitive-actions");

export const useCreateCompetitiveAction = () =>
  useInsertMutation<{ signal_id?: string; action_text: string; action_type?: string }>(
    "competitive_actions",
    "competitive-actions",
    "Action created",
  );

export const useCompetitiveStats = () => {
  const { data: signals } = useCompetitiveSignals();
  const { data: actions } = useCompetitiveActions();

  const totalSignals = signals?.length ?? 0;
  const unreadSignals = signals?.filter((s) => !s.is_read).length ?? 0;
  const totalActions = actions?.length ?? 0;
  const completedActions = actions?.filter((a) => a.is_completed).length ?? 0;
  const adoptionRate = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

  return { totalSignals, unreadSignals, totalActions, completedActions, adoptionRate };
};
