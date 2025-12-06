/// <cts-enable />
import {
  BuiltInLLMMessage,
  Cell,
  computed,
  Default,
  generateObject,
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

// ARCHITECTURE NOTE: Avoiding CPU loops with generateObject
// See: community-docs/superstitions/2025-12-06-computed-set-causes-cpu-loop.md
//
// Problem: Using computed() to copy generateObject results into cells causes
// 100% CPU loops. Computed cannot call .set() - it silently fails but can
// trigger reactive loops.
//
// Solution: Display analysisResult.result directly (reactive). Store only
// user corrections in cells. Merge in computed for display.

// Tracks user corrections to assumption selections
interface Correction {
  assumptionLabel: string; // Identify assumption by label (stable across analyses)
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
  messages?: Cell<Default<BuiltInLLMMessage[], []>>;
  corrections?: Cell<Default<Correction[], []>>;
  userContext?: Cell<Default<UserContextNote[], []>>;
  systemPrompt?: string;
}

interface AssumptionSurfacerOutput {
  messages: BuiltInLLMMessage[];
  corrections: Correction[];
  userContext: UserContextNote[];
}

// ============================================================================
// Analyzer Types and Prompts
// ============================================================================

interface AnalyzedAssumption {
  label: string;
  description?: string;
  alternatives: Array<{ value: string; description?: string }>;
  selectedIndex: number;
}

interface AnalysisResult {
  assumptions: AnalyzedAssumption[];
}

const ANALYZER_SYSTEM_PROMPT = `You are an assumption analyzer. Given a conversation and the latest assistant response, identify implicit assumptions the assistant made when responding.

For each assumption you detect:
1. Give it a clear, short label (2-4 words, e.g., "Programming Language", "Skill Level", "Time Frame")
2. Optionally provide a brief description of why this assumption matters
3. Provide exactly 3 alternative interpretations/values
4. Indicate which alternative (0, 1, or 2) the assistant actually assumed in their response

Types of assumptions to look for:
- Technical context (language, framework, platform, version)
- User expertise level (beginner, intermediate, expert)
- Intent/goal interpretation (what the user actually wants to accomplish)
- Scope assumptions (how comprehensive the answer should be)
- Domain context (industry, use case, environment)
- Preference assumptions (style, approach, priorities)

Only surface meaningful assumptions where the user might want to clarify. Don't surface obvious or trivial assumptions.

If the response is simple/factual with no significant assumptions, return an empty assumptions array.

Respond with JSON only.`;

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
    corrections: Cell<Correction[]>;
    userContext: Cell<UserContextNote[]>;
    pending: Cell<boolean | undefined>;
  }
>((_, { messages, corrections, userContext, pending }) => {
  messages.set([]);
  corrections.set([]);
  userContext.set([]);
  pending.set(false);
});

// Handler for selecting a different alternative (correction flow)
// Uses assumption label to track corrections across analysis refreshes
const selectAlternative = handler<
  unknown,
  {
    assumptionLabel: string;
    originalIndex: number;
    newIndex: number;
    oldValue: string;
    newValue: string;
    addMessage: Stream<BuiltInLLMMessage>;
    corrections: Cell<Correction[]>;
    userContext: Cell<UserContextNote[]>;
  }
>((_, { assumptionLabel, originalIndex, newIndex, oldValue, newValue, addMessage, corrections, userContext }) => {
  // If clicking the already-selected option, do nothing
  if (newIndex === originalIndex) {
    // Check if there's a correction for this - if so, remove it
    const currentCorrections = corrections.get();
    const existing = currentCorrections.find(c => c.assumptionLabel === assumptionLabel);
    if (existing && existing.correctedIndex === newIndex) {
      return; // Already at this selection, nothing to do
    }
  }

  // Send correction message
  const correctionText = `Regarding ${assumptionLabel.toLowerCase()}: ${newValue} rather than ${oldValue}.`;

  addMessage.send({
    role: "user",
    content: [{ type: "text" as const, text: correctionText }],
  });

  // Update or add correction
  const currentCorrections = corrections.get();
  const existingIdx = currentCorrections.findIndex(c => c.assumptionLabel === assumptionLabel);

  if (existingIdx >= 0) {
    // Update existing correction
    const updated = [...currentCorrections];
    updated[existingIdx] = { assumptionLabel, originalIndex, correctedIndex: newIndex };
    corrections.set(updated);
  } else {
    // Add new correction
    corrections.set([...currentCorrections, { assumptionLabel, originalIndex, correctedIndex: newIndex }]);
  }

  // Add user context note
  const contextNote: UserContextNote = {
    id: `context-${Date.now()}`,
    content: `User clarified: prefers ${newValue} over ${oldValue} for ${assumptionLabel}`,
    source: "correction",
    createdAt: new Date().toISOString(),
    assumptionLabel,
  };
  userContext.set([...userContext.get(), contextNote]);
});

// ============================================================================
// Pattern
// ============================================================================

