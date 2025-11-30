/// <cts-enable />
/**
 * SPINDLE BOARD V2 - Level-Based Architecture
 *
 * Key changes from v1:
 * - Configure LEVELS, not individual spindles
 * - Each level has: title, defaultPrompt, branchFactor
 * - Spindles created lazily when parent is pinned
 * - Automatic "Peer X of Y" suffix
 * - Dynamic cell array pattern (empty default + handler)
 *
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

interface LevelConfig {
  id: string;
  title: string;
  defaultPrompt: string;
  branchFactor: number;
  isRoot: boolean; // Level 0 is root (generate=false)
}

interface SpindleConfig {
  id: string;
  levelIndex: number;
  positionInLevel: number;
  siblingIndex: number;
  siblingCount: number;
  parentId: string | null;
  composedInput: string;
  extraPrompt: string;
  pinnedOptionIndex: number; // -1 = none
  pinnedOutput: string;
  parentHashWhenPinned: string; // For stale detection
}

interface GenerationResult {
  options: Array<{ content: string }>;
}

interface SummaryResult {
  summary: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const NUM_OPTIONS = 4;

// Default root level
const DEFAULT_ROOT_LEVEL: LevelConfig = {
  id: "root",
  title: "Synopsis",
  defaultPrompt: "",
  branchFactor: 1,
  isRoot: true,
};

// Default root spindle
const DEFAULT_ROOT_SPINDLE: SpindleConfig = {
  id: "root-spindle",
  levelIndex: 0,
  positionInLevel: 0,
  siblingIndex: 0,
  siblingCount: 1,
  parentId: null,
  composedInput: "",
  extraPrompt: "",
  pinnedOptionIndex: -1,
  pinnedOutput: "",
  parentHashWhenPinned: "",
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

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
// INPUT INTERFACE
// =============================================================================

interface SpindleBoardInput {
  boardTitle: Default<string, "My Story Board">;
  boardDescription: Default<string, "">;

  // Dynamic arrays (empty default + handler pattern)
  levels: Default<LevelConfig[], [typeof DEFAULT_ROOT_LEVEL]>;
  spindles: Default<SpindleConfig[], [typeof DEFAULT_ROOT_SPINDLE]>;

  // Modal state
  showAddLevelModal: Cell<boolean>;
  newLevelTitle: Cell<string>;
  newLevelPrompt: Cell<string>;
  newLevelBranch: Cell<number>;

  // Root synopsis input
  synopsisText: Cell<string>;
}

// =============================================================================
// PATTERN
// =============================================================================

export default pattern<SpindleBoardInput>(
  ({
    boardTitle,
    boardDescription,
    levels,
    spindles,
    showAddLevelModal,
    newLevelTitle,
    newLevelPrompt,
    newLevelBranch,
    synopsisText,
  }) => {
    // =========================================================================
    // HANDLERS
    // =========================================================================

    // Set synopsis text (root spindle)
    const setSynopsis = handler<
      unknown,
      { spindles: Cell<SpindleConfig[]>; text: string }
    >((_, { spindles, text }) => {
      const current = spindles.get() || [];
      const rootIdx = current.findIndex((s) => s.levelIndex === 0);
      if (rootIdx >= 0) {
        current[rootIdx] = {
          ...current[rootIdx],
          composedInput: text,
          pinnedOptionIndex: 0, // Auto-pin for root
          pinnedOutput: text,
        };
        spindles.set([...current]);
      }
    });

    // Open add level modal
    const openAddLevelModal = handler<
      unknown,
      {
        showAddLevelModal: Cell<boolean>;
        newLevelTitle: Cell<string>;
        newLevelPrompt: Cell<string>;
        newLevelBranch: Cell<number>;
      }
    >((_, { showAddLevelModal, newLevelTitle, newLevelPrompt, newLevelBranch }) => {
      newLevelTitle.set("");
      newLevelPrompt.set("");
      newLevelBranch.set(1);
      showAddLevelModal.set(true);
    });

    // Close modal
    const closeModal = handler<unknown, { showAddLevelModal: Cell<boolean> }>(
      (_, { showAddLevelModal }) => {
        showAddLevelModal.set(false);
      }
    );

    // Add new level
    const addLevel = handler<
      unknown,
      {
        levels: Cell<LevelConfig[]>;
        spindles: Cell<SpindleConfig[]>;
        title: string;
        prompt: string;
        branchFactor: number;
        showAddLevelModal: Cell<boolean>;
      }
    >((_, { levels, spindles, title, prompt, branchFactor, showAddLevelModal }) => {
      const currentLevels = levels.get() || [];
      const currentSpindles = spindles.get() || [];
      const newLevelIndex = currentLevels.length;

      // Create new level
      const newLevel: LevelConfig = {
        id: generateId(),
        title: title || `Level ${newLevelIndex}`,
        defaultPrompt: prompt,
        branchFactor: Math.max(1, branchFactor),
        isRoot: false,
      };

      levels.set([...currentLevels, newLevel]);

      // Find all pinned spindles at previous level
      const prevLevelSpindles = currentSpindles.filter(
        (s) => s.levelIndex === newLevelIndex - 1 && s.pinnedOptionIndex >= 0
      );

      // Create child spindles for each pinned parent
      let positionInLevel = 0;
      const newSpindles: SpindleConfig[] = [];

      for (const parent of prevLevelSpindles) {
        for (let i = 0; i < newLevel.branchFactor; i++) {
          newSpindles.push({
            id: generateId(),
            levelIndex: newLevelIndex,
            positionInLevel: positionInLevel++,
            siblingIndex: i,
            siblingCount: newLevel.branchFactor,
            parentId: parent.id,
            composedInput: parent.pinnedOutput,
            extraPrompt: "",
            pinnedOptionIndex: -1,
            pinnedOutput: "",
            parentHashWhenPinned: "",
          });
        }
      }

      if (newSpindles.length > 0) {
        spindles.set([...currentSpindles, ...newSpindles]);
      }

      showAddLevelModal.set(false);
    });

    // Pin an option
    const pinOption = handler<
      unknown,
      {
        spindles: Cell<SpindleConfig[]>;
        levels: Cell<LevelConfig[]>;
        spindleId: string;
        optionIndex: number;
        optionContent: string;
      }
    >((_, { spindles, levels, spindleId, optionIndex, optionContent }) => {
      const currentSpindles = spindles.get() || [];
      const currentLevels = levels.get() || [];

      const spindleIdx = currentSpindles.findIndex((s) => s.id === spindleId);
      if (spindleIdx < 0) return;

      const spindle = currentSpindles[spindleIdx];
      const currentPinned = spindle.pinnedOptionIndex;

      // Toggle if clicking same option
      if (currentPinned === optionIndex) {
        currentSpindles[spindleIdx] = {
          ...spindle,
          pinnedOptionIndex: -1,
          pinnedOutput: "",
          parentHashWhenPinned: "",
        };
      } else {
        // Pin new option
        currentSpindles[spindleIdx] = {
          ...spindle,
          pinnedOptionIndex: optionIndex,
          pinnedOutput: optionContent,
          parentHashWhenPinned: simpleHash(spindle.composedInput),
        };

        // Update children's composedInput
        const children = currentSpindles.filter((s) => s.parentId === spindleId);
        for (const child of children) {
          const childIdx = currentSpindles.findIndex((s) => s.id === child.id);
          if (childIdx >= 0) {
            currentSpindles[childIdx] = {
              ...currentSpindles[childIdx],
              composedInput: optionContent,
            };
          }
        }

        // Create new children if next level exists but no children yet
        const nextLevelIndex = spindle.levelIndex + 1;
        const nextLevel = currentLevels[nextLevelIndex];
        if (nextLevel && children.length === 0) {
          // Count existing spindles at next level
          const existingAtLevel = currentSpindles.filter(
            (s) => s.levelIndex === nextLevelIndex
          );
          let positionInLevel = existingAtLevel.length;

          for (let i = 0; i < nextLevel.branchFactor; i++) {
            currentSpindles.push({
              id: generateId(),
              levelIndex: nextLevelIndex,
              positionInLevel: positionInLevel++,
              siblingIndex: i,
              siblingCount: nextLevel.branchFactor,
              parentId: spindleId,
              composedInput: optionContent,
              extraPrompt: "",
              pinnedOptionIndex: -1,
              pinnedOutput: "",
              parentHashWhenPinned: "",
            });
          }
        }
      }

      spindles.set([...currentSpindles]);
    });

    // Respin a spindle
    const respinSpindle = handler<
      unknown,
      { spindles: Cell<SpindleConfig[]>; spindleId: string }
    >((_, { spindles, spindleId }) => {
      const current = spindles.get() || [];
      const idx = current.findIndex((s) => s.id === spindleId);
      if (idx >= 0) {
        // Clear pin and force regeneration by changing the id
        current[idx] = {
          ...current[idx],
          id: generateId(), // New ID triggers new generation
          pinnedOptionIndex: -1,
          pinnedOutput: "",
          parentHashWhenPinned: "",
        };
        spindles.set([...current]);
      }
    });

    // Set extra prompt
    const setExtraPrompt = handler<
      unknown,
      { spindles: Cell<SpindleConfig[]>; spindleId: string; prompt: string }
    >((_, { spindles, spindleId, prompt }) => {
      const current = spindles.get() || [];
      const idx = current.findIndex((s) => s.id === spindleId);
      if (idx >= 0) {
        current[idx] = {
          ...current[idx],
          extraPrompt: prompt,
          // Clear pin when prompt changes
          pinnedOptionIndex: -1,
          pinnedOutput: "",
        };
        spindles.set([...current]);
      }
    });

    // =========================================================================
    // REACTIVE PROCESSING
    // =========================================================================

    // Map over spindles to create generations
    const spindleResults = spindles.map((config) => {
      // Get level config
      const levelConfig = derive(
        { config, levels },
        (deps: { config: SpindleConfig; levels: LevelConfig[] }) => {
          return deps.levels[deps.config.levelIndex] || null;
        }
      );

      // Check if this is root level
      const isRoot = derive(levelConfig, (lc: LevelConfig | null) => lc?.isRoot || false);

      // Build full prompt
      const fullPrompt = derive(
        { config, levelConfig },
        (deps: { config: SpindleConfig; levelConfig: LevelConfig | null }) => {
          if (!deps.levelConfig || deps.levelConfig.isRoot) return "";

          const parts: string[] = [];

          // Parent's output
          if (deps.config.composedInput) {
            parts.push(deps.config.composedInput);
          }

          // Level's default prompt
          if (deps.levelConfig.defaultPrompt) {
            parts.push(deps.levelConfig.defaultPrompt);
          }

          // Extra prompt
          if (deps.config.extraPrompt) {
            parts.push(deps.config.extraPrompt);
          }

          // Position suffix
          const siblingPos = `Peer ${deps.config.siblingIndex + 1} of ${deps.config.siblingCount}`;
          parts.push(siblingPos);

          // Generation instruction
          parts.push(`\n\nGenerate exactly ${NUM_OPTIONS} distinct options for the above.`);

          return parts.join("\n\n");
        }
      );

      // Should generate?
      const shouldGenerate = derive(
        { isRoot, fullPrompt },
        (deps: { isRoot: boolean; fullPrompt: string }) =>
          !deps.isRoot && deps.fullPrompt.trim() !== ""
      );

      // Generate options
      const generation = generateObject<GenerationResult>({
        system: `You are a creative writing assistant. Generate ${NUM_OPTIONS} distinct options as requested. Each option should take a meaningfully different creative approach.`,
        prompt: fullPrompt,
        schema: toSchema<GenerationResult>(),
      });

      // Extract options (fixed slots)
      const option0 = derive(
        { shouldGenerate, generation },
        (deps: {
          shouldGenerate: boolean;
          generation: { pending: boolean; error?: string; result?: GenerationResult };
        }) => {
          if (!deps.shouldGenerate) return null;
          if (deps.generation.pending || deps.generation.error || !deps.generation.result)
            return null;
          return deps.generation.result.options?.[0]?.content || null;
        }
      );
      const option1 = derive(
        { shouldGenerate, generation },
        (deps: {
          shouldGenerate: boolean;
          generation: { pending: boolean; error?: string; result?: GenerationResult };
        }) => {
          if (!deps.shouldGenerate) return null;
          if (deps.generation.pending || deps.generation.error || !deps.generation.result)
            return null;
          return deps.generation.result.options?.[1]?.content || null;
        }
      );
      const option2 = derive(
        { shouldGenerate, generation },
        (deps: {
          shouldGenerate: boolean;
          generation: { pending: boolean; error?: string; result?: GenerationResult };
        }) => {
          if (!deps.shouldGenerate) return null;
          if (deps.generation.pending || deps.generation.error || !deps.generation.result)
            return null;
          return deps.generation.result.options?.[2]?.content || null;
        }
      );
      const option3 = derive(
        { shouldGenerate, generation },
        (deps: {
          shouldGenerate: boolean;
          generation: { pending: boolean; error?: string; result?: GenerationResult };
        }) => {
          if (!deps.shouldGenerate) return null;
          if (deps.generation.pending || deps.generation.error || !deps.generation.result)
            return null;
          return deps.generation.result.options?.[3]?.content || null;
        }
      );

      // Is generating?
      const isGenerating = derive(
        { shouldGenerate, generation },
        (deps: { shouldGenerate: boolean; generation: { pending: boolean } }) =>
          deps.shouldGenerate && deps.generation.pending
      );

      // Is pinned?
      const isPinned = derive(config, (c: SpindleConfig) => c.pinnedOptionIndex >= 0);

      // Pinned output
      const pinnedOutput = derive(config, (c: SpindleConfig) => c.pinnedOutput || null);

      // Is stale?
      const isStale = derive(config, (c: SpindleConfig) => {
        if (c.pinnedOptionIndex < 0) return false;
        if (!c.parentHashWhenPinned) return false;
        const currentHash = simpleHash(c.composedInput);
        return currentHash !== c.parentHashWhenPinned;
      });

      // Summary
      const summaryPrompt = derive(
        pinnedOutput,
        (o: string | null) =>
          o ? `${o}\n\n---\n\nSummarize the above in 2-3 concise sentences.` : ""
      );
      const summaryGen = generateObject<SummaryResult>({
        system: "You are a concise summarizer.",
        prompt: summaryPrompt,
        schema: toSchema<SummaryResult>(),
      });
      const summary = derive(
        { pinnedOutput, summaryGen },
        (deps: {
          pinnedOutput: string | null;
          summaryGen: { pending: boolean; result?: SummaryResult };
        }) => {
          if (!deps.pinnedOutput || deps.summaryGen.pending || !deps.summaryGen.result)
            return null;
          return deps.summaryGen.result.summary;
        }
      );

      return {
        config,
        levelConfig,
        isRoot,
        option0,
        option1,
        option2,
        option3,
        isGenerating,
        isPinned,
        pinnedOutput,
        isStale,
        summary,
      };
    });

    // =========================================================================
    // DERIVED DATA FOR UI
    // =========================================================================

    // Group spindles by level for display
    const spindlesByLevel = derive(
      { spindleResults, levels },
      (deps: { spindleResults: typeof spindleResults; levels: LevelConfig[] }) => {
        // This returns grouped data for display
        const grouped: Record<number, typeof deps.spindleResults> = {};
        // Note: We can't actually iterate spindleResults here since it's a cell array
        // We'll handle grouping in the UI via filtering
        return deps.levels.length;
      }
    );

    // =========================================================================
    // UI
    // =========================================================================

    return {
      [NAME]: derive(boardTitle, (t: string) => `Board: ${t}`),
      [UI]: (
        <div
          style={{
            fontFamily: "system-ui, sans-serif",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "20px",
          }}
        >
          {/* Board Header */}
          <div
            style={{
              marginBottom: "24px",
              borderBottom: "2px solid #e5e7eb",
              paddingBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <h1 style={{ margin: "0 0 8px 0", fontSize: "24px" }}>{boardTitle}</h1>
                {ifElse(
                  derive(boardDescription, (d: string) => d && d.trim() !== ""),
                  <p style={{ margin: 0, color: "#666" }}>{boardDescription}</p>,
                  null
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={openAddLevelModal({
                    showAddLevelModal,
                    newLevelTitle,
                    newLevelPrompt,
                    newLevelBranch,
                  })}
                  style={{
                    padding: "8px 16px",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  + Add Level
                </button>
              </div>
            </div>
          </div>

          {/* Root Synopsis Input */}
          <div
            style={{
              marginBottom: "24px",
              padding: "16px",
              background: "#fefce8",
              borderRadius: "8px",
              border: "1px solid #fde047",
            }}
          >
            <div style={{ fontWeight: "600", marginBottom: "8px" }}>
              Level 0 - Synopsis (Root)
            </div>
            <textarea
              value={synopsisText}
              onInput={(e: InputEvent) => {
                const target = e.target as HTMLTextAreaElement;
                setSynopsis({ spindles, text: target.value });
              }}
              placeholder="Enter your story synopsis or seed idea..."
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "12px",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                fontSize: "14px",
                resize: "vertical",
              }}
            />
          </div>

          {/* Spindle Results */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {spindleResults.map((result) => {
              const spindleId = derive(result, (r) => r.config.id);
              const levelIndex = derive(result, (r) => r.config.levelIndex);
              const isRootSpindle = derive(result, (r) => r.isRoot);
              const siblingIndex = derive(result, (r) => r.config.siblingIndex);
              const siblingCount = derive(result, (r) => r.config.siblingCount);
              const levelTitle = derive(result, (r) => r.levelConfig?.title || "Level");
              const extraPrompt = derive(result, (r) => r.config.extraPrompt);

              const pinnedIdx = derive(result, (r) => r.config.pinnedOptionIndex);
              const isPinned0 = derive(pinnedIdx, (p: number) => p === 0);
              const isPinned1 = derive(pinnedIdx, (p: number) => p === 1);
              const isPinned2 = derive(pinnedIdx, (p: number) => p === 2);
              const isPinned3 = derive(pinnedIdx, (p: number) => p === 3);

              const hasOption0 = derive(result, (r) => r.option0 !== null);
              const hasOption1 = derive(result, (r) => r.option1 !== null);
              const hasOption2 = derive(result, (r) => r.option2 !== null);
              const hasOption3 = derive(result, (r) => r.option3 !== null);

              return ifElse(
                isRootSpindle,
                null, // Don't show root (it's the synopsis input)
                <div
                  style={{
                    border: ifElse(
                      derive(result, (r) => r.isStale),
                      "2px solid #f59e0b",
                      "1px solid #e5e7eb"
                    ),
                    borderRadius: "8px",
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  {/* Stale indicator */}
                  {ifElse(
                    derive(result, (r) => r.isStale),
                    <div
                      style={{
                        padding: "8px 16px",
                        background: "#fef3c7",
                        color: "#92400e",
                        fontSize: "13px",
                        borderBottom: "1px solid #fcd34d",
                      }}
                    >
                      ⚠️ Stale - parent has changed. Click Respin to refresh.
                    </div>,
                    null
                  )}

                  {/* Header */}
                  <div
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "14px" }}>
                        {levelTitle}{" "}
                        {derive(
                          { siblingIndex, siblingCount },
                          (d: { siblingIndex: number; siblingCount: number }) =>
                            d.siblingCount > 1
                              ? `- Peer ${d.siblingIndex + 1} of ${d.siblingCount}`
                              : ""
                        )}
                      </div>
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {ifElse(
                          derive(result, (r) => r.isGenerating),
                          "Generating options...",
                          ifElse(
                            derive(result, (r) => r.isPinned),
                            derive(pinnedIdx, (i: number) => `Option ${i + 1} selected`),
                            "Select an option"
                          )
                        )}
                      </div>
                    </div>
                    <button
                      onClick={respinSpindle({ spindles, spindleId })}
                      style={{
                        padding: "6px 12px",
                        background: "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Respin
                    </button>
                  </div>

                  {/* Options Grid */}
                  {ifElse(
                    derive(result, (r) => !r.isGenerating),
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        padding: "16px",
                      }}
                    >
                      {ifElse(
                        hasOption0,
                        <div
                          onClick={pinOption({
                            spindles,
                            levels,
                            spindleId,
                            optionIndex: 0,
                            optionContent: derive(result, (r) => r.option0 || ""),
                          })}
                          style={{
                            padding: "12px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            minHeight: "80px",
                            border: ifElse(
                              isPinned0,
                              "2px solid #3b82f6",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(isPinned0, "#eff6ff", "#fff"),
                            opacity: ifElse(
                              derive(pinnedIdx, (p: number) => p >= 0 && p !== 0),
                              "0.6",
                              "1"
                            ),
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: "600",
                              marginBottom: "8px",
                              color: ifElse(isPinned0, "#1d4ed8", "#666"),
                            }}
                          >
                            Option 1 {ifElse(isPinned0, "✓", "")}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              whiteSpace: "pre-wrap",
                              maxHeight: "150px",
                              overflow: "auto",
                            }}
                          >
                            {derive(result, (r) => r.option0)}
                          </div>
                        </div>,
                        null
                      )}
                      {ifElse(
                        hasOption1,
                        <div
                          onClick={pinOption({
                            spindles,
                            levels,
                            spindleId,
                            optionIndex: 1,
                            optionContent: derive(result, (r) => r.option1 || ""),
                          })}
                          style={{
                            padding: "12px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            minHeight: "80px",
                            border: ifElse(
                              isPinned1,
                              "2px solid #3b82f6",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(isPinned1, "#eff6ff", "#fff"),
                            opacity: ifElse(
                              derive(pinnedIdx, (p: number) => p >= 0 && p !== 1),
                              "0.6",
                              "1"
                            ),
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: "600",
                              marginBottom: "8px",
                              color: ifElse(isPinned1, "#1d4ed8", "#666"),
                            }}
                          >
                            Option 2 {ifElse(isPinned1, "✓", "")}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              whiteSpace: "pre-wrap",
                              maxHeight: "150px",
                              overflow: "auto",
                            }}
                          >
                            {derive(result, (r) => r.option1)}
                          </div>
                        </div>,
                        null
                      )}
                      {ifElse(
                        hasOption2,
                        <div
                          onClick={pinOption({
                            spindles,
                            levels,
                            spindleId,
                            optionIndex: 2,
                            optionContent: derive(result, (r) => r.option2 || ""),
                          })}
                          style={{
                            padding: "12px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            minHeight: "80px",
                            border: ifElse(
                              isPinned2,
                              "2px solid #3b82f6",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(isPinned2, "#eff6ff", "#fff"),
                            opacity: ifElse(
                              derive(pinnedIdx, (p: number) => p >= 0 && p !== 2),
                              "0.6",
                              "1"
                            ),
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: "600",
                              marginBottom: "8px",
                              color: ifElse(isPinned2, "#1d4ed8", "#666"),
                            }}
                          >
                            Option 3 {ifElse(isPinned2, "✓", "")}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              whiteSpace: "pre-wrap",
                              maxHeight: "150px",
                              overflow: "auto",
                            }}
                          >
                            {derive(result, (r) => r.option2)}
                          </div>
                        </div>,
                        null
                      )}
                      {ifElse(
                        hasOption3,
                        <div
                          onClick={pinOption({
                            spindles,
                            levels,
                            spindleId,
                            optionIndex: 3,
                            optionContent: derive(result, (r) => r.option3 || ""),
                          })}
                          style={{
                            padding: "12px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            minHeight: "80px",
                            border: ifElse(
                              isPinned3,
                              "2px solid #3b82f6",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(isPinned3, "#eff6ff", "#fff"),
                            opacity: ifElse(
                              derive(pinnedIdx, (p: number) => p >= 0 && p !== 3),
                              "0.6",
                              "1"
                            ),
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: "600",
                              marginBottom: "8px",
                              color: ifElse(isPinned3, "#1d4ed8", "#666"),
                            }}
                          >
                            Option 4 {ifElse(isPinned3, "✓", "")}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              whiteSpace: "pre-wrap",
                              maxHeight: "150px",
                              overflow: "auto",
                            }}
                          >
                            {derive(result, (r) => r.option3)}
                          </div>
                        </div>,
                        null
                      )}
                    </div>,
                    <div
                      style={{ padding: "32px", textAlign: "center", color: "#666" }}
                    >
                      Generating options...
                    </div>
                  )}

                  {/* Summary */}
                  {ifElse(
                    derive(result, (r) => r.isPinned),
                    <div
                      style={{
                        padding: "12px 16px",
                        borderTop: "1px solid #e5e7eb",
                        background: "#f0fdf4",
                      }}
                    >
                      <strong style={{ fontSize: "12px", color: "#166534" }}>
                        Summary:
                      </strong>
                      <div
                        style={{ fontSize: "13px", color: "#15803d", marginTop: "4px" }}
                      >
                        {ifElse(
                          derive(result, (r) => r.summary !== null),
                          derive(result, (r) => r.summary),
                          <em>Generating...</em>
                        )}
                      </div>
                    </div>,
                    null
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Level Modal */}
          {ifElse(
            showAddLevelModal,
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: "white",
                  padding: "24px",
                  borderRadius: "12px",
                  width: "400px",
                  maxWidth: "90%",
                }}
              >
                <h2 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>
                  Add New Level
                </h2>

                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "4px",
                      fontWeight: "500",
                      fontSize: "14px",
                    }}
                  >
                    Title
                  </label>
                  <input
                    type="text"
                    value={newLevelTitle}
                    placeholder="e.g., Chapters"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "4px",
                      fontWeight: "500",
                      fontSize: "14px",
                    }}
                  >
                    Default Prompt
                  </label>
                  <textarea
                    value={newLevelPrompt}
                    placeholder="e.g., Write this chapter based on the outline above"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      fontSize: "14px",
                      minHeight: "80px",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "24px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "4px",
                      fontWeight: "500",
                      fontSize: "14px",
                    }}
                  >
                    Branch Factor (children per parent)
                  </label>
                  <input
                    type="number"
                    value={newLevelBranch}
                    min="1"
                    max="10"
                    style={{
                      width: "80px",
                      padding: "8px 12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={closeModal({ showAddLevelModal })}
                    style={{
                      padding: "8px 16px",
                      background: "#f3f4f6",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addLevel({
                      levels,
                      spindles,
                      title: newLevelTitle,
                      prompt: newLevelPrompt,
                      branchFactor: newLevelBranch,
                      showAddLevelModal,
                    })}
                    style={{
                      padding: "8px 16px",
                      background: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    Add Level
                  </button>
                </div>
              </div>
            </div>,
            null
          )}
        </div>
      ),

      // Outputs
      boardTitle,
      boardDescription,
      levels,
      spindles,
    };
  }
);
