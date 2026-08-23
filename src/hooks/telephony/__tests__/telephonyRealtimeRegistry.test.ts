import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockHandler = {
  filter: Record<string, string>;
  callback: () => void;
};

type MockChannel = {
  topic: string;
  handlers: MockHandler[];
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

const realtimeMock = vi.hoisted(() => ({
  channels: [] as MockChannel[],
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: realtimeMock.channel,
    removeChannel: realtimeMock.removeChannel,
  },
}));

import {
  __resetTelephonyRealtimeRegistryForTests,
  acquireTelephonyRealtimeSubscription,
} from "../telephonyRealtimeRegistry";

function makeQueryClient(): QueryClient {
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  } as unknown as QueryClient;
}

describe("telephonyRealtimeRegistry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    realtimeMock.channels.length = 0;
    realtimeMock.channel.mockReset();
    realtimeMock.removeChannel.mockReset().mockResolvedValue("ok");

    realtimeMock.channel.mockImplementation((topic: string) => {
      let subscribed = false;
      const handlers: MockHandler[] = [];
      const channel = {
        topic,
        handlers,
        on: vi.fn((_kind: string, filter: Record<string, string>, callback: () => void) => {
          if (subscribed) {
            throw new Error("cannot add postgres_changes callbacks after subscribe()");
          }
          handlers.push({ filter, callback });
          return channel;
        }),
        subscribe: vi.fn(() => {
          subscribed = true;
          return channel;
        }),
      } satisfies MockChannel;

      realtimeMock.channels.push(channel);
      return channel;
    });
  });

  afterEach(() => {
    __resetTelephonyRealtimeRegistryForTests();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("registers listeners and subscribes only once for multiple consumers in one workspace", () => {
    const firstClient = makeQueryClient();
    const secondClient = makeQueryClient();

    const releaseFirst = acquireTelephonyRealtimeSubscription("workspace-1", firstClient);
    const releaseSecond = acquireTelephonyRealtimeSubscription("workspace-1", secondClient);

    expect(realtimeMock.channel).toHaveBeenCalledTimes(1);
    expect(realtimeMock.channels).toHaveLength(1);
    expect(realtimeMock.channels[0].on).toHaveBeenCalledTimes(2);
    expect(realtimeMock.channels[0].subscribe).toHaveBeenCalledTimes(1);

    const filters = realtimeMock.channels[0].handlers.map(({ filter }) => filter);
    expect(filters).toEqual([
      expect.objectContaining({ table: "active_calls", filter: "workspace_id=eq.workspace-1" }),
      expect.objectContaining({ table: "agent_telephony_state", filter: "workspace_id=eq.workspace-1" }),
    ]);

    realtimeMock.channels[0].handlers[0].callback();
    expect(firstClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["active-calls"] });
    expect(secondClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["active-calls"] });

    releaseFirst();
    vi.runAllTimers();
    expect(realtimeMock.removeChannel).not.toHaveBeenCalled();

    releaseSecond();
    expect(realtimeMock.removeChannel).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(realtimeMock.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("cancels deferred cleanup when React StrictMode immediately reacquires the subscription", () => {
    const client = makeQueryClient();

    const releaseInitial = acquireTelephonyRealtimeSubscription("workspace-1", client);
    releaseInitial();

    const releaseRemount = acquireTelephonyRealtimeSubscription("workspace-1", client);
    vi.runAllTimers();

    expect(realtimeMock.channel).toHaveBeenCalledTimes(1);
    expect(realtimeMock.channels[0].on).toHaveBeenCalledTimes(2);
    expect(realtimeMock.channels[0].subscribe).toHaveBeenCalledTimes(1);
    expect(realtimeMock.removeChannel).not.toHaveBeenCalled();

    releaseRemount();
    vi.runAllTimers();
    expect(realtimeMock.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("keeps workspace subscriptions isolated and tears each one down independently", () => {
    const firstClient = makeQueryClient();
    const secondClient = makeQueryClient();

    const releaseFirst = acquireTelephonyRealtimeSubscription("workspace-1", firstClient);
    const releaseSecond = acquireTelephonyRealtimeSubscription("workspace-2", secondClient);

    expect(realtimeMock.channel).toHaveBeenCalledTimes(2);
    expect(realtimeMock.channels[0].topic).toContain("workspace-1");
    expect(realtimeMock.channels[1].topic).toContain("workspace-2");
    expect(realtimeMock.channels[0].topic).not.toBe(realtimeMock.channels[1].topic);

    releaseFirst();
    vi.runAllTimers();
    expect(realtimeMock.removeChannel).toHaveBeenCalledTimes(1);

    releaseSecond();
    vi.runAllTimers();
    expect(realtimeMock.removeChannel).toHaveBeenCalledTimes(2);
  });
});
