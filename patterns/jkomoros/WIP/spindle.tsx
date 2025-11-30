/// <cts-enable />
/**
 * SPINDLE - Single Spindle Component
 *
 * The atomic unit of the Spindle system. Handles:
 * - Receiving composed input from parent(s)
 * - Generating n options via LLM
 * - Displaying options for selection
 * - Pin/unpin on click
 * - Respin functionality
 * - Summary generation
 *
 * Uses FIXED SLOTS approach (4 options) to work with framework reactivity.
 * See design/todo/spindle-prd.md for full specification.
 */
import {
  Cell,
  Default,
  derive,
  generateObject,
  handler,
  ifElse,
  NAME,
  pattern,
  toSchema,
  UI,
} from "commontools";

// =============================================================================
// TYPES
// =============================================================================

interface GenerationResult {
  options: Array<{ content: string }>;
}

interface SummaryResult {
  summary: string;
}

interface SpindleInput {
  // Display
  title: Default<string, "Untitled Spindle">;

  // Generation inputs
  composedInput: Default<string, "">; // From parent spindle(s)
  prompt: Default<string, "">;

  // Summary config
  summaryPrompt: Default<string, "Summarize the above in 2-3 concise sentences.">;

  // Behavior
  generate: Default<boolean, true>; // If false, output = prompt (for human-input roots)

  // State (persisted)
  pinnedIndex: Cell<number>; // Which option is pinned (-1 = none)
  spinVersion: Cell<number>; // Increment to trigger respin
}

// =============================================================================
// CONSTANTS
// =============================================================================

const NUM_OPTIONS = 4; // Fixed for MVP

// =============================================================================
// HANDLERS - Must be defined to pass Cells as parameters, not closure
// =============================================================================

const pinOption = handler<
  unknown,
  { index: number; pinnedIndexCell: Cell<number> }
>((_, { index, pinnedIndexCell }) => {
  const currentPinned = pinnedIndexCell.get();
  if (currentPinned === index) {
    pinnedIndexCell.set(-1); // Unpin
  } else {
    pinnedIndexCell.set(index); // Pin this one
  }
});

const respinAll = handler<
  unknown,
  { pinnedIndexCell: Cell<number>; spinVersionCell: Cell<number> }
>((_, { pinnedIndexCell, spinVersionCell }) => {
  pinnedIndexCell.set(-1);
  spinVersionCell.set((spinVersionCell.get() || 0) + 1);
});

// =============================================================================
// PATTERN
// =============================================================================

