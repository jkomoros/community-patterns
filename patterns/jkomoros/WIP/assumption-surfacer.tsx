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
interface RenderRow {
  key: string;
  rowType: "header" | "alt" | "spacer";
  // Header fields
  parentId?: string;
  label?: string;
  description?: string;
  // Alt fields
  altIndex?: number;
  altValue?: string;
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

    // WORKAROUND: Pre-compute a single flat array of all renderable items
    // This avoids nested array mapping in JSX which triggers Frame mismatch
    // See: community-docs/superstitions/2025-06-12-jsx-nested-array-map-frame-mismatch.md
    //
    // Strategy: Create a completely flat array where each item knows how to render itself.
    // We use a "rowType" field to distinguish between headers, alternatives, and spacing.
    // This allows a SINGLE .map() call in JSX with no nesting.
    // Note: RenderRow interface defined at top-level to work with CTS transform.

    const renderRows = computed((): RenderRow[] => {
      const assumptionList = assumptions.get();
      const altList = flatAlternatives.get();
      const rows: RenderRow[] = [];

      for (const assumption of assumptionList) {
        // Header row
        rows.push({
          key: `header-${assumption.id}`,
          rowType: "header",
          parentId: assumption.id,
          label: assumption.label,
          description: assumption.description,
        });

        // Get alternatives for this assumption
        // Note: Using explicit property names to avoid framework transform issues
        const currentAssumptionId = assumption.id;
        const currentSelectedIndex = assumption.selectedIndex;
        const alts = altList.filter(
          (flatAlt) => flatAlt.parentId === currentAssumptionId
        );
        alts.sort((a, b) => a.index - b.index);

        for (const flatAlt of alts) {
          rows.push({
            key: `alt-${currentAssumptionId}-${flatAlt.index}`,
            rowType: "alt",
            parentId: currentAssumptionId,
            altIndex: flatAlt.index,
            altValue: flatAlt.value,
            isSelected: flatAlt.index === currentSelectedIndex,
          });
        }

        // Spacer row
        rows.push({
          key: `spacer-${assumption.id}`,
          rowType: "spacer",
          parentId: assumption.id,
        });
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
                {/* WORKAROUND: Single flat map to avoid nested Cell array mapping */}
                {/* See: community-docs/superstitions/2025-06-12-jsx-nested-array-map-frame-mismatch.md */}
                {hasAssumptions ? (
                  renderRows.map((row) =>
                    row.rowType === "header" ? (
                      <div
                        key={row.key}
                        style={{
                          padding: "0.75rem",
                          paddingBottom: "0.25rem",
                          marginTop: "0.75rem",
                          backgroundColor:
                            "var(--ct-color-surface-secondary, #f5f5f5)",
                          borderRadius: "8px 8px 0 0",
                          border: "1px solid var(--ct-color-border, #e0e0e0)",
                          borderBottom: "none",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: "0.9rem",
                          }}
                        >
                          {row.label}
                        </div>
                        {row.description && (
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--ct-color-text-secondary, #666)",
                              marginTop: "0.25rem",
                            }}
                          >
                            {row.description}
                          </div>
                        )}
                      </div>
                    ) : row.rowType === "alt" ? (
                      <div
                        key={row.key}
                        style={{
                          padding: "0.25rem 0.75rem",
                          backgroundColor:
                            "var(--ct-color-surface-secondary, #f5f5f5)",
                          borderLeft: "1px solid var(--ct-color-border, #e0e0e0)",
                          borderRight:
                            "1px solid var(--ct-color-border, #e0e0e0)",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "0.25rem",
                            cursor: "pointer",
                            borderRadius: "4px",
                            backgroundColor: row.isSelected
                              ? "var(--ct-color-accent-light, #e3f2fd)"
                              : "transparent",
                          }}
                        >
                          <input
                            type="radio"
                            name={`assumption-${row.parentId}`}
                            checked={row.isSelected}
                            onChange={() => {
                              /* TODO: implement selection handler */
                            }}
                          />
                          <span style={{ fontSize: "0.85rem" }}>
                            {row.altValue}
                          </span>
                        </label>
                      </div>
                    ) : (
                      <div
                        key={row.key}
                        style={{
                          height: "0.5rem",
                          backgroundColor:
                            "var(--ct-color-surface-secondary, #f5f5f5)",
                          borderRadius: "0 0 8px 8px",
                          border: "1px solid var(--ct-color-border, #e0e0e0)",
                          borderTop: "none",
                        }}
                      />
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
