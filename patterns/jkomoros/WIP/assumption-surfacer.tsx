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

// WORKAROUND: Frame Mismatch Bug with Nested Array Mapping
// Issue: patterns/jkomoros/issues/ISSUE-Frame-Mismatch-Nested-Array-JSX-Map.md
// Superstition: community-docs/superstitions/2025-06-12-jsx-nested-array-map-frame-mismatch.md
//
// Mapping over `assumption.alternatives` in JSX triggers a "Frame mismatch" error.
// Workaround: Store alternatives in a separate flat array with parent references.
// When bug is fixed: Remove FlatAlternative, restore alternatives[] on Assumption,
// and use direct nested mapping in JSX.

interface FlatAlternative {
  parentId: string; // Links back to parent Assumption
  index: number; // Position within assumption's alternatives
  value: string;
  description?: string;
}

// WORKAROUND: RenderRow for flat UI rendering
// Used to avoid nested array mapping in JSX which triggers Frame mismatch
// Each row is either a "header" (assumption label) or "option" (clickable alternative)
interface RenderRow {
  key: string;
  rowType: "header" | "option";
  assumptionId: string;
  // Header fields
  label?: string;
  description?: string;
  // Option fields
  optionIndex?: number;
  optionLabel?: string;
  isSelected?: boolean;
}

interface Assumption {
  id: string;
  label: string;
  description?: string;
  // WORKAROUND: alternatives stored in separate flatAlternatives cell
  // Original: alternatives: Alternative[];
  alternativeCount: number; // Just store count for reference
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
  // WORKAROUND: flatAlternatives stored separately due to Frame mismatch bug
  flatAlternatives?: Cell<Default<FlatAlternative[], []>>;
  userContext?: Cell<Default<UserContextNote[], []>>;
  systemPrompt?: string;
}

interface AssumptionSurfacerOutput {
  messages: BuiltInLLMMessage[];
  assumptions: Assumption[];
  // WORKAROUND: flatAlternatives stored separately due to Frame mismatch bug
  flatAlternatives: FlatAlternative[];
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
    assumptions: Cell<Assumption[]>;
    flatAlternatives: Cell<FlatAlternative[]>;
    pending: Cell<boolean | undefined>;
  }
>((_, { messages, assumptions, flatAlternatives, pending }) => {
  messages.set([]);
  assumptions.set([]);
  flatAlternatives.set([]);
  pending.set(false);
});

// Handler for selecting a different alternative (correction flow)
// The optionIndex is passed as part of the dependencies (bound at render time)
const selectAlternative = handler<
  unknown,
  {
    assumptionId: string;
    optionIndex: number;
    addMessage: Stream<BuiltInLLMMessage>;
    assumptions: Cell<Assumption[]>;
    flatAlternatives: Cell<FlatAlternative[]>;
    userContext: Cell<UserContextNote[]>;
  }
>((_, { assumptionId, optionIndex, addMessage, assumptions, flatAlternatives, userContext }) => {
  const newIndex = optionIndex;
  // Find the assumption
  const assumptionList = assumptions.get();
  const assumption = assumptionList.find((a) => a.id === assumptionId);
  if (!assumption) return;

  // If clicking the already-selected option, do nothing
  if (newIndex === assumption.selectedIndex) return;

  // Get the alternatives for this assumption
  const altList = flatAlternatives.get();
  const alternatives = altList
    .filter((a) => a.parentId === assumptionId)
    .sort((a, b) => a.index - b.index);

  const oldAlt = alternatives.find((a) => a.index === assumption.selectedIndex);
  const newAlt = alternatives.find((a) => a.index === newIndex);

  if (!oldAlt || !newAlt) return;

  // Send correction message
  // Format: "Regarding {label}: {new_value} rather than {old_value}."
  const correctionText = `Regarding ${assumption.label.toLowerCase()}: ${newAlt.value} rather than ${oldAlt.value}.`;

  addMessage.send({
    role: "user",
    content: [{ type: "text" as const, text: correctionText }],
  });

  // Update assumption's selectedIndex
  assumptions.set(
    assumptionList.map((a) =>
      a.id === assumptionId
        ? { ...a, selectedIndex: newIndex, status: "resolved" as const }
        : a
    )
  );

  // Add user context note
  const contextNote: UserContextNote = {
    id: `context-${Date.now()}`,
    content: `User clarified: prefers ${newAlt.value} over ${oldAlt.value} for ${assumption.label}`,
    source: "correction",
    createdAt: new Date().toISOString(),
    relatedAssumptionId: assumptionId,
  };
  userContext.set([...userContext.get(), contextNote]);
});