export default pattern<SpindleInput>(
  ({
    title,
    composedInput,
    prompt,
    summaryPrompt,
    generate,
    pinnedIndex,
    spinVersion,
  }) => {
    // =========================================================================
    // PROMPT COMPOSITION
    // =========================================================================

    const fullPrompt = derive(
      { composedInput, prompt, spinVersion },
      (deps: { composedInput: string; prompt: string; spinVersion: number }) => {
        if (!deps.prompt || deps.prompt.trim() === "") {
          return "";
        }

        const parts: string[] = [];

        if (deps.composedInput && deps.composedInput.trim() !== "") {
          parts.push(deps.composedInput.trim());
          parts.push("\n\n---\n\n");
        }

        parts.push(deps.prompt.trim());
        parts.push(`\n\n---\n\nGenerate exactly ${NUM_OPTIONS} distinct options for the above request.`);
        parts.push("\nEach option should take a meaningfully different creative approach.");
        parts.push("\nMake each option complete and self-contained.");
        // Add spinVersion to bust cache on respin
        parts.push(`\n\n[Generation ${deps.spinVersion}]`);

        return parts.join("");
      }
    );

    // =========================================================================
    // OPTION GENERATION
    // =========================================================================

    // Only generate if generate=true and we have a prompt
    const shouldGenerate = derive(
      { generate, prompt },
      (deps: { generate: boolean; prompt: string }) => deps.generate && deps.prompt && deps.prompt.trim() !== ""
    );

    // Generate options via LLM
    const generation = generateObject<GenerationResult>({
      system: `You are a creative writing assistant. Generate multiple distinct options as requested.
Each option should be meaningfully different - not just minor variations.
Be creative and explore different approaches, tones, or angles.
Return exactly ${NUM_OPTIONS} options.`,
      prompt: fullPrompt,
      schema: toSchema<GenerationResult>(),
    });

    // Extract individual options using fixed slots approach
    const option0 = derive(
      { shouldGenerate, generation, prompt },
      (deps: { shouldGenerate: boolean; generation: { pending: boolean; error?: string; result?: GenerationResult }; prompt: string }) => {
        if (!deps.shouldGenerate) return deps.prompt || "";
        if (deps.generation.pending || deps.generation.error || !deps.generation.result) return null;
        return deps.generation.result.options?.[0]?.content || null;
      }
    );

    const option1 = derive(
      { shouldGenerate, generation },
      (deps: { shouldGenerate: boolean; generation: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate) return null;
        if (deps.generation.pending || deps.generation.error || !deps.generation.result) return null;
        return deps.generation.result.options?.[1]?.content || null;
      }
    );

    const option2 = derive(
      { shouldGenerate, generation },
      (deps: { shouldGenerate: boolean; generation: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate) return null;
        if (deps.generation.pending || deps.generation.error || !deps.generation.result) return null;
        return deps.generation.result.options?.[2]?.content || null;
      }
    );

    const option3 = derive(
      { shouldGenerate, generation },
      (deps: { shouldGenerate: boolean; generation: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate) return null;
        if (deps.generation.pending || deps.generation.error || !deps.generation.result) return null;
        return deps.generation.result.options?.[3]?.content || null;
      }
    );

    // =========================================================================
    // OUTPUT (PINNED OPTION)
    // =========================================================================

    const output = derive(
      { option0, option1, option2, option3, pinnedIndex },
      (deps: { option0: string | null; option1: string | null; option2: string | null; option3: string | null; pinnedIndex: number }) => {
        const options = [deps.option0, deps.option1, deps.option2, deps.option3];
        if (deps.pinnedIndex < 0 || deps.pinnedIndex >= options.length) return null;
        return options[deps.pinnedIndex];
      }
    );

    const isPinned = derive(pinnedIndex, (idx: number) => idx >= 0);

    // =========================================================================
    // SUMMARY GENERATION
    // =========================================================================

    const summaryFullPrompt = derive(
      { output, summaryPrompt },
      (deps: { output: string | null; summaryPrompt: string }) => {
        if (!deps.output) return "";
        return `${deps.output}\n\n---\n\n${deps.summaryPrompt}`;
      }
    );

    const summaryGeneration = generateObject<SummaryResult>({
      system: "You are a concise summarizer. Provide a brief summary as requested.",
      prompt: summaryFullPrompt,
      schema: toSchema<SummaryResult>(),
    });

    const summary = derive(
      { output, summaryGeneration },
      (deps: { output: string | null; summaryGeneration: { pending: boolean; error?: string; result?: SummaryResult } }) => {
        if (!deps.output) return null;
        if (deps.summaryGeneration.pending || deps.summaryGeneration.error || !deps.summaryGeneration.result) return null;
        return deps.summaryGeneration.result.summary;
      }
    );

    // =========================================================================
    // UI STATE
    // =========================================================================

    const isGenerating = derive(
      { shouldGenerate, generation },
      (deps: { shouldGenerate: boolean; generation: { pending: boolean } }) => deps.shouldGenerate && deps.generation.pending
    );

    const hasError = derive(
      { shouldGenerate, generation },
      (deps: { shouldGenerate: boolean; generation: { error?: string } }) => deps.shouldGenerate && !!deps.generation.error
    );

    const errorMessage = derive(
      generation,
      (gen: { error?: string }) => gen.error || null
    );

    // Pinned states for each option
    const isPinned0 = derive(pinnedIndex, (p: number) => p === 0);
    const isPinned1 = derive(pinnedIndex, (p: number) => p === 1);
    const isPinned2 = derive(pinnedIndex, (p: number) => p === 2);
    const isPinned3 = derive(pinnedIndex, (p: number) => p === 3);

    const isOtherPinned0 = derive(pinnedIndex, (p: number) => p >= 0 && p !== 0);
    const isOtherPinned1 = derive(pinnedIndex, (p: number) => p >= 0 && p !== 1);
    const isOtherPinned2 = derive(pinnedIndex, (p: number) => p >= 0 && p !== 2);
    const isOtherPinned3 = derive(pinnedIndex, (p: number) => p >= 0 && p !== 3);

    const hasOption0 = derive(option0, (o: string | null) => o !== null);
    const hasOption1 = derive(option1, (o: string | null) => o !== null);
    const hasOption2 = derive(option2, (o: string | null) => o !== null);
    const hasOption3 = derive(option3, (o: string | null) => o !== null);

    // =========================================================================
    // UI
    // =========================================================================

    return {
      [NAME]: derive(title, (t: string) => `Spindle: ${t}`),
      [UI]: (
        <div style={{
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          background: "#fff",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            background: "#f9fafb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: "600", fontSize: "14px" }}>{title}</div>
              <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                {ifElse(
                  isGenerating,
                  "Generating options...",
                  ifElse(
                    isPinned,
                    derive(pinnedIndex, (i: number) => `Option ${i + 1} selected`),
                    "4 options - click to select"
                  )
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {/* Respin button - uses handler with Cell parameters */}
              <button
                onClick={respinAll({ pinnedIndexCell: pinnedIndex, spinVersionCell: spinVersion })}
                style={{
                  padding: "6px 12px",
                  fontSize: "13px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Respin All
              </button>
            </div>
          </div>

          {/* Prompt display */}
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            background: "#fefce8",
            fontSize: "13px",
          }}>
            <div style={{ fontWeight: "500", marginBottom: "4px", color: "#854d0e" }}>Prompt:</div>
            <div style={{ color: "#713f12", whiteSpace: "pre-wrap" }}>{prompt}</div>
          </div>

          {/* Error state */}
          {ifElse(
            hasError,
            <div style={{
              padding: "16px",
              background: "#fef2f2",
              color: "#dc2626",
              fontSize: "13px",
            }}>
              Error: {errorMessage}
            </div>,
            null
          )}

          {/* Loading state */}
          {ifElse(
            isGenerating,
            <div style={{
              padding: "32px",
              textAlign: "center",
              color: "#666",
            }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>Generating...</div>
              <div style={{ fontSize: "13px" }}>Creating {NUM_OPTIONS} options</div>
            </div>,
            null
          )}

          {/* Options grid - FIXED SLOTS approach, INLINE cards */}
          {ifElse(
            derive(isGenerating, (ig: boolean) => !ig),
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              padding: "16px",
            }}>
              {/* Option 0 */}
              {ifElse(
                hasOption0,
                <div
                  onClick={pinOption({ index: 0, pinnedIndexCell: pinnedIndex })}
                  style={{
                    padding: "12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    border: ifElse(isPinned0, "2px solid #3b82f6", "1px solid #e5e7eb"),
                    background: ifElse(isPinned0, "#eff6ff", ifElse(isOtherPinned0, "#f9fafb", "#fff")),
                    opacity: ifElse(isOtherPinned0, "0.6", "1"),
                    minHeight: "100px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: ifElse(isPinned0, "#1d4ed8", "#666") }}>Option 1</span>
                    {ifElse(isPinned0, <span style={{ fontSize: "10px", padding: "2px 6px", background: "#3b82f6", color: "white", borderRadius: "4px" }}>PINNED</span>, null)}
                  </div>
                  <div style={{ fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-wrap", maxHeight: "200px", overflow: "auto" }}>{option0}</div>
                </div>,
                null
              )}

              {/* Option 1 */}
              {ifElse(
                hasOption1,
                <div
                  onClick={pinOption({ index: 1, pinnedIndexCell: pinnedIndex })}
                  style={{
                    padding: "12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    border: ifElse(isPinned1, "2px solid #3b82f6", "1px solid #e5e7eb"),
                    background: ifElse(isPinned1, "#eff6ff", ifElse(isOtherPinned1, "#f9fafb", "#fff")),
                    opacity: ifElse(isOtherPinned1, "0.6", "1"),
                    minHeight: "100px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: ifElse(isPinned1, "#1d4ed8", "#666") }}>Option 2</span>
                    {ifElse(isPinned1, <span style={{ fontSize: "10px", padding: "2px 6px", background: "#3b82f6", color: "white", borderRadius: "4px" }}>PINNED</span>, null)}
                  </div>
                  <div style={{ fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-wrap", maxHeight: "200px", overflow: "auto" }}>{option1}</div>
                </div>,
                null
              )}

              {/* Option 2 */}
              {ifElse(
                hasOption2,
                <div
                  onClick={pinOption({ index: 2, pinnedIndexCell: pinnedIndex })}
                  style={{
                    padding: "12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    border: ifElse(isPinned2, "2px solid #3b82f6", "1px solid #e5e7eb"),
                    background: ifElse(isPinned2, "#eff6ff", ifElse(isOtherPinned2, "#f9fafb", "#fff")),
                    opacity: ifElse(isOtherPinned2, "0.6", "1"),
                    minHeight: "100px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: ifElse(isPinned2, "#1d4ed8", "#666") }}>Option 3</span>
                    {ifElse(isPinned2, <span style={{ fontSize: "10px", padding: "2px 6px", background: "#3b82f6", color: "white", borderRadius: "4px" }}>PINNED</span>, null)}
                  </div>
                  <div style={{ fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-wrap", maxHeight: "200px", overflow: "auto" }}>{option2}</div>
                </div>,
                null
              )}

              {/* Option 3 */}
              {ifElse(
                hasOption3,
                <div
                  onClick={pinOption({ index: 3, pinnedIndexCell: pinnedIndex })}
                  style={{
                    padding: "12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    border: ifElse(isPinned3, "2px solid #3b82f6", "1px solid #e5e7eb"),
                    background: ifElse(isPinned3, "#eff6ff", ifElse(isOtherPinned3, "#f9fafb", "#fff")),
                    opacity: ifElse(isOtherPinned3, "0.6", "1"),
                    minHeight: "100px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: ifElse(isPinned3, "#1d4ed8", "#666") }}>Option 4</span>
                    {ifElse(isPinned3, <span style={{ fontSize: "10px", padding: "2px 6px", background: "#3b82f6", color: "white", borderRadius: "4px" }}>PINNED</span>, null)}
                  </div>
                  <div style={{ fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-wrap", maxHeight: "200px", overflow: "auto" }}>{option3}</div>
                </div>,
                null
              )}
            </div>,
            null
          )}

          {/* Summary section (only when pinned) */}
          {ifElse(
            isPinned,
            <div style={{
              padding: "12px 16px",
              borderTop: "1px solid #e5e7eb",
              background: "#f0fdf4",
            }}>
              <div style={{ fontWeight: "500", marginBottom: "4px", fontSize: "12px", color: "#166534" }}>
                Summary:
              </div>
              <div style={{ fontSize: "13px", color: "#15803d" }}>
                {ifElse(
                  derive(summary, (s: string | null) => s !== null),
                  summary,
                  <span style={{ fontStyle: "italic", color: "#666" }}>Generating summary...</span>
                )}
              </div>
            </div>,
            null
          )}
        </div>
      ),

      // Outputs
      title,
      output,
      summary,
      isPinned,
      isGenerating,
    };
  }
);
