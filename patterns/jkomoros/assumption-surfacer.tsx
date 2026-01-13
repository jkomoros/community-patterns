/// <cts-enable />
import {
  BuiltInLLMMessage,
  computed,
  Default,
  generateObject,
  handler,
  llmDialog,
  NAME,
  pattern,
  Stream,
  UI,
  Writable,
} from "commontools";

// ============================================================================
// Types
// ============================================================================

// ARCHITECTURE NOTE: Avoiding CPU loops with generateObject
// See: community-docs/superstitions/2025-12-06-computed-set-causes-cpu-loop.md
//
// Problem: Using computed() to copy generateObject results into cells causes
// 100% CPU loops. Computed cannot call .set() - it silently fails but can
// trigger reactive loops.
//
// Solution: Display analysisResult.result directly (reactive). Store only
// user corrections in cells. Merge in computed for display.

// Analyzed assumption for a single response
interface AnalyzedAssumption {
  label: string;
  description?: string;
  alternatives: Array<{ value: string; description?: string }>;
  selectedIndex: number;
}

// Assumptions keyed to a specific assistant message
interface MessageAssumptions {
  messageIndex: number; // Index of the assistant message in the conversation
  assumptions: AnalyzedAssumption[];
}

// Tracks user corrections to assumption selections
interface Correction {
  messageIndex: number;    // Which message's assumption
  assumptionLabel: string; // Identify assumption by label
  originalIndex: number;   // What the LLM originally selected
  correctedIndex: number;  // What the user selected
}

interface UserContextNote {
  id: string;
  content: string;
  source: "correction" | "explicit" | "inferred";
  createdAt: string;
  assumptionLabel?: string;
}

// ============================================================================
// Input/Output Types
// ============================================================================

interface AssumptionSurfacerInput {
  messages?: Writable<Default<BuiltInLLMMessage[], []>>;
  assumptionsByMessage?: Writable<Default<MessageAssumptions[], []>>; // Accumulated assumptions
  // Corrections keyed by "${messageIndex}-${assumptionLabel}" for cleaner updates
  corrections?: Writable<Default<Record<string, Correction>, {}>>;
  userContext?: Writable<Default<UserContextNote[], []>>;
  systemPrompt?: string;
}

interface AssumptionSurfacerOutput {
  messages: BuiltInLLMMessage[];
  assumptionsByMessage: MessageAssumptions[];
  corrections: Record<string, Correction>;
  userContext: UserContextNote[];
}

// ============================================================================
// Analyzer Types and Prompts
// ============================================================================

interface AnalysisResult {
  assumptions: AnalyzedAssumption[];
}

const ANALYZER_SYSTEM_PROMPT = `Identify implicit assumptions in the assistant's response.

For each assumption:
- label: 2-4 words (e.g., "Language", "Skill Level")
- description: ONE short sentence or omit entirely
- alternatives: exactly 3 options, each 2-6 words MAX (e.g., "Python", "JavaScript", "TypeScript")
- selectedIndex: which alternative (0, 1, or 2) the assistant assumed

IMPORTANT: Keep alternatives VERY SHORT. Just the key differentiator, not full sentences.
BAD: "The user is asking about Python programming"
GOOD: "Python"

BAD: "User is a beginner needing basic explanations"
GOOD: "Beginner"

Only surface 1-3 meaningful assumptions. Return empty array if response is simple/factual.

JSON only.`;

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
    messages: Writable<BuiltInLLMMessage[]>;
    assumptionsByMessage: Writable<MessageAssumptions[]>;
    corrections: Writable<Record<string, Correction>>;
    userContext: Writable<UserContextNote[]>;
  }
>((_, { messages, assumptionsByMessage, corrections, userContext }) => {
  messages.set([]);
  assumptionsByMessage.set([]);
  corrections.set({});
  userContext.set([]);
});

// Handler for ct-radio-group change event
const onAssumptionChange = handler<
  { detail: { value: string } },
  {
    messageIndex: number;
    assumptionLabel: string;
    originalIndex: number;
    alternatives: Array<{ value: string; description?: string }>;
    addMessage: Stream<BuiltInLLMMessage>;
    corrections: Writable<Record<string, Correction>>;
    userContext: Writable<UserContextNote[]>;
  }
