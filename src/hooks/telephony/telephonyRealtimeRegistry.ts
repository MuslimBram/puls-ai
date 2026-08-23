import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type TelephonyRealtimeChannel = ReturnType<typeof supabase.channel>;

type TelephonyRealtimeEntry = {
  channel: TelephonyRealtimeChannel;
  refs: number;
  queryClients: Map<QueryClient, number>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
};

const telephonyRealtimeEntries = new Map<string, TelephonyRealtimeEntry>();
let telephonyRealtimeGeneration = 0;

function invalidateForClients(
  clients: Map<QueryClient, number>,
  queryKey: readonly string[],
): void {
  for (const queryClient of clients.keys()) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}

/**
 * Acquire the shared telephony Realtime subscription for one workspace.
 *
 * Multiple UI consumers may mount useTelephony() at the same time. Supabase
 * reuses channels by topic, and adding postgres_changes callbacks to an
 * already-subscribed channel throws. This registry guarantees that listeners
 * and subscribe() are registered exactly once for an active workspace entry.
 */
export function acquireTelephonyRealtimeSubscription(
  workspaceId: string,
  queryClient: QueryClient,
): () => void {
  let entry = telephonyRealtimeEntries.get(workspaceId);

  if (!entry) {
    const queryClients = new Map<QueryClient, number>();
    const topic = `telephony-realtime:${workspaceId}:${++telephonyRealtimeGeneration}`;

    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "active_calls",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => invalidateForClients(queryClients, ["active-calls"]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_telephony_state",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => invalidateForClients(queryClients, ["agent-telephony-state"]),
      )
      .subscribe();

    entry = {
      channel,
      refs: 0,
      queryClients,
      cleanupTimer: null,
    };
    telephonyRealtimeEntries.set(workspaceId, entry);
  }

  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
  }

  entry.refs += 1;
  entry.queryClients.set(queryClient, (entry.queryClients.get(queryClient) ?? 0) + 1);

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const current = telephonyRealtimeEntries.get(workspaceId);
    if (!current || current !== entry) return;

    const clientRefs = current.queryClients.get(queryClient) ?? 0;
    if (clientRefs <= 1) current.queryClients.delete(queryClient);
    else current.queryClients.set(queryClient, clientRefs - 1);

    current.refs = Math.max(0, current.refs - 1);
    if (current.refs > 0 || current.cleanupTimer) return;

    // Defer teardown by one task. React StrictMode can immediately unmount and
    // remount effects in development; a reacquire cancels this cleanup and
    // safely reuses the already-configured subscription.
    current.cleanupTimer = setTimeout(() => {
      const latest = telephonyRealtimeEntries.get(workspaceId);
      if (latest !== current || current.refs !== 0) return;

      telephonyRealtimeEntries.delete(workspaceId);
      current.cleanupTimer = null;
      void supabase.removeChannel(current.channel);
    }, 0);
  };
}

/** Test-only reset for deterministic unit tests. */
export function __resetTelephonyRealtimeRegistryForTests(): void {
  for (const entry of telephonyRealtimeEntries.values()) {
    if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
    void supabase.removeChannel(entry.channel);
  }
  telephonyRealtimeEntries.clear();
  telephonyRealtimeGeneration = 0;
}