// ============================================================================
// Pattern
// ============================================================================

export default pattern<AssumptionSurfacerInput, AssumptionSurfacerOutput>(
  ({ messages, assumptions, flatAlternatives, userContext, systemPrompt }) => {
    const model = Cell.of<string>("anthropic:claude-sonnet-4-5");

    // Set up llmDialog for the main chat
    const { addMessage, cancelGeneration, pending } = llmDialog({
      system: computed(
        () => systemPrompt ?? "You are a helpful, concise assistant."
      ),
      messages,
      model,
    });

    // Track which message indices we've analyzed to avoid re-analyzing
    const analyzedCount = Cell.of<number>(0);

    // Analyzer model (Haiku for speed/cost)
    const analyzerModel = "anthropic:claude-haiku-4-5";

    // Build the analysis prompt from conversation
    const analysisPrompt = computed(() => {
      const msgList = messages.get();
      const analyzed = analyzedCount.get();

      // Find the last assistant message that hasn't been analyzed
      let lastAssistantIdx = -1;
      for (let i = msgList.length - 1; i >= 0; i--) {
        if (msgList[i].role === "assistant") {
          lastAssistantIdx = i;
          break;
        }
      }

      // If no new assistant message to analyze, return empty
      if (lastAssistantIdx < 0 || lastAssistantIdx < analyzed) {
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
    const analysisResult = generateObject<AnalysisResult>({
      prompt: analysisPrompt,
      system: ANALYZER_SYSTEM_PROMPT,
      model: analyzerModel,
    });

    // When analysis completes, update assumptions
    // Note: In computed(), we access reactive values directly (no .get())
    const _updateAssumptions = computed(() => {
      // analysisPrompt is a computed, access directly
      const prompt = analysisPrompt;
      if (!prompt) return; // No analysis needed

      const result = analysisResult.result;
      const isPending = analysisResult.pending;
      const error = analysisResult.error;

      if (isPending || error || !result) return;

      // messages is a Cell, use .get() to read
      const msgList = messages.get();
      // Find the message ID for the last assistant message
      let lastAssistantIdx = -1;
      for (let i = msgList.length - 1; i >= 0; i--) {
        if (msgList[i].role === "assistant") {
          lastAssistantIdx = i;
          break;
        }
      }

      if (lastAssistantIdx < 0) return;

      // Mark as analyzed - need .set() for Cell mutation
      analyzedCount.set(lastAssistantIdx + 1);

      // WORKAROUND: Frame Mismatch Bug - store alternatives in separate flat array
      // Convert analyzed assumptions to our format and add to assumptions cell
      const newAssumptions: Assumption[] = [];
      const newFlatAlternatives: FlatAlternative[] = [];

      result.assumptions.forEach((a, idx) => {
        const parentId = `assumption-${Date.now()}-${idx}`;

        // Create assumption WITHOUT nested alternatives (workaround)
        newAssumptions.push({
          id: parentId,
          label: a.label,
          description: a.description,
          alternativeCount: a.alternatives.length,
          selectedIndex: a.selectedIndex,
          messageId: `msg-${lastAssistantIdx}`,
          status: "active" as const,
        });

        // Create flat alternatives with parent reference
        a.alternatives.forEach((alt, altIdx) => {
          newFlatAlternatives.push({
            parentId: parentId,  // Explicit assignment to avoid shorthand issues
            index: altIdx,
            value: alt.value,
            description: alt.description,
          });
        });
      });

      if (newAssumptions.length > 0) {
        // Need .get()/.set() for Cell mutation
        const currentAssumptions = assumptions.get();
        assumptions.set([...currentAssumptions, ...newAssumptions]);

        const currentAlternatives = flatAlternatives.get();
        flatAlternatives.set([...currentAlternatives, ...newFlatAlternatives]);
      }
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
    const isAnalyzing = computed(() => {
      // analysisPrompt is a computed, access directly (no .get())
      return analysisPrompt !== "" && analysisResult.pending;
    });

    // WORKAROUND: Pre-compute a completely flat array for rendering
    // This avoids nested array mapping in JSX which triggers Frame mismatch
    // See: community-docs/superstitions/2025-06-12-jsx-nested-array-map-frame-mismatch.md
    //
    // Strategy: Create rows for headers AND options in a single flat array.
    // Each row has a rowType to determine how to render it.

    const renderRows = computed((): RenderRow[] => {
      const assumptionList = assumptions.get();
      const altList = flatAlternatives.get();
      const rows: RenderRow[] = [];

      for (const assumption of assumptionList) {
        const currentAssumptionId = assumption.id;
        const currentSelectedIndex = assumption.selectedIndex;

        // Header row
        rows.push({
          key: `header-${currentAssumptionId}`,
          rowType: "header",
          assumptionId: currentAssumptionId,
          label: assumption.label,
          description: assumption.description,
        });

        // Get alternatives for this assumption
        const alts = altList.filter(
          (flatAlt) => flatAlt.parentId === currentAssumptionId
        );
        alts.sort((a, b) => a.index - b.index);

        // Option rows (one per alternative)
        for (const alt of alts) {
          rows.push({
            key: `option-${currentAssumptionId}-${alt.index}`,
            rowType: "option",
            assumptionId: currentAssumptionId,
            optionIndex: alt.index,
            optionLabel: alt.value,
            isSelected: alt.index === currentSelectedIndex,
          });
        }
      }

      return rows;
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
                onClick={clearChat({ messages, assumptions, flatAlternatives, pending })}
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
                {/* WORKAROUND: Single flat map over renderRows
                    See: community-docs/superstitions/2025-06-12-jsx-nested-array-map-frame-mismatch.md */}
                {hasAssumptions ? (
                  renderRows.map((row) =>
                    row.rowType === "header" ? (
                      <div
                        key={row.key}
                        style={{
                          padding: "0.5rem 0.75rem",
                          marginTop: "0.75rem",
                          backgroundColor:
                            "var(--ct-color-surface-secondary, #f5f5f5)",
                          borderRadius: "8px 8px 0 0",
                          borderTop: "1px solid var(--ct-color-border, #e0e0e0)",
                          borderLeft: "1px solid var(--ct-color-border, #e0e0e0)",
                          borderRight: "1px solid var(--ct-color-border, #e0e0e0)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "0.9rem",
                          }}
                        >
                          {row.label}
                        </div>
                        {row.description && (
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--ct-color-text-secondary, #666)",
                              marginTop: "0.25rem",
                            }}
                          >
                            {row.description}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        key={row.key}
                        style={{
                          padding: "0.25rem 0.75rem",
                          backgroundColor:
                            "var(--ct-color-surface-secondary, #f5f5f5)",
                          borderLeft: "1px solid var(--ct-color-border, #e0e0e0)",
                          borderRight: "1px solid var(--ct-color-border, #e0e0e0)",
                        }}
                      >
                        <ct-button
                          variant="pill"
                          type="button"
                          style={
                            row.isSelected
                              ? "width: 100%; justify-content: flex-start; background-color: var(--ct-color-accent-light, #e3f2fd); border: 1px solid var(--ct-color-accent, #2196f3);"
                              : "width: 100%; justify-content: flex-start; background-color: white; border: 1px solid var(--ct-color-border, #ddd);"
                          }
                          onClick={selectAlternative({
                            assumptionId: row.assumptionId,
                            optionIndex: row.optionIndex ?? 0,
                            addMessage,
                            assumptions,
                            flatAlternatives,
                            userContext,
                          })}
                        >
                          <span
                            style={{
                              marginRight: "0.5rem",
                              fontSize: "0.8rem",
                              color: row.isSelected
                                ? "var(--ct-color-accent, #2196f3)"
                                : "var(--ct-color-text-secondary, #888)",
                            }}
                          >
                            {row.isSelected ? "●" : "○"}
                          </span>
                          <span style={{ fontSize: "0.85rem" }}>
                            {row.optionLabel}
                          </span>
                        </ct-button>
                      </div>
                    )
                  )
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
      // WORKAROUND: flatAlternatives stored separately due to Frame mismatch bug
      flatAlternatives,
      userContext,
    };
  }
);
