/// <cts-enable />
import {
  BuiltInLLMMessage,
  Cell,
  computed,
  Default,
  handler,
  llmDialog,
  NAME,
  pattern,
  Stream,
  UI,
} from "commontools";

// ============================================================================
// Types
// ============================================================================

interface Alternative {
  value: string;
  description?: string;
}

interface Assumption {
  id: string;
  label: string;
  description?: string;
  alternatives: Alternative[];
  selectedIndex: number; // Which one LLM assumed (pre-selected)
  messageId: string; // Which message this relates to
  status: "active" | "resolved" | "dismissed";
}

interface UserContextNote {
  id: string;
  content: string;
  source: "correction" | "explicit" | "inferred";
  createdAt: string;
  relatedAssumptionId?: string;
}

// ============================================================================
// Input/Output Types
// ============================================================================

interface AssumptionSurfacerInput {
  messages?: Cell<Default<BuiltInLLMMessage[], []>>;
  assumptions?: Cell<Default<Assumption[], []>>;
  userContext?: Cell<Default<UserContextNote[], []>>;
  systemPrompt?: string;
}

interface AssumptionSurfacerOutput {
  messages: BuiltInLLMMessage[];
  assumptions: Assumption[];
  userContext: UserContextNote[];
}

// ============================================================================
// Handlers
// ============================================================================

const sendMessage = handler<
  { detail: { text: string } },
  { addMessage: Stream<BuiltInLLMMessage> }
>((event, { addMessage }) => {
  const { text } = event.detail;
  if (!text.trim()) return;

  addMessage.send({
    role: "user",
    content: [{ type: "text" as const, text }],
  });
});

const clearChat = handler<
  never,
  {
    messages: Cell<BuiltInLLMMessage[]>;
    assumptions: Cell<Assumption[]>;
    pending: Cell<boolean | undefined>;
  }
>((_, { messages, assumptions, pending }) => {
  messages.set([]);
  assumptions.set([]);
  pending.set(false);
});

// ============================================================================
// Pattern
// ============================================================================

export default pattern<AssumptionSurfacerInput, AssumptionSurfacerOutput>(
  ({ messages, assumptions, userContext, systemPrompt }) => {
    const model = Cell.of<string>("anthropic:claude-sonnet-4-5");

    // Set up llmDialog for the main chat
    const { addMessage, cancelGeneration, pending } = llmDialog({
      system: computed(
        () => systemPrompt ?? "You are a helpful, concise assistant."
      ),
      messages,
      model,
    });

    // Title generation from first message
    const title = computed(() => {
      const msgList = messages.get();
      if (!msgList || msgList.length === 0) return "Assumption Surfacer";
      const firstMsg = msgList[0];
      if (!firstMsg) return "Assumption Surfacer";

      // Content can be string or array of parts
      let textContent: string;
      if (typeof firstMsg.content === "string") {
        textContent = firstMsg.content;
      } else if (Array.isArray(firstMsg.content)) {
        textContent = firstMsg.content
          .filter((c) => c.type === "text")
          .map((c) => ("text" in c ? c.text : ""))
          .join(" ");
      } else {
        textContent = "";
      }

      if (textContent.length > 30) {
        return textContent.slice(0, 30) + "...";
      }
      return textContent || "Assumption Surfacer";
    });

    // Computed values for conditional rendering
    const hasAssumptions = computed(() => assumptions.get().length > 0);
    const hasUserContext = computed(() => userContext.get().length > 0);
    const userContextCount = computed(() => userContext.get().length);

    return {
      [NAME]: title,
      [UI]: (
        <ct-screen>
          <ct-vstack slot="header">
            <ct-heading level={4}>{title}</ct-heading>
            <ct-hstack align="center" gap="1">
              <ct-button
                variant="pill"
                type="button"
                title="Clear chat"
                onClick={clearChat({ messages, assumptions, pending })}
              >
                Clear
              </ct-button>
            </ct-hstack>
          </ct-vstack>

          {/* Main content area: Chat + Sidebar */}
          <div
            style={{
              display: "flex",
              flex: 1,
              overflow: "hidden",
              height: "100%",
            }}
          >
            {/* Chat area */}
            <div
              style={{
                flex: 2,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <ct-vscroll
                style="padding: 1rem; flex: 1;"
                flex
                showScrollbar
                fadeEdges
                snapToBottom
              >
                <ct-chat $messages={messages} pending={pending} />
              </ct-vscroll>
            </div>

            {/* Assumptions sidebar */}
            <div
              style={{
                flex: 1,
                borderLeft: "1px solid var(--ct-color-border, #e0e0e0)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                minWidth: "250px",
                maxWidth: "350px",
              }}
            >
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderBottom: "1px solid var(--ct-color-border, #e0e0e0)",
                  fontWeight: 600,
                }}
              >
                Assumptions
              </div>

              <ct-vscroll style="padding: 1rem; flex: 1;" flex showScrollbar>
                {hasAssumptions ? (
                  assumptions.map((assumption) => (
                    <div
                      key={assumption.id}
                      style={{
                        padding: "0.75rem",
                        marginBottom: "0.75rem",
                        backgroundColor:
                          "var(--ct-color-surface-secondary, #f5f5f5)",
                        borderRadius: "8px",
                        border: "1px solid var(--ct-color-border, #e0e0e0)",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 500,
                          marginBottom: "0.5rem",
                          fontSize: "0.9rem",
                        }}
                      >
                        {assumption.label}
                      </div>
                      {assumption.description && (
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--ct-color-text-secondary, #666)",
                            marginBottom: "0.5rem",
                          }}
                        >
                          {assumption.description}
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        {assumption.alternatives.map((alt, idx) => (
                          <label
                            key={idx}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.25rem",
                              cursor: "pointer",
                              borderRadius: "4px",
                              backgroundColor:
                                idx === assumption.selectedIndex
                                  ? "var(--ct-color-accent-light, #e3f2fd)"
                                  : "transparent",
                            }}
                          >
                            <input
                              type="radio"
                              name={`assumption-${assumption.id}`}
                              checked={idx === assumption.selectedIndex}
                              onChange={() => {
                                /* TODO: implement selection handler */
                              }}
                            />
                            <span style={{ fontSize: "0.85rem" }}>
                              {alt.value}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      color: "var(--ct-color-text-secondary, #888)",
                      fontStyle: "italic",
                      textAlign: "center",
                      padding: "2rem 1rem",
                    }}
                  >
                    No assumptions detected yet. Start a conversation to see
                    implicit assumptions surfaced here.
                  </div>
                )}
              </ct-vscroll>

              {/* User context section */}
              {hasUserContext && (
                <div
                  style={{
                    borderTop: "1px solid var(--ct-color-border, #e0e0e0)",
                    padding: "0.75rem 1rem",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: "0.5rem",
                      fontSize: "0.85rem",
                    }}
                  >
                    User Context
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--ct-color-text-secondary, #666)",
                    }}
                  >
                    {userContextCount} note{userContextCount !== 1 && "s"}{" "}
                    collected
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Message input */}
          <ct-prompt-input
            slot="footer"
            placeholder="Ask a question..."
            pending={pending}
            onct-send={sendMessage({ addMessage })}
            onct-stop={cancelGeneration}
          />
        </ct-screen>
      ),
      messages,
      assumptions,
      userContext,
    };
  }
);
