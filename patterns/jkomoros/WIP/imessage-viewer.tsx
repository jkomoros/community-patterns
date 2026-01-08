/// <cts-enable />
/**
 * iMessage Viewer
 *
 * View your iMessage conversations synced via apple-sync CLI.
 * Messages are stored in the `messages` input cell.
 *
 * To sync messages, run:
 *   ./tools/apple-sync.ts imessage
 */
import {
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  Writable,
} from "commontools";

type CFC<T, C extends string> = T;
type Confidential<T> = CFC<T, "confidential">;

/**
 * A single iMessage message
 */
export type Message = {
  rowId: number;
  guid: string;
  text: string | null;
  isFromMe: boolean;
  date: string;
  chatId: string;
  handleId: string;
};

// Format a date for display
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  } catch {
    return dateStr;
  }
}

// Format chat ID for display (clean up phone numbers)
function formatChatId(chatId: string): string {
  // Extract digits from phone number (handles +1-555-0101, +15550101, etc.)
  const digits = chatId.replace(/\D/g, "");
  // If it looks like a phone number (10-11 digits), format it
  if (digits.length >= 10 && digits.length <= 11) {
    const last10 = digits.slice(-10);
    return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
  }
  return chatId;
}

// Group messages by chat ID
function groupByChat(messages: Message[]): Map<string, Message[]> {
  const byChat = new Map<string, Message[]>();
  for (const msg of messages) {
    // Skip null/undefined messages (CLI display bug can cause these)
    if (!msg || !msg.chatId) continue;
    const existing = byChat.get(msg.chatId) || [];
    existing.push(msg);
    byChat.set(msg.chatId, existing);
  }
  return byChat;
}

// Handler to select a conversation
const selectConversation = handler<
  unknown,
  { chatId: string; selectedChatId: Writable<string | null> }
>((_, { chatId, selectedChatId }) => {
  selectedChatId.set(chatId);
});

// Handler to go back to conversation list
const backToList = handler<
  unknown,
  { selectedChatId: Writable<string | null> }
>((_, { selectedChatId }) => {
  selectedChatId.set(null);
});

export default pattern<{
  messages: Default<Confidential<Message[]>, []>;
}>(({ messages }) => {
  const selectedChatId = Writable.of<string | null>(null);

  const messageCount = derive(messages, (msgs: Message[]) => msgs?.length ?? 0);

  // Group messages into conversations
  const conversationList = derive(messages, (msgs: Message[]) => {
    const byChat = groupByChat(msgs || []);
    const convos: Array<{ chatId: string; lastMessage: Message; count: number }> = [];

    for (const [chatId, chatMsgs] of byChat) {
      chatMsgs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      convos.push({
        chatId,
        lastMessage: chatMsgs[chatMsgs.length - 1],
        count: chatMsgs.length,
      });
    }

    convos.sort((a, b) =>
      new Date(b.lastMessage.date).getTime() - new Date(a.lastMessage.date).getTime()
    );

    return convos;
  });

  const conversationCount = derive(conversationList, (c) => c?.length ?? 0);

  // Get messages for selected conversation
  const selectedMessages = derive(
    { messages, selectedChatId },
    ({ messages, selectedChatId }: { messages: Message[]; selectedChatId: string | null }) => {
      if (!selectedChatId || !messages) return [];
      // Filter out null messages and match chatId
      const filtered = messages.filter((m: Message) => m && m.chatId === selectedChatId);
      filtered.sort((a: Message, b: Message) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return filtered;
    }
  );

  return {
    [NAME]: derive(messageCount, (count: number) => `iMessage (${count} messages)`),
    [UI]: (
      <ct-screen style={{ display: "flex", flexDirection: "column", backgroundColor: "#f5f5f5" }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px",
          backgroundColor: "#fff",
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}>
          {ifElse(
            derive(selectedChatId, (id: string | null) => id !== null),
            <button
              onClick={backToList({ selectedChatId })}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: "18px",
                padding: "4px 8px",
              }}
            >
              Back
            </button>,
            <span style={{ fontSize: "24px" }}>Messages</span>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {ifElse(
            derive(messageCount, (c: number) => c === 0),
            // Empty state
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#666",
              padding: "20px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>Messages</div>
              <div style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "8px" }}>
                No Messages Yet
              </div>
              <div style={{ fontSize: "14px", maxWidth: "300px" }}>
                Run the apple-sync CLI to import your iMessages:
                <pre style={{
                  backgroundColor: "#e0e0e0",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  marginTop: "12px",
                  fontSize: "12px",
                }}>
                  ./tools/apple-sync.ts imessage
                </pre>
              </div>
            </div>,
            // Has messages
            ifElse(
              derive(selectedChatId, (id: string | null) => id === null),
              // Conversation list view
              <div>
                {derive(conversationList, (convos) =>
                  convos.map((convo, idx: number) => (
                    <div
                      key={idx}
                      onClick={selectConversation({ chatId: convo.chatId, selectedChatId })}
                      style={{
                        padding: "12px 16px",
                        backgroundColor: "#fff",
                        borderBottom: "1px solid #f0f0f0",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: "600" }}>
                        {formatChatId(convo.chatId)}
                      </div>
                      <div style={{ fontSize: "14px", color: "#666" }}>
                        {convo.lastMessage.isFromMe ? "You: " : ""}
                        {convo.lastMessage.text || "(attachment)"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#999" }}>
                        {formatDate(convo.lastMessage.date)} - {convo.count} messages
                      </div>
                    </div>
                  ))
                )}
              </div>,
              // Conversation detail view
              <div style={{ padding: "16px", backgroundColor: "#e5ddd5" }}>
                {derive(selectedMessages, (msgs: Message[]) =>
                  msgs.map((msg: Message, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        justifyContent: msg.isFromMe ? "flex-end" : "flex-start",
                        marginBottom: "8px",
                      }}
                    >
                      <div style={{
                        maxWidth: "70%",
                        padding: "8px 12px",
                        borderRadius: "18px",
                        backgroundColor: msg.isFromMe ? "#007AFF" : "#fff",
                        color: msg.isFromMe ? "#fff" : "#000",
                      }}>
                        <div>{msg.text || "(attachment)"}</div>
                        <div style={{
                          fontSize: "11px",
                          color: msg.isFromMe ? "rgba(255,255,255,0.7)" : "#999",
                          marginTop: "4px",
                        }}>
                          {formatDate(msg.date)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          )}
        </div>
      </ct-screen>
    ),
    messages,
  };
});
