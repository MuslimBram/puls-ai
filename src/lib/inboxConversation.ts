export interface InboxMessageLike {
  id: string;
  message_timestamp: string;
  is_unread?: boolean;
  [key: string]: unknown;
}

export interface ConversationThreadLike {
  id: string;
  channel_type: string;
  contact_identifier?: string | null;
  contact_name?: string | null;
  inbox_messages?: InboxMessageLike[] | null;
  [key: string]: unknown;
}

export const buildInboxConversation = (thread: ConversationThreadLike) => {
  const messages = [...(thread.inbox_messages ?? [])].sort(
    (a, b) =>
      new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime(),
  );
  const latest = messages[messages.length - 1];

  return {
    ...thread,
    key: thread.id,
    channelType: thread.channel_type,
    contactIdentifier: thread.contact_identifier,
    contactName: thread.contact_name || thread.contact_identifier || "Unknown",
    unreadCount: messages.filter((message) => message.is_unread).length,
    latest,
    messages,
  };
};