>(({ detail }, { messageIndex, assumptionLabel, originalIndex, alternatives, addMessage, corrections, userContext }) => {
  const newIndex = parseInt(detail.value, 10);
  if (isNaN(newIndex)) return;

  const oldValue = alternatives[originalIndex]?.value ?? "";
  const newValue = alternatives[newIndex]?.value ?? "";

  // Key for this correction (replace spaces with underscores for framework compatibility)
  const key = `${messageIndex}-${assumptionLabel.replace(/\s+/g, '_')}`;

  // If clicking the already-selected option, do nothing
  const existing = corrections.key(key).get();
  if (existing && existing.correctedIndex === newIndex) {
    return;
  }
  if (!existing && newIndex === originalIndex) {
    return;
  }

  // Send correction message
  const correctionText = `Regarding ${assumptionLabel.toLowerCase()}: ${newValue} rather than ${oldValue}.`;

  addMessage.send({
    role: "user",
    content: [{ type: "text" as const, text: correctionText }],
  });

  // Update or add correction using spread (workaround for .key().set() on empty Records)
  const current = corrections.get() ?? {};
  corrections.set({ ...current, [key]: { messageIndex, assumptionLabel, originalIndex, correctedIndex: newIndex } });

  // Add user context note
  const contextNote: UserContextNote = {
    id: `context-${Date.now()}`,
    content: `Prefers ${newValue} over ${oldValue} for ${assumptionLabel}`,
    source: "correction",
    createdAt: new Date().toISOString(),
    assumptionLabel,
  };
  userContext.set([...userContext.get(), contextNote]);
});

// Handler for selecting a different alternative (correction flow) - legacy click handler
const selectAlternative = handler<
  unknown,
  {
    messageIndex: number;
    assumptionLabel: string;
    originalIndex: number;
    newIndex: number;
    oldValue: string;
    newValue: string;
    addMessage: Stream<BuiltInLLMMessage>;
    corrections: Writable<Record<string, Correction>>;
    userContext: Writable<UserContextNote[]>;
  }
>((_, { messageIndex, assumptionLabel, originalIndex, newIndex, oldValue, newValue, addMessage, corrections, userContext }) => {
  // Key for this correction (replace spaces with underscores for framework compatibility)
  const key = `${messageIndex}-${assumptionLabel.replace(/\s+/g, '_')}`;

  // If clicking the already-selected option, do nothing
  const existing = corrections.key(key).get();
  if (existing && existing.correctedIndex === newIndex) {
    return;
  }
  if (!existing && newIndex === originalIndex) {
    return;
  }

  // Send correction message
  const correctionText = `Regarding ${assumptionLabel.toLowerCase()}: ${newValue} rather than ${oldValue}.`;

  addMessage.send({
    role: "user",
    content: [{ type: "text" as const, text: correctionText }],
  });

  // Update or add correction using spread (workaround for .key().set() on empty Records)
  const current = corrections.get() ?? {};
  corrections.set({ ...current, [key]: { messageIndex, assumptionLabel, originalIndex, correctedIndex: newIndex } });

  // Add user context note
  const contextNote: UserContextNote = {
    id: `context-${Date.now()}`,
    content: `Prefers ${newValue} over ${oldValue} for ${assumptionLabel}`,
    source: "correction",
    createdAt: new Date().toISOString(),
    assumptionLabel,
  };
  userContext.set([...userContext.get(), contextNote]);
});

// ============================================================================
// Helper Functions (module scope)
// ============================================================================

// Helper function to find unanalyzed message index
function findUnanalyzedIndex(msgList: readonly BuiltInLLMMessage[], analyzed: readonly MessageAssumptions[]): number {
  const analyzedIndices = new Set(analyzed.map(a => a.messageIndex));
  for (let i = msgList.length - 1; i >= 0; i--) {
    if (msgList[i]?.role === "assistant" && !analyzedIndices.has(i)) {
      return i;
    }
  }
  return -1;
}

// Helper function to extract message text
function getMessageText(msg: BuiltInLLMMessage): string {
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c) => c.type === "text")
      .map((c) => ("text" in c ? c.text : ""))
      .join(" ");
  }
  return "";
}

// ============================================================================
// Pattern
// ============================================================================

