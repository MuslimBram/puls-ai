import { describe, expect, it } from "vitest";
import { buildInboxConversation } from "@/lib/inboxConversation";

describe("buildInboxConversation", () => {
  it("keeps every message for one canonical thread in chronological order", () => {
    const conversation = buildInboxConversation({
      id: "thread-1",
      channel_type: "whatsapp",
      contact_identifier: "355600000000",
      contact_name: "Business Contact",
      inbox_messages: [
        { id: "outbound", message_timestamp: "2026-08-27T10:02:00Z", is_unread: false, direction: "outbound" },
        { id: "inbound", message_timestamp: "2026-08-27T10:01:00Z", is_unread: true, direction: "inbound" },
      ],
    });

    expect(conversation.key).toBe("thread-1");
    expect(conversation.messages.map((message) => message.id)).toEqual(["inbound", "outbound"]);
    expect(conversation.latest.id).toBe("outbound");
    expect(conversation.unreadCount).toBe(1);
  });

  it("uses the canonical contact identity and never creates a card per message", () => {
    const conversation = buildInboxConversation({
      id: "thread-telegram",
      channel_type: "telegram",
      contact_identifier: "57364094",
      inbox_messages: [
        { id: "one", message_timestamp: "2026-08-27T10:00:00Z" },
        { id: "two", message_timestamp: "2026-08-27T10:01:00Z" },
        { id: "three", message_timestamp: "2026-08-27T10:02:00Z" },
      ],
    });

    expect(conversation.contactName).toBe("57364094");
    expect(conversation.messages).toHaveLength(3);
  });
});
