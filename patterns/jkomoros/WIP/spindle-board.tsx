/// <cts-enable />
/**
 * SPINDLE BOARD - Board Orchestrator Pattern
 *
 * Manages the graph of spindles. Handles:
 * - Creating/deleting spindles
 * - Wiring parent-child relationships
 * - Passing composed inputs to child spindles
 * - Stale detection and indicators
 * - Board-level export/import
 *
 * Uses FIXED SLOTS approach (max 6 spindles for MVP).
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

// Spindle configuration stored in board state
interface SpindleConfig {
  id: string;
  title: string;
  prompt: string;
  parentId: string | null; // null = root spindle
  generate: boolean; // false = output equals prompt (human input)
}

// Generation result for each spindle (reused from spindle.tsx)
interface GenerationResult {
  options: Array<{ content: string }>;
}

interface SummaryResult {
  summary: string;
}

// Board export format
interface BoardExport {
  version: string;
  exportedAt: string;
  board: {
    title: string;
    description: string;
  };
  spindles: Array<{
    id: string;
    title: string;
    prompt: string;
    output: string | null;
    summary: string | null;
    parentId: string | null;
    level: number;
  }>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_SPINDLES = 6; // Fixed slots for MVP
const NUM_OPTIONS = 4;

// Default empty spindle config
const EMPTY_SPINDLE: SpindleConfig = {
  id: "",
  title: "",
  prompt: "",
  parentId: null,
  generate: true,
};

// =============================================================================
// INPUT INTERFACE
// =============================================================================

interface SpindleBoardInput {
  // Board metadata
  boardTitle: Default<string, "My Story Board">;
  boardDescription: Default<string, "">;

  // Spindle configurations (fixed slots)
  spindle0: Default<SpindleConfig, typeof EMPTY_SPINDLE>;
  spindle1: Default<SpindleConfig, typeof EMPTY_SPINDLE>;
  spindle2: Default<SpindleConfig, typeof EMPTY_SPINDLE>;
  spindle3: Default<SpindleConfig, typeof EMPTY_SPINDLE>;
  spindle4: Default<SpindleConfig, typeof EMPTY_SPINDLE>;
  spindle5: Default<SpindleConfig, typeof EMPTY_SPINDLE>;

  // Selection state for each spindle (persisted)
  pinnedIndex0: Cell<number>; // -1 = none
  pinnedIndex1: Cell<number>;
  pinnedIndex2: Cell<number>;
  pinnedIndex3: Cell<number>;
  pinnedIndex4: Cell<number>;
  pinnedIndex5: Cell<number>;

  // Spin versions (increment to trigger respin)
  spinVersion0: Cell<number>;
  spinVersion1: Cell<number>;
  spinVersion2: Cell<number>;
  spinVersion3: Cell<number>;
  spinVersion4: Cell<number>;
  spinVersion5: Cell<number>;

  // Parent output hashes when pinned (for stale detection)
  parentHashWhenPinned0: Cell<string>;
  parentHashWhenPinned1: Cell<string>;
  parentHashWhenPinned2: Cell<string>;
  parentHashWhenPinned3: Cell<string>;
  parentHashWhenPinned4: Cell<string>;
  parentHashWhenPinned5: Cell<string>;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Simple hash function for stale detection
function simpleHash(str: string): string {
  if (!str) return "";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// =============================================================================
// HANDLERS
// =============================================================================

// Pin option handler - stores parent hash when pinning
const pinSpindleOption = handler<
  unknown,
  {
    index: number;
    pinnedIndexCell: Cell<number>;
    parentHashCell: Cell<string>;
    currentParentHash: string;
  }
>((_, { index, pinnedIndexCell, parentHashCell, currentParentHash }) => {
  const currentPinned = pinnedIndexCell.get();
  if (currentPinned === index) {
    pinnedIndexCell.set(-1); // Unpin
    parentHashCell.set(""); // Clear hash
  } else {
    pinnedIndexCell.set(index); // Pin this one
    parentHashCell.set(currentParentHash); // Store parent hash at pin time
  }
});

// Respin handler - clears pin and increments version
const respinSpindle = handler<
  unknown,
  {
    pinnedIndexCell: Cell<number>;
    spinVersionCell: Cell<number>;
    parentHashCell: Cell<string>;
  }
>((_, { pinnedIndexCell, spinVersionCell, parentHashCell }) => {
  pinnedIndexCell.set(-1);
  parentHashCell.set("");
  spinVersionCell.set((spinVersionCell.get() || 0) + 1);
});

// =============================================================================
// PATTERN
// =============================================================================

export default pattern<SpindleBoardInput>(
  ({
    boardTitle,
    boardDescription,
    spindle0,
    spindle1,
    spindle2,
    spindle3,
    spindle4,
    spindle5,
    pinnedIndex0,
    pinnedIndex1,
    pinnedIndex2,
    pinnedIndex3,
    pinnedIndex4,
    pinnedIndex5,
    spinVersion0,
    spinVersion1,
    spinVersion2,
    spinVersion3,
    spinVersion4,
    spinVersion5,
    parentHashWhenPinned0,
    parentHashWhenPinned1,
    parentHashWhenPinned2,
    parentHashWhenPinned3,
    parentHashWhenPinned4,
    parentHashWhenPinned5,
  }) => {
    // =========================================================================
    // CHECK WHICH SPINDLES ARE ACTIVE
    // =========================================================================

    const isActive0 = derive(spindle0, (s: SpindleConfig) => s.id !== "");
    const isActive1 = derive(spindle1, (s: SpindleConfig) => s.id !== "");
    const isActive2 = derive(spindle2, (s: SpindleConfig) => s.id !== "");
    const isActive3 = derive(spindle3, (s: SpindleConfig) => s.id !== "");
    const isActive4 = derive(spindle4, (s: SpindleConfig) => s.id !== "");
    const isActive5 = derive(spindle5, (s: SpindleConfig) => s.id !== "");

    // =========================================================================
    // SPINDLE 0 - Root spindle (no parent)
    // =========================================================================

    const prompt0 = derive(spindle0, (s: SpindleConfig) => s.prompt);
    const title0 = derive(spindle0, (s: SpindleConfig) => s.title);
    const generate0 = derive(spindle0, (s: SpindleConfig) => s.generate);

    // Composed input for spindle 0 (root has no parent, so empty)
    const composedInput0 = "";

    // Full prompt for generation
    const fullPrompt0 = derive(
      { prompt0, spinVersion0 },
      (deps: { prompt0: string; spinVersion0: number }) => {
        if (!deps.prompt0 || deps.prompt0.trim() === "") return "";
        return `${deps.prompt0.trim()}\n\n---\n\nGenerate exactly ${NUM_OPTIONS} distinct options for the above request.\nEach option should take a meaningfully different creative approach.\n\n[Generation ${deps.spinVersion0}]`;
      }
    );

    const shouldGenerate0 = derive(
      { generate0, prompt0 },
      (deps: { generate0: boolean; prompt0: string }) => deps.generate0 && deps.prompt0 && deps.prompt0.trim() !== ""
    );

    const generation0 = generateObject<GenerationResult>({
      system: `You are a creative writing assistant. Generate ${NUM_OPTIONS} distinct options as requested.`,
      prompt: fullPrompt0,
      schema: toSchema<GenerationResult>(),
    });

    // Extract options with fixed slots
    const option0_0 = derive(
      { shouldGenerate0, generation0, prompt0 },
      (deps: { shouldGenerate0: boolean; generation0: { pending: boolean; error?: string; result?: GenerationResult }; prompt0: string }) => {
        if (!deps.shouldGenerate0) return deps.prompt0 || "";
        if (deps.generation0.pending || deps.generation0.error || !deps.generation0.result) return null;
        return deps.generation0.result.options?.[0]?.content || null;
      }
    );
    const option0_1 = derive(
      { shouldGenerate0, generation0 },
      (deps: { shouldGenerate0: boolean; generation0: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate0) return null;
        if (deps.generation0.pending || deps.generation0.error || !deps.generation0.result) return null;
        return deps.generation0.result.options?.[1]?.content || null;
      }
    );
    const option0_2 = derive(
      { shouldGenerate0, generation0 },
      (deps: { shouldGenerate0: boolean; generation0: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate0) return null;
        if (deps.generation0.pending || deps.generation0.error || !deps.generation0.result) return null;
        return deps.generation0.result.options?.[2]?.content || null;
      }
    );
    const option0_3 = derive(
      { shouldGenerate0, generation0 },
      (deps: { shouldGenerate0: boolean; generation0: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate0) return null;
        if (deps.generation0.pending || deps.generation0.error || !deps.generation0.result) return null;
        return deps.generation0.result.options?.[3]?.content || null;
      }
    );

    // Output (selected option)
    const output0 = derive(
      { option0_0, option0_1, option0_2, option0_3, pinnedIndex0 },
      (deps: { option0_0: string | null; option0_1: string | null; option0_2: string | null; option0_3: string | null; pinnedIndex0: number }) => {
        const options = [deps.option0_0, deps.option0_1, deps.option0_2, deps.option0_3];
        if (deps.pinnedIndex0 < 0 || deps.pinnedIndex0 >= options.length) return null;
        return options[deps.pinnedIndex0];
      }
    );

    const isPinned0 = derive(pinnedIndex0, (idx: number) => idx >= 0);
    const isGenerating0 = derive(
      { shouldGenerate0, generation0 },
      (deps: { shouldGenerate0: boolean; generation0: { pending: boolean } }) => deps.shouldGenerate0 && deps.generation0.pending
    );

    // Summary generation for spindle 0
    const summaryPrompt0 = derive(
      output0,
      (o: string | null) => o ? `${o}\n\n---\n\nSummarize the above in 2-3 concise sentences.` : ""
    );
    const summaryGen0 = generateObject<SummaryResult>({
      system: "You are a concise summarizer.",
      prompt: summaryPrompt0,
      schema: toSchema<SummaryResult>(),
    });
    const summary0 = derive(
      { output0, summaryGen0 },
      (deps: { output0: string | null; summaryGen0: { pending: boolean; result?: SummaryResult } }) => {
        if (!deps.output0 || deps.summaryGen0.pending || !deps.summaryGen0.result) return null;
        return deps.summaryGen0.result.summary;
      }
    );

    // Parent hash for spindle 0 (always empty since root)
    const currentParentHash0 = "";

    // =========================================================================
    // SPINDLE 1 - Can have spindle0 as parent
    // =========================================================================

    const prompt1 = derive(spindle1, (s: SpindleConfig) => s.prompt);
    const title1 = derive(spindle1, (s: SpindleConfig) => s.title);
    const generate1 = derive(spindle1, (s: SpindleConfig) => s.generate);
    const parentId1 = derive(spindle1, (s: SpindleConfig) => s.parentId);

    // Composed input from parent
    const composedInput1 = derive(
      { parentId1, output0, spindle0 },
      (deps: { parentId1: string | null; output0: string | null; spindle0: SpindleConfig }) => {
        if (deps.parentId1 === deps.spindle0.id && deps.output0) {
          return deps.output0;
        }
        return "";
      }
    );

    // Parent hash for stale detection
    const currentParentHash1 = derive(composedInput1, (input: string) => simpleHash(input));

    // Is stale? (pinned but parent changed)
    const isStale1 = derive(
      { isPinned: derive(pinnedIndex1, (p: number) => p >= 0), currentHash: currentParentHash1, pinnedHash: parentHashWhenPinned1 },
      (deps: { isPinned: boolean; currentHash: string; pinnedHash: string }) => {
        if (!deps.isPinned) return false;
        if (!deps.pinnedHash) return false;
        return deps.currentHash !== deps.pinnedHash;
      }
    );

    const fullPrompt1 = derive(
      { composedInput1, prompt1, spinVersion1 },
      (deps: { composedInput1: string; prompt1: string; spinVersion1: number }) => {
        if (!deps.prompt1 || deps.prompt1.trim() === "") return "";
        const parts: string[] = [];
        if (deps.composedInput1) {
          parts.push(deps.composedInput1.trim());
          parts.push("\n\n---\n\n");
        }
        parts.push(deps.prompt1.trim());
        parts.push(`\n\n---\n\nGenerate exactly ${NUM_OPTIONS} distinct options.\n[Generation ${deps.spinVersion1}]`);
        return parts.join("");
      }
    );

    const shouldGenerate1 = derive(
      { generate1, prompt1, isActive1 },
      (deps: { generate1: boolean; prompt1: string; isActive1: boolean }) => deps.isActive1 && deps.generate1 && deps.prompt1 && deps.prompt1.trim() !== ""
    );

    const generation1 = generateObject<GenerationResult>({
      system: `You are a creative writing assistant. Generate ${NUM_OPTIONS} distinct options.`,
      prompt: fullPrompt1,
      schema: toSchema<GenerationResult>(),
    });

    const option1_0 = derive(
      { shouldGenerate1, generation1, prompt1 },
      (deps: { shouldGenerate1: boolean; generation1: { pending: boolean; error?: string; result?: GenerationResult }; prompt1: string }) => {
        if (!deps.shouldGenerate1) return deps.prompt1 || "";
        if (deps.generation1.pending || deps.generation1.error || !deps.generation1.result) return null;
        return deps.generation1.result.options?.[0]?.content || null;
      }
    );
    const option1_1 = derive(
      { shouldGenerate1, generation1 },
      (deps: { shouldGenerate1: boolean; generation1: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate1) return null;
        if (deps.generation1.pending || deps.generation1.error || !deps.generation1.result) return null;
        return deps.generation1.result.options?.[1]?.content || null;
      }
    );
    const option1_2 = derive(
      { shouldGenerate1, generation1 },
      (deps: { shouldGenerate1: boolean; generation1: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate1) return null;
        if (deps.generation1.pending || deps.generation1.error || !deps.generation1.result) return null;
        return deps.generation1.result.options?.[2]?.content || null;
      }
    );
    const option1_3 = derive(
      { shouldGenerate1, generation1 },
      (deps: { shouldGenerate1: boolean; generation1: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate1) return null;
        if (deps.generation1.pending || deps.generation1.error || !deps.generation1.result) return null;
        return deps.generation1.result.options?.[3]?.content || null;
      }
    );

    const output1 = derive(
      { option1_0, option1_1, option1_2, option1_3, pinnedIndex1 },
      (deps: { option1_0: string | null; option1_1: string | null; option1_2: string | null; option1_3: string | null; pinnedIndex1: number }) => {
        const options = [deps.option1_0, deps.option1_1, deps.option1_2, deps.option1_3];
        if (deps.pinnedIndex1 < 0 || deps.pinnedIndex1 >= options.length) return null;
        return options[deps.pinnedIndex1];
      }
    );

    const isPinned1 = derive(pinnedIndex1, (idx: number) => idx >= 0);
    const isGenerating1 = derive(
      { shouldGenerate1, generation1 },
      (deps: { shouldGenerate1: boolean; generation1: { pending: boolean } }) => deps.shouldGenerate1 && deps.generation1.pending
    );

    const summaryPrompt1 = derive(
      output1,
      (o: string | null) => o ? `${o}\n\n---\n\nSummarize in 2-3 sentences.` : ""
    );
    const summaryGen1 = generateObject<SummaryResult>({
      system: "Concise summarizer.",
      prompt: summaryPrompt1,
      schema: toSchema<SummaryResult>(),
    });
    const summary1 = derive(
      { output1, summaryGen1 },
      (deps: { output1: string | null; summaryGen1: { pending: boolean; result?: SummaryResult } }) => {
        if (!deps.output1 || deps.summaryGen1.pending || !deps.summaryGen1.result) return null;
        return deps.summaryGen1.result.summary;
      }
    );

    // =========================================================================
    // SPINDLE 2 - Can have spindle0 or spindle1 as parent
    // =========================================================================

    const prompt2 = derive(spindle2, (s: SpindleConfig) => s.prompt);
    const title2 = derive(spindle2, (s: SpindleConfig) => s.title);
    const generate2 = derive(spindle2, (s: SpindleConfig) => s.generate);
    const parentId2 = derive(spindle2, (s: SpindleConfig) => s.parentId);

    const composedInput2 = derive(
      { parentId2, output0, output1, spindle0, spindle1 },
      (deps: { parentId2: string | null; output0: string | null; output1: string | null; spindle0: SpindleConfig; spindle1: SpindleConfig }) => {
        if (deps.parentId2 === deps.spindle0.id && deps.output0) return deps.output0;
        if (deps.parentId2 === deps.spindle1.id && deps.output1) return deps.output1;
        return "";
      }
    );

    const currentParentHash2 = derive(composedInput2, (input: string) => simpleHash(input));
    const isStale2 = derive(
      { isPinned: derive(pinnedIndex2, (p: number) => p >= 0), currentHash: currentParentHash2, pinnedHash: parentHashWhenPinned2 },
      (deps: { isPinned: boolean; currentHash: string; pinnedHash: string }) => {
        if (!deps.isPinned || !deps.pinnedHash) return false;
        return deps.currentHash !== deps.pinnedHash;
      }
    );

    const fullPrompt2 = derive(
      { composedInput2, prompt2, spinVersion2 },
      (deps: { composedInput2: string; prompt2: string; spinVersion2: number }) => {
        if (!deps.prompt2?.trim()) return "";
        const parts: string[] = [];
        if (deps.composedInput2) {
          parts.push(deps.composedInput2.trim(), "\n\n---\n\n");
        }
        parts.push(deps.prompt2.trim(), `\n\n---\n\nGenerate exactly ${NUM_OPTIONS} distinct options.\n[Generation ${deps.spinVersion2}]`);
        return parts.join("");
      }
    );

    const shouldGenerate2 = derive(
      { generate2, prompt2, isActive2 },
      (deps: { generate2: boolean; prompt2: string; isActive2: boolean }) => deps.isActive2 && deps.generate2 && !!deps.prompt2?.trim()
    );

    const generation2 = generateObject<GenerationResult>({
      system: `Creative writing assistant. Generate ${NUM_OPTIONS} distinct options.`,
      prompt: fullPrompt2,
      schema: toSchema<GenerationResult>(),
    });

    const option2_0 = derive(
      { shouldGenerate2, generation2, prompt2 },
      (deps: { shouldGenerate2: boolean; generation2: { pending: boolean; error?: string; result?: GenerationResult }; prompt2: string }) => {
        if (!deps.shouldGenerate2) return deps.prompt2 || "";
        if (deps.generation2.pending || deps.generation2.error || !deps.generation2.result) return null;
        return deps.generation2.result.options?.[0]?.content || null;
      }
    );
    const option2_1 = derive(
      { shouldGenerate2, generation2 },
      (deps: { shouldGenerate2: boolean; generation2: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate2) return null;
        if (deps.generation2.pending || deps.generation2.error || !deps.generation2.result) return null;
        return deps.generation2.result.options?.[1]?.content || null;
      }
    );
    const option2_2 = derive(
      { shouldGenerate2, generation2 },
      (deps: { shouldGenerate2: boolean; generation2: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate2) return null;
        if (deps.generation2.pending || deps.generation2.error || !deps.generation2.result) return null;
        return deps.generation2.result.options?.[2]?.content || null;
      }
    );
    const option2_3 = derive(
      { shouldGenerate2, generation2 },
      (deps: { shouldGenerate2: boolean; generation2: { pending: boolean; error?: string; result?: GenerationResult } }) => {
        if (!deps.shouldGenerate2) return null;
        if (deps.generation2.pending || deps.generation2.error || !deps.generation2.result) return null;
        return deps.generation2.result.options?.[3]?.content || null;
      }
    );

    const output2 = derive(
      { option2_0, option2_1, option2_2, option2_3, pinnedIndex2 },
      (deps: { option2_0: string | null; option2_1: string | null; option2_2: string | null; option2_3: string | null; pinnedIndex2: number }) => {
        const options = [deps.option2_0, deps.option2_1, deps.option2_2, deps.option2_3];
        if (deps.pinnedIndex2 < 0 || deps.pinnedIndex2 >= options.length) return null;
        return options[deps.pinnedIndex2];
      }
    );

    const isPinned2 = derive(pinnedIndex2, (idx: number) => idx >= 0);
    const isGenerating2 = derive(
      { shouldGenerate2, generation2 },
      (deps: { shouldGenerate2: boolean; generation2: { pending: boolean } }) => deps.shouldGenerate2 && deps.generation2.pending
    );

    const summaryPrompt2 = derive(output2, (o: string | null) => o ? `${o}\n\n---\n\nSummarize in 2-3 sentences.` : "");
    const summaryGen2 = generateObject<SummaryResult>({ system: "Summarizer.", prompt: summaryPrompt2, schema: toSchema<SummaryResult>() });
    const summary2 = derive(
      { output2, summaryGen2 },
      (deps: { output2: string | null; summaryGen2: { pending: boolean; result?: SummaryResult } }) => {
        if (!deps.output2 || deps.summaryGen2.pending || !deps.summaryGen2.result) return null;
        return deps.summaryGen2.result.summary;
      }
    );

    // =========================================================================
    // UI HELPERS
    // =========================================================================

    // Create spindle card UI - this is a helper that we'll call inline
    // Note: Can't use helper functions that return JSX due to framework constraints
    // So we'll inline the UI for each spindle

    // Pinned option indices for UI
    const isPinned0_0 = derive(pinnedIndex0, (p: number) => p === 0);
    const isPinned0_1 = derive(pinnedIndex0, (p: number) => p === 1);
    const isPinned0_2 = derive(pinnedIndex0, (p: number) => p === 2);
    const isPinned0_3 = derive(pinnedIndex0, (p: number) => p === 3);

    const isPinned1_0 = derive(pinnedIndex1, (p: number) => p === 0);
    const isPinned1_1 = derive(pinnedIndex1, (p: number) => p === 1);
    const isPinned1_2 = derive(pinnedIndex1, (p: number) => p === 2);
    const isPinned1_3 = derive(pinnedIndex1, (p: number) => p === 3);

    const isPinned2_0 = derive(pinnedIndex2, (p: number) => p === 0);
    const isPinned2_1 = derive(pinnedIndex2, (p: number) => p === 1);
    const isPinned2_2 = derive(pinnedIndex2, (p: number) => p === 2);
    const isPinned2_3 = derive(pinnedIndex2, (p: number) => p === 3);

    // Check if options exist
    const hasOption0_0 = derive(option0_0, (o: string | null) => o !== null);
    const hasOption0_1 = derive(option0_1, (o: string | null) => o !== null);
    const hasOption0_2 = derive(option0_2, (o: string | null) => o !== null);
    const hasOption0_3 = derive(option0_3, (o: string | null) => o !== null);

    const hasOption1_0 = derive(option1_0, (o: string | null) => o !== null);
    const hasOption1_1 = derive(option1_1, (o: string | null) => o !== null);
    const hasOption1_2 = derive(option1_2, (o: string | null) => o !== null);
    const hasOption1_3 = derive(option1_3, (o: string | null) => o !== null);

    const hasOption2_0 = derive(option2_0, (o: string | null) => o !== null);
    const hasOption2_1 = derive(option2_1, (o: string | null) => o !== null);
    const hasOption2_2 = derive(option2_2, (o: string | null) => o !== null);
    const hasOption2_3 = derive(option2_3, (o: string | null) => o !== null);

    // =========================================================================
    // UI
    // =========================================================================

    return {
      [NAME]: derive(boardTitle, (t: string) => `Board: ${t}`),
      [UI]: (
        <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
          {/* Board Header */}
          <div style={{ marginBottom: "24px", borderBottom: "2px solid #e5e7eb", paddingBottom: "16px" }}>
            <h1 style={{ margin: "0 0 8px 0", fontSize: "24px" }}>{boardTitle}</h1>
            {ifElse(
              derive(boardDescription, (d: string) => d && d.trim() !== ""),
              <p style={{ margin: 0, color: "#666" }}>{boardDescription}</p>,
              null
            )}
          </div>

          {/* Spindles Container */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Spindle 0 */}
            {ifElse(
              isActive0,
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
                    <div style={{ fontWeight: "600", fontSize: "14px" }}>{title0}</div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {ifElse(isGenerating0, "Generating...", ifElse(isPinned0, derive(pinnedIndex0, (i: number) => `Option ${i + 1} selected`), "Select an option"))}
                    </div>
                  </div>
                  <button
                    onClick={respinSpindle({ pinnedIndexCell: pinnedIndex0, spinVersionCell: spinVersion0, parentHashCell: parentHashWhenPinned0 })}
                    style={{ padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                  >
                    Respin
                  </button>
                </div>

                {/* Prompt */}
                <div style={{ padding: "12px 16px", background: "#fefce8", fontSize: "13px", borderBottom: "1px solid #e5e7eb" }}>
                  <strong style={{ color: "#854d0e" }}>Prompt:</strong> <span style={{ color: "#713f12" }}>{prompt0}</span>
                </div>

                {/* Options Grid */}
                {ifElse(
                  derive(isGenerating0, (g: boolean) => !g),
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: "16px" }}>
                    {ifElse(hasOption0_0,
                      <div
                        onClick={pinSpindleOption({ index: 0, pinnedIndexCell: pinnedIndex0, parentHashCell: parentHashWhenPinned0, currentParentHash: currentParentHash0 })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned0_0, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned0_0, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex0, (p: number) => p >= 0 && p !== 0), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned0_0, "#1d4ed8", "#666") }}>
                          Option 1 {ifElse(isPinned0_0, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option0_0}</div>
                      </div>,
                      null
                    )}
                    {ifElse(hasOption0_1,
                      <div
                        onClick={pinSpindleOption({ index: 1, pinnedIndexCell: pinnedIndex0, parentHashCell: parentHashWhenPinned0, currentParentHash: currentParentHash0 })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned0_1, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned0_1, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex0, (p: number) => p >= 0 && p !== 1), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned0_1, "#1d4ed8", "#666") }}>
                          Option 2 {ifElse(isPinned0_1, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option0_1}</div>
                      </div>,
                      null
                    )}
                    {ifElse(hasOption0_2,
                      <div
                        onClick={pinSpindleOption({ index: 2, pinnedIndexCell: pinnedIndex0, parentHashCell: parentHashWhenPinned0, currentParentHash: currentParentHash0 })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned0_2, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned0_2, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex0, (p: number) => p >= 0 && p !== 2), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned0_2, "#1d4ed8", "#666") }}>
                          Option 3 {ifElse(isPinned0_2, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option0_2}</div>
                      </div>,
                      null
                    )}
                    {ifElse(hasOption0_3,
                      <div
                        onClick={pinSpindleOption({ index: 3, pinnedIndexCell: pinnedIndex0, parentHashCell: parentHashWhenPinned0, currentParentHash: currentParentHash0 })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned0_3, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned0_3, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex0, (p: number) => p >= 0 && p !== 3), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned0_3, "#1d4ed8", "#666") }}>
                          Option 4 {ifElse(isPinned0_3, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option0_3}</div>
                      </div>,
                      null
                    )}
                  </div>,
                  <div style={{ padding: "32px", textAlign: "center", color: "#666" }}>Generating options...</div>
                )}

                {/* Summary */}
                {ifElse(isPinned0,
                  <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", background: "#f0fdf4" }}>
                    <strong style={{ fontSize: "12px", color: "#166534" }}>Summary:</strong>
                    <div style={{ fontSize: "13px", color: "#15803d", marginTop: "4px" }}>
                      {ifElse(derive(summary0, (s: string | null) => s !== null), summary0, <em>Generating...</em>)}
                    </div>
                  </div>,
                  null
                )}
              </div>,
              null
            )}

            {/* Spindle 1 */}
            {ifElse(
              isActive1,
              <div style={{
                border: ifElse(isStale1, "2px solid #f59e0b", "1px solid #e5e7eb"),
                borderRadius: "8px",
                background: "#fff",
                overflow: "hidden",
              }}>
                {/* Stale indicator */}
                {ifElse(isStale1,
                  <div style={{ padding: "8px 16px", background: "#fef3c7", color: "#92400e", fontSize: "13px", borderBottom: "1px solid #fcd34d" }}>
                    ⚠️ Stale - parent has changed. Click Respin to refresh.
                  </div>,
                  null
                )}

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
                    <div style={{ fontWeight: "600", fontSize: "14px" }}>{title1}</div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {ifElse(isGenerating1, "Generating...", ifElse(isPinned1, derive(pinnedIndex1, (i: number) => `Option ${i + 1} selected`), "Select an option"))}
                    </div>
                  </div>
                  <button
                    onClick={respinSpindle({ pinnedIndexCell: pinnedIndex1, spinVersionCell: spinVersion1, parentHashCell: parentHashWhenPinned1 })}
                    style={{ padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                  >
                    Respin
                  </button>
                </div>

                {/* Prompt */}
                <div style={{ padding: "12px 16px", background: "#fefce8", fontSize: "13px", borderBottom: "1px solid #e5e7eb" }}>
                  <strong style={{ color: "#854d0e" }}>Prompt:</strong> <span style={{ color: "#713f12" }}>{prompt1}</span>
                </div>

                {/* Options Grid */}
                {ifElse(
                  derive(isGenerating1, (g: boolean) => !g),
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: "16px" }}>
                    {ifElse(hasOption1_0,
                      <div
                        onClick={pinSpindleOption({ index: 0, pinnedIndexCell: pinnedIndex1, parentHashCell: parentHashWhenPinned1, currentParentHash: derive(currentParentHash1, (h: string) => h) })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned1_0, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned1_0, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex1, (p: number) => p >= 0 && p !== 0), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned1_0, "#1d4ed8", "#666") }}>
                          Option 1 {ifElse(isPinned1_0, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option1_0}</div>
                      </div>,
                      null
                    )}
                    {ifElse(hasOption1_1,
                      <div
                        onClick={pinSpindleOption({ index: 1, pinnedIndexCell: pinnedIndex1, parentHashCell: parentHashWhenPinned1, currentParentHash: derive(currentParentHash1, (h: string) => h) })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned1_1, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned1_1, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex1, (p: number) => p >= 0 && p !== 1), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned1_1, "#1d4ed8", "#666") }}>
                          Option 2 {ifElse(isPinned1_1, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option1_1}</div>
                      </div>,
                      null
                    )}
                    {ifElse(hasOption1_2,
                      <div
                        onClick={pinSpindleOption({ index: 2, pinnedIndexCell: pinnedIndex1, parentHashCell: parentHashWhenPinned1, currentParentHash: derive(currentParentHash1, (h: string) => h) })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned1_2, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned1_2, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex1, (p: number) => p >= 0 && p !== 2), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned1_2, "#1d4ed8", "#666") }}>
                          Option 3 {ifElse(isPinned1_2, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option1_2}</div>
                      </div>,
                      null
                    )}
                    {ifElse(hasOption1_3,
                      <div
                        onClick={pinSpindleOption({ index: 3, pinnedIndexCell: pinnedIndex1, parentHashCell: parentHashWhenPinned1, currentParentHash: derive(currentParentHash1, (h: string) => h) })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned1_3, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned1_3, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex1, (p: number) => p >= 0 && p !== 3), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned1_3, "#1d4ed8", "#666") }}>
                          Option 4 {ifElse(isPinned1_3, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option1_3}</div>
                      </div>,
                      null
                    )}
                  </div>,
                  <div style={{ padding: "32px", textAlign: "center", color: "#666" }}>Generating options...</div>
                )}

                {/* Summary */}
                {ifElse(isPinned1,
                  <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", background: "#f0fdf4" }}>
                    <strong style={{ fontSize: "12px", color: "#166534" }}>Summary:</strong>
                    <div style={{ fontSize: "13px", color: "#15803d", marginTop: "4px" }}>
                      {ifElse(derive(summary1, (s: string | null) => s !== null), summary1, <em>Generating...</em>)}
                    </div>
                  </div>,
                  null
                )}
              </div>,
              null
            )}

            {/* Spindle 2 */}
            {ifElse(
              isActive2,
              <div style={{
                border: ifElse(isStale2, "2px solid #f59e0b", "1px solid #e5e7eb"),
                borderRadius: "8px",
                background: "#fff",
                overflow: "hidden",
              }}>
                {/* Stale indicator */}
                {ifElse(isStale2,
                  <div style={{ padding: "8px 16px", background: "#fef3c7", color: "#92400e", fontSize: "13px", borderBottom: "1px solid #fcd34d" }}>
                    ⚠️ Stale - parent has changed. Click Respin to refresh.
                  </div>,
                  null
                )}

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
                    <div style={{ fontWeight: "600", fontSize: "14px" }}>{title2}</div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {ifElse(isGenerating2, "Generating...", ifElse(isPinned2, derive(pinnedIndex2, (i: number) => `Option ${i + 1} selected`), "Select an option"))}
                    </div>
                  </div>
                  <button
                    onClick={respinSpindle({ pinnedIndexCell: pinnedIndex2, spinVersionCell: spinVersion2, parentHashCell: parentHashWhenPinned2 })}
                    style={{ padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                  >
                    Respin
                  </button>
                </div>

                {/* Prompt */}
                <div style={{ padding: "12px 16px", background: "#fefce8", fontSize: "13px", borderBottom: "1px solid #e5e7eb" }}>
                  <strong style={{ color: "#854d0e" }}>Prompt:</strong> <span style={{ color: "#713f12" }}>{prompt2}</span>
                </div>

                {/* Options Grid */}
                {ifElse(
                  derive(isGenerating2, (g: boolean) => !g),
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: "16px" }}>
                    {ifElse(hasOption2_0,
                      <div
                        onClick={pinSpindleOption({ index: 0, pinnedIndexCell: pinnedIndex2, parentHashCell: parentHashWhenPinned2, currentParentHash: derive(currentParentHash2, (h: string) => h) })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned2_0, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned2_0, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex2, (p: number) => p >= 0 && p !== 0), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned2_0, "#1d4ed8", "#666") }}>
                          Option 1 {ifElse(isPinned2_0, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option2_0}</div>
                      </div>,
                      null
                    )}
                    {ifElse(hasOption2_1,
                      <div
                        onClick={pinSpindleOption({ index: 1, pinnedIndexCell: pinnedIndex2, parentHashCell: parentHashWhenPinned2, currentParentHash: derive(currentParentHash2, (h: string) => h) })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned2_1, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned2_1, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex2, (p: number) => p >= 0 && p !== 1), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned2_1, "#1d4ed8", "#666") }}>
                          Option 2 {ifElse(isPinned2_1, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option2_1}</div>
                      </div>,
                      null
                    )}
                    {ifElse(hasOption2_2,
                      <div
                        onClick={pinSpindleOption({ index: 2, pinnedIndexCell: pinnedIndex2, parentHashCell: parentHashWhenPinned2, currentParentHash: derive(currentParentHash2, (h: string) => h) })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned2_2, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned2_2, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex2, (p: number) => p >= 0 && p !== 2), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned2_2, "#1d4ed8", "#666") }}>
                          Option 3 {ifElse(isPinned2_2, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option2_2}</div>
                      </div>,
                      null
                    )}
                    {ifElse(hasOption2_3,
                      <div
                        onClick={pinSpindleOption({ index: 3, pinnedIndexCell: pinnedIndex2, parentHashCell: parentHashWhenPinned2, currentParentHash: derive(currentParentHash2, (h: string) => h) })}
                        style={{
                          padding: "12px", borderRadius: "6px", cursor: "pointer", minHeight: "80px",
                          border: ifElse(isPinned2_3, "2px solid #3b82f6", "1px solid #e5e7eb"),
                          background: ifElse(isPinned2_3, "#eff6ff", "#fff"),
                          opacity: ifElse(derive(pinnedIndex2, (p: number) => p >= 0 && p !== 3), "0.6", "1"),
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: ifElse(isPinned2_3, "#1d4ed8", "#666") }}>
                          Option 4 {ifElse(isPinned2_3, "✓", "")}
                        </div>
                        <div style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>{option2_3}</div>
                      </div>,
                      null
                    )}
                  </div>,
                  <div style={{ padding: "32px", textAlign: "center", color: "#666" }}>Generating options...</div>
                )}

                {/* Summary */}
                {ifElse(isPinned2,
                  <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", background: "#f0fdf4" }}>
                    <strong style={{ fontSize: "12px", color: "#166534" }}>Summary:</strong>
                    <div style={{ fontSize: "13px", color: "#15803d", marginTop: "4px" }}>
                      {ifElse(derive(summary2, (s: string | null) => s !== null), summary2, <em>Generating...</em>)}
                    </div>
                  </div>,
                  null
                )}
              </div>,
              null
            )}

            {/* Empty state */}
            {ifElse(
              derive(
                { isActive0, isActive1, isActive2 },
                (deps: { isActive0: boolean; isActive1: boolean; isActive2: boolean }) => !deps.isActive0 && !deps.isActive1 && !deps.isActive2
              ),
              <div style={{ padding: "48px", textAlign: "center", color: "#666", background: "#f9fafb", borderRadius: "8px", border: "2px dashed #e5e7eb" }}>
                <div style={{ fontSize: "18px", marginBottom: "8px" }}>No spindles yet</div>
                <div style={{ fontSize: "14px" }}>Configure spindle0, spindle1, etc. in the inputs to add spindles to your board.</div>
              </div>,
              null
            )}
          </div>
        </div>
      ),

      // Outputs for inspection/export
      boardTitle,
      boardDescription,
      output0,
      output1,
      output2,
      summary0,
      summary1,
      summary2,
    };
  }
);