export default pattern<AssumptionSurfacerInput, AssumptionSurfacerOutput>(
  ({ messages, assumptionsByMessage, corrections, userContext, systemPrompt }) => {
    const model = Writable.of<string>("anthropic:claude-sonnet-4-5");

    // Set up llmDialog for the main chat
    const { addMessage, cancelGeneration, pending } = llmDialog({
      system: computed(
        () => systemPrompt ?? "You are a helpful, concise assistant."
      ),
      messages,
      model,
    });

    // Analyzer model (Haiku for speed/cost)
    const analyzerModel = "anthropic:claude-haiku-4-5";

    // Build analysis prompt - returns empty string if nothing to analyze
    const analysisPrompt = computed(() => {
      const msgList = messages.get() ?? [];
      const analyzed = assumptionsByMessage.get() ?? [];
      const unanalyzedIndex = findUnanalyzedIndex(msgList, analyzed);

      if (unanalyzedIndex < 0) return "";

      const conversationText = msgList
        .slice(0, unanalyzedIndex + 1)
        .map((msg) => `${msg.role.toUpperCase()}: ${getMessageText(msg)}`)
        .join("\n\n");

      return `Analyze the LAST assistant response:\n\n${conversationText}`;
    });

    // Run analysis for unanalyzed messages
    const analysisResult = generateObject<AnalysisResult>({
      prompt: analysisPrompt,
      system: ANALYZER_SYSTEM_PROMPT,
      model: analyzerModel,
    });

    // NOTE: We removed the save mechanism. Instead, assumptionsJsx displays
    // analysisResult.result directly. The assumptionsByMessage cell is not used
    // for auto-saving anymore - it could be used for historical data if needed.

    // Title generation from first message
    const title = computed(() => {
      const msgList = messages.get() ?? [];
      if (msgList.length === 0) return "Assumption Surfacer";
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
    const hasUserContext = computed(() => {
      const ctx = userContext.get();
      return ctx && ctx.length > 0;
    });
    const userContextCount = computed(() => {
      const ctx = userContext.get();
      return ctx ? ctx.length : 0;
    });
    const isAnalyzing = computed(() => {
      // Check if we have something to analyze and analysis is pending
      const msgList = messages.get() ?? [];
      const analyzed = assumptionsByMessage.get() ?? [];
      const idx = findUnanalyzedIndex(msgList, analyzed);
      return idx >= 0 && analysisResult.pending;
    });

    // Build assumptions JSX directly from analysisResult.result
    // This avoids needing to save to a cell, which causes issues with closures
    const assumptionsJsx = computed(() => {
      const result = analysisResult.result;
      const isPending = analysisResult.pending;
      const correctionsMap = corrections.get() ?? {};

      // Show loading state if analyzing
      if (isPending) {
        return (
          <div
            style={{
              color: "var(--ct-color-text-secondary, #888)",
              fontStyle: "italic",
              textAlign: "center",
              padding: "1rem",
              fontSize: "0.8rem",
            }}
          >
            Analyzing...
          </div>
        );
      }

      // No result yet
      if (!result || !result.assumptions || result.assumptions.length === 0) {
        return (
          <div
            style={{
              color: "var(--ct-color-text-secondary, #888)",
              fontStyle: "italic",
              textAlign: "center",
              padding: "1rem",
              fontSize: "0.8rem",
            }}
          >
            Start a conversation to see assumptions.
          </div>
        );
      }

      const elements: any[] = [];
      let elementIndex = 0;

      // Display assumptions from the latest analysis
      // Note: messageIndex is hardcoded to 0 for now since we only have current result
      const messageIndex = 0;

      for (const assumption of result.assumptions) {
        const assumptionLabel = assumption.label;

        // Check if user has corrected this assumption - direct key lookup!
        // Key uses underscores instead of spaces for framework compatibility
        const key = `${messageIndex}-${assumptionLabel.replace(/\s+/g, '_')}`;
        const correction = correctionsMap[key];
        const currentSelectedIndex = correction
          ? correction.correctedIndex
          : assumption.selectedIndex;

        // Convert alternatives to ct-radio-group items format
        const radioItems = assumption.alternatives.map((alt, idx) => ({
          label: alt.value,
          value: String(idx),
        }));

        // Assumption card container with ct-radio-group
        elements.push(
          <div
            key={elementIndex++}
            style={{
              marginBottom: "0.5rem",
              borderRadius: "6px",
              border: "1px solid var(--ct-color-border, #e0e0e0)",
              overflow: "hidden",
            }}
          >
            {/* Label */}
            <div
              style={{
                padding: "0.4rem 0.6rem",
                backgroundColor: "var(--ct-color-surface-secondary, #f5f5f5)",
                fontWeight: 600,
                fontSize: "0.75rem",
                borderBottom: "1px solid var(--ct-color-border, #e0e0e0)",
              }}
            >
              {assumptionLabel}
            </div>

            {/* Alternatives using ct-radio-group */}
            <div style={{ padding: "0.3rem", fontSize: "0.75rem" }}>
              <ct-radio-group
                value={String(currentSelectedIndex)}
                items={radioItems}
                onct-change={onAssumptionChange({
                  messageIndex,
                  assumptionLabel,
                  originalIndex: assumption.selectedIndex,
                  alternatives: assumption.alternatives,
                  addMessage,
                  corrections,
                  userContext,
                })}
              />
            </div>
          </div>
        );
      }

      return <>{elements}</>;
    });

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
                onClick={clearChat({ messages, assumptionsByMessage, corrections, userContext })}
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Assumptions</span>
                {isAnalyzing && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--ct-color-text-secondary, #888)",
                      fontWeight: 400,
                    }}
                  >
                    Analyzing...
                  </span>
                )}
              </div>

              <ct-vscroll style="padding: 1rem; flex: 1;" flex showScrollbar>
                {/* JSX computed inside assumptionsJsx to enable reactivity
                    See: community-docs/superstitions/2025-11-21-cannot-map-computed-arrays-in-jsx.md
                    Also avoids CPU loop by reading generateObject result directly
                    See: community-docs/superstitions/2025-12-06-computed-set-causes-cpu-loop.md */}
                {assumptionsJsx}
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
      assumptionsByMessage,
      corrections,
      userContext,
    };
  }
);