export default pattern<AssumptionSurfacerInput, AssumptionSurfacerOutput>(
  ({ messages, corrections, userContext, systemPrompt }) => {
    const model = Cell.of<string>("anthropic:claude-sonnet-4-5");

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

    // Build the analysis prompt from conversation
    // Analyzes the LAST assistant message only
    const analysisPrompt = computed(() => {
      const msgList = messages.get();

      // Find the last assistant message
      let lastAssistantIdx = -1;
      for (let i = msgList.length - 1; i >= 0; i--) {
        if (msgList[i].role === "assistant") {
          lastAssistantIdx = i;
          break;
        }
      }

      // If no assistant message, return empty
      if (lastAssistantIdx < 0) {
        return "";
      }

      // Build conversation context
      const conversationText = msgList
        .slice(0, lastAssistantIdx + 1)
        .map((msg) => {
          const content =
            typeof msg.content === "string"
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content
                    .filter((c) => c.type === "text")
                    .map((c) => ("text" in c ? c.text : ""))
                    .join(" ")
                : "";
          return `${msg.role.toUpperCase()}: ${content}`;
        })
        .join("\n\n");

      return `Analyze this conversation and identify assumptions in the LAST assistant response:

${conversationText}

Identify any implicit assumptions the assistant made in their final response.`;
    });

    // Run analysis when there's a prompt
    // NOTE: We display analysisResult.result directly in JSX - no copying to cells!
    // This avoids the CPU loop caused by calling .set() inside computed.
    // See: community-docs/superstitions/2025-12-06-computed-set-causes-cpu-loop.md
    const analysisResult = generateObject<AnalysisResult>({
      prompt: analysisPrompt,
      system: ANALYZER_SYSTEM_PROMPT,
      model: analyzerModel,
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
    const hasUserContext = computed(() => userContext.get().length > 0);
    const userContextCount = computed(() => userContext.get().length);
    const isAnalyzing = computed(() => {
      return analysisPrompt !== "" && analysisResult.pending;
    });

    // Build assumptions JSX directly from analysisResult.result
    // Merges with corrections cell to show user's updated selections
    // This pattern avoids CPU loops by not copying generateObject results to cells
    const assumptionsJsx = computed(() => {
      const result = analysisResult.result;
      const isPending = analysisResult.pending;
      const correctionsList = corrections.get();

      // Show loading state
      if (isPending && !result) {
        return (
          <div
            style={{
              color: "var(--ct-color-text-secondary, #888)",
              fontStyle: "italic",
              textAlign: "center",
              padding: "2rem 1rem",
            }}
          >
            Analyzing response...
          </div>
        );
      }

      // No analysis yet or empty result
      if (!result || result.assumptions.length === 0) {
        return (
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
        );
      }

      const elements: any[] = [];
      let elementIndex = 0;

      for (const assumption of result.assumptions) {
        const assumptionLabel = assumption.label;

        // Check if user has corrected this assumption
        const correction = correctionsList.find(c => c.assumptionLabel === assumptionLabel);
        const currentSelectedIndex = correction
          ? correction.correctedIndex
          : assumption.selectedIndex;

        // Header element
        elements.push(
          <div
            key={elementIndex++}
            style={{
              padding: "0.5rem 0.75rem",
              marginTop: "0.75rem",
              backgroundColor: "var(--ct-color-surface-secondary, #f5f5f5)",
              borderRadius: "8px 8px 0 0",
              borderTop: "1px solid var(--ct-color-border, #e0e0e0)",
              borderLeft: "1px solid var(--ct-color-border, #e0e0e0)",
              borderRight: "1px solid var(--ct-color-border, #e0e0e0)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {assumptionLabel}
            </div>
            {assumption.description && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--ct-color-text-secondary, #666)",
                  marginTop: "0.25rem",
                }}
              >
                {assumption.description}
              </div>
            )}
          </div>
        );

        // Option elements - iterate over alternatives
        for (let altIndex = 0; altIndex < assumption.alternatives.length; altIndex++) {
          const alt = assumption.alternatives[altIndex];
          const isSelected = altIndex === currentSelectedIndex;
          const originalValue = assumption.alternatives[assumption.selectedIndex]?.value ?? "";

          elements.push(
            <div
              key={elementIndex++}
              style={{
                padding: "0.25rem 0.75rem",
                backgroundColor: "var(--ct-color-surface-secondary, #f5f5f5)",
                borderLeft: "1px solid var(--ct-color-border, #e0e0e0)",
                borderRight: "1px solid var(--ct-color-border, #e0e0e0)",
              }}
            >
              <ct-button
                variant="pill"
                type="button"
                style={
                  isSelected
                    ? "width: 100%; justify-content: flex-start; background-color: var(--ct-color-accent-light, #e3f2fd); border: 1px solid var(--ct-color-accent, #2196f3);"
                    : "width: 100%; justify-content: flex-start; background-color: white; border: 1px solid var(--ct-color-border, #ddd);"
                }
                onClick={selectAlternative({
                  assumptionLabel,
                  originalIndex: assumption.selectedIndex,
                  newIndex: altIndex,
                  oldValue: originalValue,
                  newValue: alt.value,
                  addMessage,
                  corrections,
                  userContext,
                })}
              >
                <span
                  style={{
                    marginRight: "0.5rem",
                    fontSize: "0.8rem",
                    color: isSelected
                      ? "var(--ct-color-accent, #2196f3)"
                      : "var(--ct-color-text-secondary, #888)",
                  }}
                >
                  {isSelected ? "●" : "○"}
                </span>
                <span style={{ fontSize: "0.85rem" }}>{alt.value}</span>
              </ct-button>
            </div>
          );
        }
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
                onClick={clearChat({ messages, corrections, userContext, pending })}
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
      corrections,
      userContext,
    };
  }
);
