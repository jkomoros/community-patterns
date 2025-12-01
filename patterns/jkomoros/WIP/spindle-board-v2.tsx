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
  index: number; // Position in level hierarchy (0 = root)
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
  index: 0,
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

  // Add Level Modal state
  showAddLevelModal: Default<boolean, false>;
  newLevelTitle: Default<string, "">;
  newLevelPrompt: Default<string, "">;
  newLevelBranch: Default<number, 1>;

  // Edit Level Modal state
  showEditLevelModal: Default<boolean, false>;
  editingLevelIndex: Default<number, 0>;
  editLevelPrompt: Default<string, "">;

  // Root synopsis input
  synopsisText: Default<string, "">;
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
    showEditLevelModal,
    editingLevelIndex,
    editLevelPrompt,
    synopsisText,
  }) => {
    // =========================================================================
    // HANDLERS
    // =========================================================================

    // Set synopsis text (root spindle)
    const setSynopsis = handler<
      unknown,
      { spindles: Cell<SpindleConfig[]>; synopsisText: Cell<string>; levels: Cell<LevelConfig[]> }
    >((_, { spindles, synopsisText, levels }) => {
      const text = synopsisText.get() || "";
      const current = [...(spindles.get() || [])]; // Copy to make mutable
      const currentLevels = levels.get() || [];
      const rootIdx = current.findIndex((s) => s.levelIndex === 0);
      if (rootIdx >= 0) {
        const rootSpindle = current[rootIdx];
        current[rootIdx] = {
          ...rootSpindle,
          composedInput: text,
          pinnedOptionIndex: 0, // Auto-pin for root
          pinnedOutput: text,
          parentHashWhenPinned: simpleHash(text),
        };

        // Create children for level 1 if it exists and no children yet
        const level1 = currentLevels[1];
        const existingChildren = current.filter((s) => s.parentId === rootSpindle.id);
        if (level1 && existingChildren.length === 0) {
          const existingAtLevel1 = current.filter((s) => s.levelIndex === 1);
          let positionInLevel = existingAtLevel1.length;

          for (let i = 0; i < level1.branchFactor; i++) {
            current.push({
              id: generateId(),
              levelIndex: 1,
              positionInLevel: positionInLevel++,
              siblingIndex: i,
              siblingCount: level1.branchFactor,
              parentId: rootSpindle.id,
              composedInput: text,
              extraPrompt: "",
              pinnedOptionIndex: -1,
              pinnedOutput: "",
              parentHashWhenPinned: "",
            });
          }
        }

        spindles.set(current);
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
        levels: Cell<LevelConfig[]>;
      }
    >((_, { showAddLevelModal, newLevelTitle, newLevelPrompt, newLevelBranch, levels }) => {
      // Set smart defaults based on current level count
      const currentLevels = levels.get() || [];
      const levelNum = currentLevels.length;
      const defaultTitles = ["Story Outline", "Chapters", "Scenes", "Beats", "Details"];
      const defaultPrompts = [
        "Create a detailed story outline based on the synopsis.",
        "Write chapter summaries based on the outline above.",
        "Break this chapter into detailed scenes.",
        "Expand this scene into specific beats and moments.",
        "Add rich details and descriptions.",
      ];
      newLevelTitle.set(defaultTitles[levelNum] || `Level ${levelNum}`);
      newLevelPrompt.set(defaultPrompts[levelNum] || "Continue developing the story.");
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
        title: Cell<string>;
        prompt: Cell<string>;
        branchFactor: Cell<number>;
        showAddLevelModal: Cell<boolean>;
      }
    >((_, { levels, spindles, title, prompt, branchFactor, showAddLevelModal }) => {
      // Read values from Cells
      const titleVal = title.get() || "";
      const promptVal = prompt.get() || "";
      const branchVal = branchFactor.get() || 1;

      const currentLevels = levels.get() || [];
      const currentSpindles = spindles.get() || [];
      const newLevelIndex = currentLevels.length;

      // Create new level with actual input values
      const newLevel: LevelConfig = {
        id: generateId(),
        index: newLevelIndex,
        title: titleVal || "Untitled Level",
        defaultPrompt: promptVal,
        branchFactor: branchVal,
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
        spindleId: Cell<string>;
        optionIndex: number;
        optionContent: Cell<string>;
      }
    >((_, { spindles, levels, spindleId, optionIndex, optionContent }) => {
      const currentSpindles = [...(spindles.get() || [])]; // Copy to make mutable
      const currentLevels = levels.get() || [];
      const spindleIdVal = spindleId.get();
      const optionContentVal = optionContent.get() || "";

      const spindleIdx = currentSpindles.findIndex((s) => s.id === spindleIdVal);
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
          pinnedOutput: optionContentVal,
          parentHashWhenPinned: simpleHash(spindle.composedInput),
        };

        // Update children's composedInput
        const children = currentSpindles.filter((s) => s.parentId === spindleIdVal);
        for (const child of children) {
          const childIdx = currentSpindles.findIndex((s) => s.id === child.id);
          if (childIdx >= 0) {
            currentSpindles[childIdx] = {
              ...currentSpindles[childIdx],
              composedInput: optionContentVal,
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
              parentId: spindleIdVal,
              composedInput: optionContentVal,
              extraPrompt: "",
              pinnedOptionIndex: -1,
              pinnedOutput: "",
              parentHashWhenPinned: "",
            });
          }
        }
      }

      spindles.set(currentSpindles);
    });

    // Respin a spindle
    const respinSpindle = handler<
      unknown,
      { spindles: Cell<SpindleConfig[]>; spindleId: Cell<string> }
    >((_, { spindles, spindleId }) => {
      const current = [...(spindles.get() || [])]; // Copy to make mutable
      const spindleIdVal = spindleId.get();
      const idx = current.findIndex((s) => s.id === spindleIdVal);
      if (idx >= 0) {
        // Clear pin and force regeneration by changing the id
        current[idx] = {
          ...current[idx],
          id: generateId(), // New ID triggers new generation
          pinnedOptionIndex: -1,
          pinnedOutput: "",
          parentHashWhenPinned: "",
        };
        spindles.set(current);
      }
    });

    // Set extra prompt
    const setExtraPrompt = handler<
      unknown,
      { spindles: Cell<SpindleConfig[]>; spindleId: Cell<string>; prompt: Cell<string> }
    >((_, { spindles, spindleId, prompt }) => {
      const current = [...(spindles.get() || [])]; // Copy to make mutable
      const spindleIdVal = spindleId.get();
      const promptVal = prompt.get() || "";
      const idx = current.findIndex((s) => s.id === spindleIdVal);
      if (idx >= 0) {
        current[idx] = {
          ...current[idx],
          extraPrompt: promptVal,
          // Clear pin when prompt changes
          pinnedOptionIndex: -1,
          pinnedOutput: "",
        };
        spindles.set(current);
      }
    });

    // Open edit level modal
    const openEditLevelModal = handler<
      unknown,
      {
        showEditLevelModal: Cell<boolean>;
        editingLevelIndex: Cell<number>;
        editLevelPrompt: Cell<string>;
        levels: Cell<LevelConfig[]>;
        levelIndex: Cell<number>;
      }
    >((_, { showEditLevelModal, editingLevelIndex, editLevelPrompt, levels, levelIndex }) => {
      const idx = levelIndex.get();
      const currentLevels = levels.get() || [];
      const level = currentLevels[idx];
      if (level) {
        editingLevelIndex.set(idx);
        editLevelPrompt.set(level.defaultPrompt);
        showEditLevelModal.set(true);
      }
    });

    // Close edit level modal
    const closeEditLevelModal = handler<unknown, { showEditLevelModal: Cell<boolean> }>(
      (_, { showEditLevelModal }) => {
        showEditLevelModal.set(false);
      }
    );

    // Save edited level prompt
    const saveEditLevel = handler<
      unknown,
      {
        levels: Cell<LevelConfig[]>;
        editingLevelIndex: Cell<number>;
        editLevelPrompt: Cell<string>;
        showEditLevelModal: Cell<boolean>;
      }
    >((_, { levels, editingLevelIndex, editLevelPrompt, showEditLevelModal }) => {
      const idx = editingLevelIndex.get();
      const newPrompt = editLevelPrompt.get() || "";
      const currentLevels = [...(levels.get() || [])];

      if (idx >= 0 && idx < currentLevels.length) {
        currentLevels[idx] = {
          ...currentLevels[idx],
          defaultPrompt: newPrompt,
        };
        levels.set(currentLevels);
      }

      showEditLevelModal.set(false);
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

      // Generate options - only when shouldGenerate is true
      const generation = ifElse(
        shouldGenerate,
        generateObject<GenerationResult>({
          model: "anthropic:claude-sonnet-4-5",
          system: `You are a creative writing assistant. Generate ${NUM_OPTIONS} distinct options as requested. Each option should take a meaningfully different creative approach.`,
          prompt: fullPrompt,
          schema: toSchema<GenerationResult>(),
        }),
        { pending: false, result: undefined, error: undefined }
      );

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

      // Summary - only generate when pinned
      const hasPinnedOutput = derive(pinnedOutput, (o: string | null) => !!o && o.trim() !== "");
      const summaryPrompt = derive(
        pinnedOutput,
        (o: string | null) =>
          o ? `${o}\n\n---\n\nSummarize the above in 2-3 concise sentences.` : ""
      );
      const summaryGen = ifElse(
        hasPinnedOutput,
        generateObject<SummaryResult>({
          model: "anthropic:claude-sonnet-4-5",
          system: "You are a concise summarizer.",
          prompt: summaryPrompt,
          schema: toSchema<SummaryResult>(),
        }),
        { pending: false, result: undefined }
      );
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

    // Identify levels that have no spindles yet (orphan levels)
    // Computed at top level to avoid derive-inside-map thrashing issues
    // See: community-docs/superstitions/2025-11-29-derive-inside-map-causes-thrashing.md
    const orphanLevels = derive(
      { levels, spindles },
      (deps: { levels: LevelConfig[]; spindles: SpindleConfig[] }) => {
        const levelIndicesWithSpindles = new Set(deps.spindles.map((s) => s.levelIndex));
        return deps.levels
          .filter((level) => !level.isRoot && !levelIndicesWithSpindles.has(level.index))
          .map((level) => ({ index: level.index, title: level.title }));
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
{/* Add Level button moved to bottom */}
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
            <button
              onClick={setSynopsis({ spindles, synopsisText, levels })}
              style={{
                marginTop: "8px",
                padding: "8px 16px",
                background: "#eab308",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Set Synopsis
            </button>
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
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={openEditLevelModal({
                          showEditLevelModal,
                          editingLevelIndex,
                          editLevelPrompt,
                          levels,
                          levelIndex,
                        })}
                        style={{
                          padding: "6px 12px",
                          background: "#6b7280",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        Edit Prompt
                      </button>
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
                            padding: ifElse(isPinned0, "16px", "12px"),
                            borderRadius: "6px",
                            cursor: "pointer",
                            minHeight: "80px",
                            border: ifElse(
                              isPinned0,
                              "2px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            borderLeft: ifElse(
                              isPinned0,
                              "6px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(isPinned0, "#dbeafe", "#fff"),
                            boxShadow: ifElse(
                              isPinned0,
                              "0 4px 12px rgba(37, 99, 235, 0.25)",
                              "none"
                            ),
                            opacity: ifElse(
                              derive(pinnedIdx, (p: number) => p >= 0 && p !== 0),
                              "0.4",
                              "1"
                            ),
                            transform: ifElse(isPinned0, "scale(1.02)", "scale(1)"),
                            transition: "all 0.2s ease",
                          }}
                        >
                          <div
                            style={{
                              fontSize: ifElse(isPinned0, "14px", "12px"),
                              fontWeight: "600",
                              marginBottom: "8px",
                              color: ifElse(isPinned0, "#1d4ed8", "#666"),
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            Option 1{" "}
                            {ifElse(
                              isPinned0,
                              <span
                                style={{
                                  background: "#2563eb",
                                  color: "white",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                }}
                              >
                                SELECTED
                              </span>,
                              ""
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              whiteSpace: "pre-wrap",
                              maxHeight: ifElse(isPinned0, "none", "150px"),
                              overflow: ifElse(isPinned0, "visible", "auto"),
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
                            padding: ifElse(isPinned1, "16px", "12px"),
                            borderRadius: "6px",
                            cursor: "pointer",
                            minHeight: "80px",
                            border: ifElse(
                              isPinned1,
                              "2px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            borderLeft: ifElse(
                              isPinned1,
                              "6px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(isPinned1, "#dbeafe", "#fff"),
                            boxShadow: ifElse(
                              isPinned1,
                              "0 4px 12px rgba(37, 99, 235, 0.25)",
                              "none"
                            ),
                            opacity: ifElse(
                              derive(pinnedIdx, (p: number) => p >= 0 && p !== 1),
                              "0.4",
                              "1"
                            ),
                            transform: ifElse(isPinned1, "scale(1.02)", "scale(1)"),
                            transition: "all 0.2s ease",
                          }}
                        >
                          <div
                            style={{
                              fontSize: ifElse(isPinned1, "14px", "12px"),
                              fontWeight: "600",
                              marginBottom: "8px",
                              color: ifElse(isPinned1, "#1d4ed8", "#666"),
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            Option 2{" "}
                            {ifElse(
                              isPinned1,
                              <span
                                style={{
                                  background: "#2563eb",
                                  color: "white",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                }}
                              >
                                SELECTED
                              </span>,
                              ""
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              whiteSpace: "pre-wrap",
                              maxHeight: ifElse(isPinned1, "none", "150px"),
                              overflow: ifElse(isPinned1, "visible", "auto"),
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
                            padding: ifElse(isPinned2, "16px", "12px"),
                            borderRadius: "6px",
                            cursor: "pointer",
                            minHeight: "80px",
                            border: ifElse(
                              isPinned2,
                              "2px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            borderLeft: ifElse(
                              isPinned2,
                              "6px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(isPinned2, "#dbeafe", "#fff"),
                            boxShadow: ifElse(
                              isPinned2,
                              "0 4px 12px rgba(37, 99, 235, 0.25)",
                              "none"
                            ),
                            opacity: ifElse(
                              derive(pinnedIdx, (p: number) => p >= 0 && p !== 2),
                              "0.4",
                              "1"
                            ),
                            transform: ifElse(isPinned2, "scale(1.02)", "scale(1)"),
                            transition: "all 0.2s ease",
                          }}
                        >
                          <div
                            style={{
                              fontSize: ifElse(isPinned2, "14px", "12px"),
                              fontWeight: "600",
                              marginBottom: "8px",
                              color: ifElse(isPinned2, "#1d4ed8", "#666"),
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            Option 3{" "}
                            {ifElse(
                              isPinned2,
                              <span
                                style={{
                                  background: "#2563eb",
                                  color: "white",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                }}
                              >
                                SELECTED
                              </span>,
                              ""
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              whiteSpace: "pre-wrap",
                              maxHeight: ifElse(isPinned2, "none", "150px"),
                              overflow: ifElse(isPinned2, "visible", "auto"),
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
                            padding: ifElse(isPinned3, "16px", "12px"),
                            borderRadius: "6px",
                            cursor: "pointer",
                            minHeight: "80px",
                            border: ifElse(
                              isPinned3,
                              "2px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            borderLeft: ifElse(
                              isPinned3,
                              "6px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(isPinned3, "#dbeafe", "#fff"),
                            boxShadow: ifElse(
                              isPinned3,
                              "0 4px 12px rgba(37, 99, 235, 0.25)",
                              "none"
                            ),
                            opacity: ifElse(
                              derive(pinnedIdx, (p: number) => p >= 0 && p !== 3),
                              "0.4",
                              "1"
                            ),
                            transform: ifElse(isPinned3, "scale(1.02)", "scale(1)"),
                            transition: "all 0.2s ease",
                          }}
                        >
                          <div
                            style={{
                              fontSize: ifElse(isPinned3, "14px", "12px"),
                              fontWeight: "600",
                              marginBottom: "8px",
                              color: ifElse(isPinned3, "#1d4ed8", "#666"),
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            Option 4{" "}
                            {ifElse(
                              isPinned3,
                              <span
                                style={{
                                  background: "#2563eb",
                                  color: "white",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                }}
                              >
                                SELECTED
                              </span>,
                              ""
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              whiteSpace: "pre-wrap",
                              maxHeight: ifElse(isPinned3, "none", "150px"),
                              overflow: ifElse(isPinned3, "visible", "auto"),
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

          {/* Placeholder cards for levels without spindles */}
          {/*
            Using a single derive block to render all placeholders.
            Cannot map over derive results, so we render JSX inside the derive callback.
            See: community-docs/superstitions/2025-11-29-derive-inside-map-causes-thrashing.md
          */}
          {derive(orphanLevels, (orphans: Array<{ index: number; title: string }>) => {
            if (!orphans || orphans.length === 0) return null;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
                {orphans.map((level) => (
                  <div
                    key={level.index}
                    style={{
                      border: "2px dashed #d1d5db",
                      borderRadius: "8px",
                      background: "#f9fafb",
                      padding: "24px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontWeight: "600", fontSize: "14px", color: "#6b7280" }}>
                      Level {level.index} - {level.title}
                    </div>
                    <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px" }}>
                      ⏳ Waiting for parent level to be pinned
                    </div>
                    <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
                      Pin an option in the level above to generate options here
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Add Level Button */}
          <div
            style={{
              marginTop: "24px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button
              onClick={openAddLevelModal({
                showAddLevelModal,
                newLevelTitle,
                newLevelPrompt,
                newLevelBranch,
                levels,
              })}
              style={{
                padding: "12px 24px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: "500",
                boxShadow: "0 2px 8px rgba(59, 130, 246, 0.3)",
              }}
            >
              + Add Level
            </button>
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

          {/* Edit Level Modal */}
          {ifElse(
            showEditLevelModal,
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
                  Edit Level Prompt
                </h2>

                <div style={{ marginBottom: "8px", fontSize: "14px", color: "#666" }}>
                  Level:{" "}
                  {derive(
                    { levels, editingLevelIndex },
                    (deps: { levels: LevelConfig[]; editingLevelIndex: number }) =>
                      deps.levels[deps.editingLevelIndex]?.title || "Unknown"
                  )}
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
                    value={editLevelPrompt}
                    placeholder="Enter the prompt for this level..."
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      fontSize: "14px",
                      minHeight: "120px",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={closeEditLevelModal({ showEditLevelModal })}
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
                    onClick={saveEditLevel({
                      levels,
                      editingLevelIndex,
                      editLevelPrompt,
                      showEditLevelModal,
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
                    Save Changes
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
