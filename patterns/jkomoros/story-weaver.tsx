/// <cts-enable />
/**
 * STORY WEAVER - Level-Based Architecture
 * (Formerly Spindle Board)
 *
 * Key features:
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
  respinNonce?: number; // Cache-busting nonce for respin
  deferGeneration?: boolean; // If true, don't auto-generate options (for performance)
}

interface GenerationResult {
  options: Array<{ content: string }>;
}

interface SummaryResult {
  summary: string;
}

interface SynopsisIdeasResult {
  ideas: Array<{ title: string; synopsis: string }>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const NUM_OPTIONS = 4;

// Default levels - Synopsis → Characters/Themes → Chapters
const DEFAULT_LEVELS: LevelConfig[] = [
  {
    id: "root",
    index: 0,
    title: "Synopsis",
    defaultPrompt: "",
    branchFactor: 1,
    isRoot: true,
  },
  {
    id: "characters-themes",
    index: 1,
    title: "Characters & Themes",
    defaultPrompt: "Based on the synopsis, identify the main characters, key plot points, and central themes of this story.",
    branchFactor: 1,
    isRoot: false,
  },
  {
    id: "chapters",
    index: 2,
    title: "Chapters",
    defaultPrompt: "Write detailed chapter summaries that develop the characters and themes identified above.",
    branchFactor: 1,
    isRoot: false,
  },
];

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

interface StoryWeaverInput {
  boardTitle?: Default<string, "My Story Weaver">;
  boardDescription?: Default<string, "">;

  // Dynamic arrays (empty default + handler pattern)
  levels?: Default<LevelConfig[], typeof DEFAULT_LEVELS>;
  spindles?: Default<SpindleConfig[], [typeof DEFAULT_ROOT_SPINDLE]>;

  // Add Level Modal state
  showAddLevelModal?: Default<boolean, false>;
  newLevelTitle?: Default<string, "">;
  newLevelPrompt?: Default<string, "">;
  newLevelBranch?: Default<number, 1>;

  // Edit Level Modal state
  showEditLevelModal?: Default<boolean, false>;
  editingLevelIndex?: Default<number, 0>;
  editLevelTitle?: Default<string, "">;
  editLevelPrompt?: Default<string, "">;

  // View Prompt Modal state
  showViewPromptModal?: Default<boolean, false>;
  viewPromptSpindleId?: Default<string, "">;

  // Edit Spindle Prompt Modal state
  showEditSpindlePromptModal?: Default<boolean, false>;
  editingSpindlePromptId?: Default<string, "">;
  editSpindlePromptText?: Default<string, "">;

  // Edit Branch Factor Modal state
  showEditBranchModal?: Default<boolean, false>;
  editingBranchLevelIndex?: Default<number, 0>;
  editBranchFactor?: Default<number, 1>;
  showBranchDeleteWarning?: Default<boolean, false>;
  pendingBranchFactor?: Default<number, 1>;

  // Option Picker Modal state
  showOptionPicker?: Default<boolean, false>;
  pickerSpindleId?: Default<string, "">;
  pickerPreviewIndex?: Default<number, 0>;

  // Root synopsis input
  synopsisText?: Default<string, "">;

  // Synopsis idea generator
  synopsisIdeasNonce?: Default<number, 0>;
}

/** Interactive story generation board with levels and spindles. #storyWeaver */
interface StoryWeaverOutput {
  boardTitle: Default<string, "My Story Weaver">;
  boardDescription: Default<string, "">;
  levels: Default<LevelConfig[], typeof DEFAULT_LEVELS>;
  spindles: Default<SpindleConfig[], [typeof DEFAULT_ROOT_SPINDLE]>;
}

// =============================================================================
// HANDLERS (defined outside pattern to avoid accidental closures)
// =============================================================================

// Helper function to actually apply branch factor change
function actuallyApplyBranchFactor(
  levels: Cell<LevelConfig[]>,
  spindles: Cell<SpindleConfig[]>,
  levelIndex: number,
  newFactor: number,
  currentLevels: LevelConfig[],
  currentSpindles: SpindleConfig[]
) {
  const level = currentLevels[levelIndex];
  const oldFactor = level.branchFactor;

  // Update level's branch factor
  currentLevels[levelIndex] = { ...level, branchFactor: newFactor };

  if (newFactor > oldFactor) {
    // Increasing - create additional spindles for each pinned parent at previous level
    const previousLevelIndex = levelIndex - 1;
    if (previousLevelIndex >= 0) {
      const pinnedParents = currentSpindles.filter(
        (s) => s.levelIndex === previousLevelIndex && s.pinnedOptionIndex >= 0
      );

      for (const parent of pinnedParents) {
        const existingSiblings = currentSpindles.filter((s) => s.parentId === parent.id);

        // Create additional siblings
        for (let i = oldFactor; i < newFactor; i++) {
          currentSpindles.push({
            id: generateId(),
            levelIndex: levelIndex,
            positionInLevel: currentSpindles.filter((s) => s.levelIndex === levelIndex).length,
            siblingIndex: i,
            siblingCount: newFactor,
            parentId: parent.id,
            composedInput: parent.pinnedOutput,
            extraPrompt: "",
            pinnedOptionIndex: -1,
            pinnedOutput: "",
            parentHashWhenPinned: "",
            deferGeneration: true, // Don't auto-generate
          });
        }

        // Update siblingCount for existing siblings
        for (const sibling of existingSiblings) {
          const idx = currentSpindles.findIndex((s) => s.id === sibling.id);
          if (idx >= 0) {
            currentSpindles[idx] = { ...currentSpindles[idx], siblingCount: newFactor };
          }
        }
      }
    }
  } else {
    // Decreasing - delete spindles with siblingIndex >= newFactor
    const spindlesToKeep = currentSpindles.filter(
      (s) => !(s.levelIndex === levelIndex && s.siblingIndex >= newFactor)
    );

    // Update siblingCount for remaining spindles at this level
    for (let i = 0; i < spindlesToKeep.length; i++) {
      if (spindlesToKeep[i].levelIndex === levelIndex) {
        spindlesToKeep[i] = { ...spindlesToKeep[i], siblingCount: newFactor };
      }
    }

    currentSpindles.length = 0;
    currentSpindles.push(...spindlesToKeep);
  }

  levels.set(currentLevels);
  spindles.set(currentSpindles);
}

// Generate synopsis ideas
const generateSynopsisIdeas = handler<unknown, { synopsisIdeasNonce: Cell<number> }>(
  (_, { synopsisIdeasNonce }) => {
    synopsisIdeasNonce.set((synopsisIdeasNonce.get() || 0) + 1);
  }
);

// Select a synopsis idea - immediately applies it to synopsis text
const selectSynopsisIdea = handler<
  unknown,
  { synopsisText: Cell<string>; synopsisIdeasNonce: Cell<number>; synopsis: string }
>((_, { synopsisText, synopsisIdeasNonce, synopsis }) => {
  // Immediately set the synopsis text
  synopsisText.set(synopsis);
  // Clear nonce to hide the ideas section
  synopsisIdeasNonce.set(0);
});

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

    // Check for existing children
    const existingChildren = current.filter((s) => s.parentId === rootSpindle.id);

    if (existingChildren.length > 0) {
      // Update existing children's composedInput - keeps same ID to avoid thrashing
      // The change in composedInput will cause fullPrompt to change, triggering regeneration
      for (const child of existingChildren) {
        const childIdx = current.findIndex((s) => s.id === child.id);
        if (childIdx >= 0) {
          current[childIdx] = {
            ...current[childIdx],
            composedInput: text,
            // Clear pin since input changed
            pinnedOptionIndex: -1,
            pinnedOutput: "",
            parentHashWhenPinned: "",
          };
        }
      }
    } else {
      // Create children for level 1 if it exists and no children yet
      const level1 = currentLevels[1];
      if (level1) {
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

// Remove a level (only allowed for the last/bottom level, not root)
const removeLevel = handler<
  unknown,
  {
    levels: Cell<LevelConfig[]>;
    spindles: Cell<SpindleConfig[]>;
    levelIndex: Cell<number> | number;
  }
>((_, { levels, spindles, levelIndex }) => {
  const currentLevels = levels.get() || [];
  const currentSpindles = spindles.get() || [];
  // Support both Cell and plain number
  const levelIndexVal = typeof levelIndex === "number" ? levelIndex : levelIndex.get();

  // Safety checks
  if (levelIndexVal === 0) {
    console.warn("Cannot remove root level");
    return;
  }

  if (levelIndexVal !== currentLevels.length - 1) {
    console.warn("Can only remove the last level");
    return;
  }

  // Remove all spindles at this level
  const filteredSpindles = currentSpindles.filter((s) => s.levelIndex !== levelIndexVal);

  // Remove the level
  const filteredLevels = currentLevels.filter((_, idx) => idx !== levelIndexVal);

  // Update both
  spindles.set(filteredSpindles);
  levels.set(filteredLevels);
});

// Pin an option
// Uses .key().set() for O(1) updates when possible, array replacement only when adding children
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
  const spindlesArray = spindles.get() || [];
  const currentLevels = levels.get() || [];
  const spindleIdVal = spindleId.get();
  const optionContentVal = optionContent.get() || "";

  const spindleIdx = spindlesArray.findIndex((s) => s.id === spindleIdVal);
  if (spindleIdx < 0) return;

  const spindle = spindlesArray[spindleIdx];
  const currentPinned = spindle.pinnedOptionIndex;

  // Toggle if clicking same option - just update the one spindle
  if (currentPinned === optionIndex) {
    const spindleCell = spindles.key(spindleIdx);
    spindleCell.set({
      ...spindle,
      pinnedOptionIndex: -1,
      pinnedOutput: "",
      parentHashWhenPinned: "",
    });
    return;
  }

  // Pin new option - first update the main spindle
  const spindleCell = spindles.key(spindleIdx);
  spindleCell.set({
    ...spindle,
    pinnedOptionIndex: optionIndex,
    pinnedOutput: optionContentVal,
    parentHashWhenPinned: simpleHash(spindle.composedInput),
  });

  // Update children's composedInput using .key().set()
  const childIndices: number[] = [];
  spindlesArray.forEach((s, idx) => {
    if (s.parentId === spindleIdVal) {
      childIndices.push(idx);
    }
  });

  for (const childIdx of childIndices) {
    const childCell = spindles.key(childIdx);
    const childSpindle = childCell.get();
    childCell.set({
      ...childSpindle,
      composedInput: optionContentVal,
    });
  }

  // Create new children if next level exists but no children yet
  // This requires array modification (push), so we do it the old way
  const nextLevelIndex = spindle.levelIndex + 1;
  const nextLevel = currentLevels[nextLevelIndex];
  if (nextLevel && childIndices.length === 0) {
    // Need to do array push, so get fresh copy and use set()
    const currentSpindles = [...(spindles.get() || [])];
    const existingAtLevel = currentSpindles.filter((s) => s.levelIndex === nextLevelIndex);
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
        deferGeneration: true, // Don't auto-generate, wait for user to click
      });
    }
    spindles.set(currentSpindles);
  }
});

// Respin a spindle
// Uses .key().set() for O(1) update instead of O(n) array replacement
const respinSpindle = handler<unknown, { spindles: Cell<SpindleConfig[]>; spindleId: Cell<string> }>(
  (_, { spindles, spindleId }) => {
    const spindleIdVal = spindleId.get();
    const spindlesArray = spindles.get() || [];
    const idx = spindlesArray.findIndex((s) => s.id === spindleIdVal);
    if (idx >= 0) {
      const spindleCell = spindles.key(idx);
      const currentSpindle = spindleCell.get();
      // Clear pin and force regeneration by incrementing nonce (cache-busting)
      spindleCell.set({
        ...currentSpindle,
        respinNonce: (currentSpindle.respinNonce || 0) + 1,
        pinnedOptionIndex: -1,
        pinnedOutput: "",
        parentHashWhenPinned: "",
      });
    }
  }
);

// Start generation for a deferred spindle
// Uses .key().set() for O(1) update instead of O(n) array replacement
const startGeneration = handler<
  unknown,
  { spindles: Cell<SpindleConfig[]>; spindleId: Cell<string> }
>((_, { spindles, spindleId }) => {
  const spindleIdVal = spindleId.get();
  const spindlesArray = spindles.get() || [];
  const idx = spindlesArray.findIndex((s) => s.id === spindleIdVal);
  if (idx >= 0) {
    // Use .key() to update specific spindle without array replacement
    const spindleCell = spindles.key(idx);
    const currentSpindle = spindleCell.get();
    spindleCell.set({
      ...currentSpindle,
      deferGeneration: false,
    });
  }
});

// Set extra prompt
// Uses .key().set() for O(1) update instead of O(n) array replacement
const setExtraPrompt = handler<
  unknown,
  { spindles: Cell<SpindleConfig[]>; spindleId: Cell<string>; prompt: Cell<string> }
>((_, { spindles, spindleId, prompt }) => {
  const spindleIdVal = spindleId.get();
  const promptVal = prompt.get() || "";
  const spindlesArray = spindles.get() || [];
  const idx = spindlesArray.findIndex((s) => s.id === spindleIdVal);
  if (idx >= 0) {
    const spindleCell = spindles.key(idx);
    const currentSpindle = spindleCell.get();
    spindleCell.set({
      ...currentSpindle,
      extraPrompt: promptVal,
      // Clear pin when prompt changes
      pinnedOptionIndex: -1,
      pinnedOutput: "",
    });
  }
});

// Open edit level modal
const openEditLevelModal = handler<
  unknown,
  {
    showEditLevelModal: Cell<boolean>;
    editingLevelIndex: Cell<number>;
    editLevelTitle: Cell<string>;
    editLevelPrompt: Cell<string>;
    levels: Cell<LevelConfig[]>;
    levelIndex: Cell<number>;
  }
>(
  (
    _,
    { showEditLevelModal, editingLevelIndex, editLevelTitle, editLevelPrompt, levels, levelIndex }
  ) => {
    const idx = levelIndex.get();
    const currentLevels = levels.get() || [];
    const level = currentLevels[idx];
    if (level) {
      editingLevelIndex.set(idx);
      editLevelTitle.set(level.title);
      editLevelPrompt.set(level.defaultPrompt);
      showEditLevelModal.set(true);
    }
  }
);

// Close edit level modal
const closeEditLevelModal = handler<unknown, { showEditLevelModal: Cell<boolean> }>(
  (_, { showEditLevelModal }) => {
    showEditLevelModal.set(false);
  }
);

// Save edited level
const saveEditLevel = handler<
  unknown,
  {
    levels: Cell<LevelConfig[]>;
    editingLevelIndex: Cell<number>;
    editLevelTitle: Cell<string>;
    editLevelPrompt: Cell<string>;
    showEditLevelModal: Cell<boolean>;
  }
>(
  (
    _,
    { levels, editingLevelIndex, editLevelTitle, editLevelPrompt, showEditLevelModal }
  ) => {
    const idx = editingLevelIndex.get();
    const newTitle = editLevelTitle.get() || "";
    const newPrompt = editLevelPrompt.get() || "";
    const currentLevels = [...(levels.get() || [])];

    if (idx >= 0 && idx < currentLevels.length) {
      currentLevels[idx] = {
        ...currentLevels[idx],
        title: newTitle,
        defaultPrompt: newPrompt,
      };
      levels.set(currentLevels);
    }

    showEditLevelModal.set(false);
  }
);

// Open view prompt modal
const openViewPromptModal = handler<
  unknown,
  {
    showViewPromptModal: Cell<boolean>;
    viewPromptSpindleId: Cell<string>;
    spindleId: Cell<string>;
  }
>((_, { showViewPromptModal, viewPromptSpindleId, spindleId }) => {
  viewPromptSpindleId.set(spindleId.get());
  showViewPromptModal.set(true);
});

// Close view prompt modal
const closeViewPromptModal = handler<unknown, { showViewPromptModal: Cell<boolean> }>(
  (_, { showViewPromptModal }) => {
    showViewPromptModal.set(false);
  }
);

// Open edit spindle prompt modal
const openEditSpindlePromptModal = handler<
  unknown,
  {
    showEditSpindlePromptModal: Cell<boolean>;
    editingSpindlePromptId: Cell<string>;
    editSpindlePromptText: Cell<string>;
    spindles: Cell<SpindleConfig[]>;
    spindleId: Cell<string>;
  }
>(
  (
    _,
    {
      showEditSpindlePromptModal,
      editingSpindlePromptId,
      editSpindlePromptText,
      spindles,
      spindleId,
    }
  ) => {
    const id = spindleId.get();
    const currentSpindles = spindles.get() || [];
    const spindle = currentSpindles.find((s) => s.id === id);
    if (spindle) {
      editingSpindlePromptId.set(id);
      editSpindlePromptText.set(spindle.extraPrompt || "");
      showEditSpindlePromptModal.set(true);
    }
  }
);

// Close edit spindle prompt modal
const closeEditSpindlePromptModal = handler<
  unknown,
  { showEditSpindlePromptModal: Cell<boolean> }
>((_, { showEditSpindlePromptModal }) => {
  showEditSpindlePromptModal.set(false);
});

// Save spindle prompt
const saveSpindlePrompt = handler<
  unknown,
  {
    spindles: Cell<SpindleConfig[]>;
    editingSpindlePromptId: Cell<string>;
    editSpindlePromptText: Cell<string>;
    showEditSpindlePromptModal: Cell<boolean>;
  }
>(
  (
    _,
    { spindles, editingSpindlePromptId, editSpindlePromptText, showEditSpindlePromptModal }
  ) => {
    const id = editingSpindlePromptId.get();
    const newPrompt = editSpindlePromptText.get() || "";
    const current = [...(spindles.get() || [])];
    const idx = current.findIndex((s) => s.id === id);
    if (idx >= 0) {
      current[idx] = {
        ...current[idx],
        extraPrompt: newPrompt,
        // Clear pin when prompt changes (forces regeneration)
        pinnedOptionIndex: -1,
        pinnedOutput: "",
        parentHashWhenPinned: "",
      };
      spindles.set(current);
    }
    showEditSpindlePromptModal.set(false);
  }
);

// Clear spindle prompt
const clearSpindlePrompt = handler<
  unknown,
  {
    spindles: Cell<SpindleConfig[]>;
    spindleId: Cell<string>;
  }
>((_, { spindles, spindleId }) => {
  const id = spindleId.get();
  const current = [...(spindles.get() || [])];
  const idx = current.findIndex((s) => s.id === id);
  if (idx >= 0) {
    current[idx] = {
      ...current[idx],
      extraPrompt: "",
      // Clear pin when prompt changes (forces regeneration)
      pinnedOptionIndex: -1,
      pinnedOutput: "",
      parentHashWhenPinned: "",
    };
    spindles.set(current);
  }
});

// Open edit branch factor modal
const openEditBranchModal = handler<
  unknown,
  {
    showEditBranchModal: Cell<boolean>;
    editingBranchLevelIndex: Cell<number>;
    editBranchFactor: Cell<number>;
    levels: Cell<LevelConfig[]>;
    levelIndex: number;
  }
>(
  (
    _,
    { showEditBranchModal, editingBranchLevelIndex, editBranchFactor, levels, levelIndex }
  ) => {
    const currentLevels = levels.get() || [];
    const level = currentLevels[levelIndex];
    if (level) {
      editingBranchLevelIndex.set(levelIndex);
      editBranchFactor.set(level.branchFactor);
      showEditBranchModal.set(true);
    }
  }
);

// Close edit branch factor modal
const closeEditBranchModal = handler<
  unknown,
  { showEditBranchModal: Cell<boolean>; showBranchDeleteWarning: Cell<boolean> }
>((_, { showEditBranchModal, showBranchDeleteWarning }) => {
  showEditBranchModal.set(false);
  showBranchDeleteWarning.set(false);
});

// Apply branch factor change (may show warning first if decreasing)
const applyBranchFactor = handler<
  unknown,
  {
    levels: Cell<LevelConfig[]>;
    spindles: Cell<SpindleConfig[]>;
    editingBranchLevelIndex: Cell<number>;
    editBranchFactor: Cell<number>;
    showEditBranchModal: Cell<boolean>;
    showBranchDeleteWarning: Cell<boolean>;
    pendingBranchFactor: Cell<number>;
  }
>(
  (
    _,
    {
      levels,
      spindles,
      editingBranchLevelIndex,
      editBranchFactor,
      showEditBranchModal,
      showBranchDeleteWarning,
      pendingBranchFactor,
    }
  ) => {
    const levelIndex = editingBranchLevelIndex.get();
    const newFactor = editBranchFactor.get();
    const currentLevels = [...(levels.get() || [])];
    const currentSpindles = [...(spindles.get() || [])];
    const level = currentLevels[levelIndex];

    if (!level) return;

    const oldFactor = level.branchFactor;

    if (newFactor === oldFactor) {
      // No change
      showEditBranchModal.set(false);
      return;
    }

    if (newFactor < oldFactor) {
      // Decreasing - count spindles that will be deleted
      const spindlesToDelete = currentSpindles.filter(
        (s) => s.levelIndex === levelIndex && s.siblingIndex >= newFactor
      );
      if (spindlesToDelete.length > 0) {
        // Show warning
        pendingBranchFactor.set(newFactor);
        showBranchDeleteWarning.set(true);
        return;
      }
    }

    // Apply the change
    actuallyApplyBranchFactor(
      levels,
      spindles,
      levelIndex,
      newFactor,
      currentLevels,
      currentSpindles
    );
    showEditBranchModal.set(false);
  }
);

// Confirm branch factor decrease (deletes spindles)
const confirmBranchDecrease = handler<
  unknown,
  {
    levels: Cell<LevelConfig[]>;
    spindles: Cell<SpindleConfig[]>;
    editingBranchLevelIndex: Cell<number>;
    pendingBranchFactor: Cell<number>;
    showEditBranchModal: Cell<boolean>;
    showBranchDeleteWarning: Cell<boolean>;
  }
>(
  (
    _,
    {
      levels,
      spindles,
      editingBranchLevelIndex,
      pendingBranchFactor,
      showEditBranchModal,
      showBranchDeleteWarning,
    }
  ) => {
    const levelIndex = editingBranchLevelIndex.get();
    const newFactor = pendingBranchFactor.get();
    const currentLevels = [...(levels.get() || [])];
    const currentSpindles = [...(spindles.get() || [])];

    actuallyApplyBranchFactor(
      levels,
      spindles,
      levelIndex,
      newFactor,
      currentLevels,
      currentSpindles
    );
    showBranchDeleteWarning.set(false);
    showEditBranchModal.set(false);
  }
);

// Open option picker modal
const openOptionPicker = handler<
  unknown,
  {
    showOptionPicker: Cell<boolean>;
    pickerSpindleId: Cell<string>;
    pickerPreviewIndex: Cell<number>;
    spindleId: Cell<string>;
    currentPinnedIdx: Cell<number>;
  }
>(
  (
    _,
    { showOptionPicker, pickerSpindleId, pickerPreviewIndex, spindleId, currentPinnedIdx }
  ) => {
    const pinnedIdx = currentPinnedIdx.get();
    pickerSpindleId.set(spindleId.get());
    pickerPreviewIndex.set(pinnedIdx >= 0 ? pinnedIdx : 0);
    showOptionPicker.set(true);
  }
);

// Close option picker modal (without pinning)
const closeOptionPicker = handler<unknown, { showOptionPicker: Cell<boolean> }>(
  (_, { showOptionPicker }) => {
    showOptionPicker.set(false);
  }
);

// Pin from picker (pins the previewed option and closes)
// Uses .key().set() for O(1) updates when possible, array replacement only when adding children
const pinFromPicker = handler<
  unknown,
  {
    spindles: Cell<SpindleConfig[]>;
    levels: Cell<LevelConfig[]>;
    pickerSpindleId: Cell<string>;
    pickerPreviewIndex: Cell<number>;
    showOptionPicker: Cell<boolean>;
    optionContent: Cell<string>;
  }
>(
  (
    _,
    { spindles, levels, pickerSpindleId, pickerPreviewIndex, showOptionPicker, optionContent }
  ) => {
    const spindleIdVal = pickerSpindleId.get();
    const optionIndex = pickerPreviewIndex.get();
    const optionContentVal = optionContent.get() || "";
    const spindlesArray = spindles.get() || [];
    const currentLevels = levels.get() || [];

    const spindleIdx = spindlesArray.findIndex((s) => s.id === spindleIdVal);
    if (spindleIdx < 0) {
      showOptionPicker.set(false);
      return;
    }

    const spindle = spindlesArray[spindleIdx];

    // Pin the option using .key().set()
    const spindleCell = spindles.key(spindleIdx);
    spindleCell.set({
      ...spindle,
      pinnedOptionIndex: optionIndex,
      pinnedOutput: optionContentVal,
      parentHashWhenPinned: simpleHash(spindle.composedInput),
    });

    // Update children's composedInput using .key().set()
    const childIndices: number[] = [];
    spindlesArray.forEach((s, idx) => {
      if (s.parentId === spindleIdVal) {
        childIndices.push(idx);
      }
    });

    for (const childIdx of childIndices) {
      const childCell = spindles.key(childIdx);
      const childSpindle = childCell.get();
      childCell.set({
        ...childSpindle,
        composedInput: optionContentVal,
      });
    }

    // Create new children if next level exists but no children yet
    // This requires array modification (push), so we do it the old way
    const nextLevelIndex = spindle.levelIndex + 1;
    const nextLevel = currentLevels[nextLevelIndex];
    if (nextLevel && childIndices.length === 0) {
      const currentSpindles = [...(spindles.get() || [])];
      const existingAtLevel = currentSpindles.filter((s) => s.levelIndex === nextLevelIndex);
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
          deferGeneration: true,
        });
      }
      spindles.set(currentSpindles);
    }

    showOptionPicker.set(false);
  }
);

// =============================================================================
// PATTERN
// =============================================================================

const StoryWeaver = pattern<StoryWeaverInput, StoryWeaverOutput>(
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
    editLevelTitle,
    editLevelPrompt,
    showViewPromptModal,
    viewPromptSpindleId,
    showEditSpindlePromptModal,
    editingSpindlePromptId,
    editSpindlePromptText,
    showEditBranchModal,
    editingBranchLevelIndex,
    editBranchFactor,
    showBranchDeleteWarning,
    pendingBranchFactor,
    showOptionPicker,
    pickerSpindleId,
    pickerPreviewIndex,
    synopsisText,
    synopsisIdeasNonce,
  }) => {
    // =========================================================================
    // NOTE: Handlers are defined at module level (above pattern definition)
    // to avoid accidentally closing over reactive values.
    // =========================================================================

    // =========================================================================
    // REACTIVE PROCESSING
    // =========================================================================

    // Map over spindles to create generations
    const spindleResults = spindles.map((config) => {
      // Get level config
      const levelConfig = derive(
        { config, levels },
        (deps: { config: SpindleConfig; levels: LevelConfig[] }) => {
          if (!deps.config) return null;
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

          // Position suffix - only include if multiple siblings (branch factor > 1)
          if (deps.config.siblingCount > 1) {
            const siblingPos = `Peer ${deps.config.siblingIndex + 1} of ${deps.config.siblingCount}`;
            parts.push(siblingPos);
          }

          // Generation instruction
          parts.push(`\n\nGenerate exactly ${NUM_OPTIONS} distinct options for the above.`);

          // Cache-busting nonce (only added when respin is used)
          if (deps.config.respinNonce) {
            parts.push(`[Generation attempt: ${deps.config.respinNonce}]`);
          }

          return parts.join("\n\n");
        }
      );

      // Should generate?
      // Don't generate if: root spindle, empty prompt, or deferGeneration flag is set
      const shouldGenerate = derive(
        { isRoot, fullPrompt, config },
        (deps: { isRoot: boolean; fullPrompt: string; config: SpindleConfig }) =>
          !deps.isRoot && deps.fullPrompt.trim() !== "" && !deps.config?.deferGeneration
      );

      // Generate options - conditional prompt prevents LLM call when shouldGenerate is false
      // (empty string prompt causes generateObject to return immediately without API call)
      const conditionalPrompt = derive(
        { shouldGenerate, fullPrompt },
        (deps: { shouldGenerate: boolean; fullPrompt: string }) =>
          deps.shouldGenerate ? deps.fullPrompt : ""
      );

      const generation = generateObject<GenerationResult>({
        model: "anthropic:claude-sonnet-4-5",
        system: `You are a creative writing assistant. Generate ${NUM_OPTIONS} distinct options as requested. Each option should take a meaningfully different creative approach.`,
        prompt: conditionalPrompt,
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

      // Is deferred generation? (waiting for user to click Generate Options)
      const isDeferredGeneration = derive(
        config,
        (c) => c ? !!(c as SpindleConfig).deferGeneration : false
      );

      // Is pinned?
      const isPinned = derive(config, (c) => c ? (c as SpindleConfig).pinnedOptionIndex >= 0 : false);

      // Pinned output
      const pinnedOutput = derive(config, (c) => c ? (c as SpindleConfig).pinnedOutput || null : null);

      // UI-needed derived values (computed here to avoid derives-inside-map thrashing)
      // See: community-docs/superstitions/2025-11-29-derive-inside-map-causes-thrashing.md
      // Note: Use explicit null checks because config can be undefined during reactive passes
      const spindleId = derive(config, (c) => (c as SpindleConfig)?.id || "");
      const levelIndex = derive(config, (c) => (c as SpindleConfig)?.levelIndex ?? 0);
      const siblingIndex = derive(config, (c) => (c as SpindleConfig)?.siblingIndex ?? 0);
      const siblingCount = derive(config, (c) => (c as SpindleConfig)?.siblingCount ?? 1);
      const levelTitle = derive(levelConfig, (lc) => (lc as LevelConfig)?.title || "Level");
      const levelPrompt = derive(levelConfig, (lc) => (lc as LevelConfig)?.defaultPrompt || "");
      const extraPromptValue = derive(config, (c) => (c as SpindleConfig)?.extraPrompt || "");
      const hasExtraPrompt = derive(extraPromptValue, (p: string) => !!p && p.trim() !== "");
      const pinnedIdx = derive(config, (c) => (c as SpindleConfig)?.pinnedOptionIndex ?? -1);

      // Per-option pinned state
      const isPinned0 = derive(pinnedIdx, (p) => p === 0);
      const isPinned1 = derive(pinnedIdx, (p) => p === 1);
      const isPinned2 = derive(pinnedIdx, (p) => p === 2);
      const isPinned3 = derive(pinnedIdx, (p) => p === 3);

      // Has option checks
      const hasOption0 = derive(option0, (o) => o !== null && o !== undefined);
      const hasOption1 = derive(option1, (o) => o !== null && o !== undefined);
      const hasOption2 = derive(option2, (o) => o !== null && o !== undefined);
      const hasOption3 = derive(option3, (o) => o !== null && o !== undefined);

      // Is stale?
      const isStale = derive(config, (c) => {
        if (!c) return false;
        if ((c as SpindleConfig).pinnedOptionIndex < 0) return false;
        if (!c.parentHashWhenPinned) return false;
        const currentHash = simpleHash(c.composedInput);
        return currentHash !== c.parentHashWhenPinned;
      });

      // Summary - only generate when pinned
      // (empty string prompt causes generateObject to return immediately without API call)
      const hasPinnedOutput = derive(pinnedOutput, (o: string | null) => !!o && o.trim() !== "");
      const summaryPrompt = derive(
        pinnedOutput,
        (o: string | null) =>
          o ? `${o}\n\n---\n\nSummarize the above in 2-3 concise sentences.` : ""
      );
      const summaryGen = generateObject<SummaryResult>({
        model: "anthropic:claude-sonnet-4-5",
        system: "You are a concise summarizer.",
        prompt: summaryPrompt,
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

      // Has summary check - also check for empty string
      const hasSummary = derive(summary, (s: string | null) => !!s && s.trim() !== "");

      // Is this the first peer in its sibling group?
      const isFirstPeer = derive(siblingIndex, (idx: number) => idx === 0);

      return {
        config,
        levelConfig,
        isRoot,
        fullPrompt,
        option0,
        option1,
        option2,
        option3,
        isGenerating,
        isDeferredGeneration,
        isPinned,
        pinnedOutput,
        isStale,
        summary,
        // UI-needed derived values (pre-computed to avoid derives-inside-map thrashing)
        spindleId,
        levelIndex,
        siblingIndex,
        siblingCount,
        levelTitle,
        levelPrompt,
        extraPrompt: extraPromptValue,
        hasExtraPrompt,
        pinnedIdx,
        isPinned0,
        isPinned1,
        isPinned2,
        isPinned3,
        hasOption0,
        hasOption1,
        hasOption2,
        hasOption3,
        hasSummary,
        isFirstPeer,
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
        if (!deps.levels || !deps.spindles) return [];
        // Use array with .includes() instead of Set - Sets don't serialize properly
        // See: community-docs/superstitions/2025-11-29-cells-must-be-json-serializable.md
        const levelIndicesWithSpindles = deps.spindles.filter((s) => s).map((s) => s.levelIndex);
        return deps.levels
          .filter((level) => level && !level.isRoot && !levelIndicesWithSpindles.includes(level.index))
          .map((level) => ({ index: level.index, title: level.title }));
      }
    );

    // Get prompt details for the selected spindle (for View Prompt modal)
    // Computed at top level with labeled sections for display
    const viewPromptDetails = derive(
      { spindles, levels, viewPromptSpindleId },
      (deps: {
        spindles: SpindleConfig[];
        levels: LevelConfig[];
        viewPromptSpindleId: string;
      }) => {
        if (!deps.spindles || !deps.levels || !deps.viewPromptSpindleId) return null;

        const spindle = deps.spindles.find((s) => s && s.id === deps.viewPromptSpindleId);
        if (!spindle) return null;

        const level = deps.levels[spindle.levelIndex];
        if (!level || level.isRoot) return null;

        return {
          levelTitle: level.title,
          siblingIndex: spindle.siblingIndex,
          siblingCount: spindle.siblingCount,
          parentOutput: spindle.composedInput || "(No parent output)",
          levelPrompt: level.defaultPrompt || "(No level prompt)",
          extraPrompt: spindle.extraPrompt || null,
          // Only show position suffix if multiple siblings (branch factor > 1)
          positionSuffix: spindle.siblingCount > 1
            ? `Peer ${spindle.siblingIndex + 1} of ${spindle.siblingCount}`
            : null,
          generationInstruction: `Generate exactly ${NUM_OPTIONS} distinct options for the above.`,
        };
      }
    );

    // =========================================================================
    // SYNOPSIS IDEAS GENERATION
    // =========================================================================

    // Generate synopsis ideas when nonce > 0
    const shouldGenerateIdeas = derive(
      synopsisIdeasNonce,
      (nonce: number) => nonce > 0
    );

    // Check if story has been started (has children spindles)
    const hasStartedStory = derive(
      spindles,
      (s: SpindleConfig[]) => s.some((sp) => sp.levelIndex > 0)
    );

    // Conditional prompt - empty string prevents LLM call when shouldGenerateIdeas is false
    const synopsisIdeasPrompt = derive(
      { shouldGenerateIdeas, synopsisIdeasNonce },
      (deps: { shouldGenerateIdeas: boolean; synopsisIdeasNonce: number }) =>
        deps.shouldGenerateIdeas
          ? `Generate 4 creative story synopsis ideas. Each should be a compelling premise for a novel or screenplay.

Make them diverse in genre and tone:
- One could be literary/dramatic
- One could be thriller/mystery
- One could be fantasy/sci-fi
- One could be contemporary/realistic

[Generation attempt: ${deps.synopsisIdeasNonce}]`
          : ""
    );

    const synopsisIdeasGeneration = generateObject<SynopsisIdeasResult>({
      model: "anthropic:claude-sonnet-4-5",
      system: "You are a creative writing assistant specializing in story development. Generate compelling, original story premises.",
      prompt: synopsisIdeasPrompt,
    });

    // Pre-compute ideas data for use outside derive callbacks
    // This allows the onClick to work because it's not inside a derive callback
    const ideasList = derive(
      synopsisIdeasGeneration,
      (gen: { pending: boolean; result?: SynopsisIdeasResult }) => {
        if (!gen.result?.ideas) return [];
        return gen.result.ideas.map((idea) => ({
          title: idea.title,
          synopsis: idea.synopsis,
        }));
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
              <div style={{ flex: 1 }}>
                <ct-input
                  $value={boardTitle}
                  placeholder="Story Board Title"
                  style={{
                    fontSize: "24px",
                    fontWeight: "bold",
                    border: "none",
                    background: "transparent",
                    padding: "0",
                    margin: "0 0 8px 0",
                    width: "100%",
                  }}
                />
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
            <ct-input
              $value={synopsisText}
              placeholder="Enter your story synopsis or seed idea..."
              style="width: 100%; min-height: 100px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px;"
            />
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>
              <button
                onClick={setSynopsis({ spindles, synopsisText, levels })}
                disabled={hasStartedStory}
                style={derive(hasStartedStory, (started: boolean) => ({
                  padding: "10px 20px",
                  background: started ? "#9ca3af" : "#eab308",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: started ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                }))}
              >
                {derive(hasStartedStory, (started: boolean) => started ? "Story Started ✓" : "Start Story →")}
              </button>
              <button
                onClick={generateSynopsisIdeas({ synopsisIdeasNonce })}
                style={{
                  padding: "10px 20px",
                  background: "#8b5cf6",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                ✨ Inspire Me
              </button>
              <span style={{ fontSize: "13px", color: "#6b7280" }}>
                Click to begin generating from your synopsis
              </span>
            </div>
            {/* Synopsis Ideas Display */}
            {ifElse(
              shouldGenerateIdeas,
              <div
                style={{
                  marginTop: "16px",
                  padding: "16px",
                  background: "#faf5ff",
                  border: "1px solid #c4b5fd",
                  borderRadius: "8px",
                }}
              >
                <div style={{ fontWeight: "600", marginBottom: "12px", color: "#7c3aed" }}>
                  ✨ Story Ideas
                </div>
                {ifElse(
                  derive(
                    synopsisIdeasGeneration,
                    (gen: { pending: boolean }) => gen.pending
                  ),
                  <div style={{ color: "#6b7280", fontStyle: "italic", display: "flex", alignItems: "center", gap: "8px" }}>
                    <ct-loader size="sm" show-elapsed></ct-loader>
                    Generating ideas...
                  </div>,
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {/* Use .map() on pre-computed cell instead of inside derive callback */}
                    {/* This allows onClick handlers to work because cells aren't read-only */}
                    {ideasList.map((idea) => (
                      <button
                        onClick={selectSynopsisIdea({ synopsisText, synopsisIdeasNonce, synopsis: idea.synopsis })}
                        style={{
                          padding: "12px",
                          background: "white",
                          border: "1px solid #e5e7eb",
                          borderRadius: "6px",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                          {idea.title}
                        </div>
                        <div style={{ fontSize: "13px", color: "#4b5563" }}>
                          {idea.synopsis}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>,
              null
            )}
            {ifElse(
              derive(levels, (lvls: LevelConfig[]) => !lvls || lvls.length <= 1),
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "13px",
                  color: "#92400e",
                  fontStyle: "italic",
                }}
              >
                Add a level below to start generating content from your synopsis.
              </div>,
              null
            )}
          </div>

          {/* Spindle Results */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {spindleResults.map((result) => {
              // Use pre-computed values from the data layer - NO derives here!
              // See: community-docs/superstitions/2025-11-29-derive-inside-map-causes-thrashing.md
              // Creating derives inside .map() causes infinite reactivity loops and CPU spin.
              // All these values are pre-computed in the spindles.map() data layer above.

              // Level colors for visual grouping
              const levelColors = [
                { bg: "#f0f9ff", border: "#0ea5e9", headerBg: "#e0f2fe" }, // Sky blue - Level 1
                { bg: "#fefce8", border: "#eab308", headerBg: "#fef9c3" }, // Yellow - Level 2
                { bg: "#f0fdf4", border: "#22c55e", headerBg: "#dcfce7" }, // Green - Level 3
                { bg: "#fdf4ff", border: "#d946ef", headerBg: "#fae8ff" }, // Fuchsia - Level 4
                { bg: "#fff7ed", border: "#f97316", headerBg: "#fed7aa" }, // Orange - Level 5
              ];

              return ifElse(
                result.isRoot,
                null, // Don't show root (it's the synopsis input)
                <div>
                  {/* Level Group Header - shown only for first peer when multiple peers */}
                  {ifElse(
                    derive(
                      { isFirstPeer: result.isFirstPeer, siblingCount: result.siblingCount },
                      (d: { isFirstPeer: boolean; siblingCount: number }) => d.isFirstPeer && d.siblingCount > 1
                    ),
                    <div
                      style={{
                        marginTop: "8px",
                        marginBottom: "8px",
                        background: derive(result.levelIndex, (idx: number) => levelColors[(idx - 1) % levelColors.length]?.headerBg || "#f3f4f6"),
                        borderLeft: derive(result.levelIndex, (idx: number) => `4px solid ${levelColors[(idx - 1) % levelColors.length]?.border || "#6b7280"}`),
                        borderRadius: "4px",
                        overflow: "hidden",
                      }}
                    >
                      {/* Level title and peer count */}
                      <div
                        style={{
                          padding: "12px 16px",
                          fontWeight: "600",
                          fontSize: "14px",
                          color: "#374151",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {result.levelTitle}
                          <button
                            onClick={openEditBranchModal({
                              showEditBranchModal,
                              editingBranchLevelIndex,
                              editBranchFactor,
                              levels,
                              levelIndex: result.levelIndex,
                            })}
                            style={{
                              padding: "2px 6px",
                              background: "rgba(0,0,0,0.08)",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "11px",
                              color: "#6b7280",
                            }}
                            title="Edit branch factor"
                          >
                            {derive(result.siblingCount, (count: number) => `${count} peer${count !== 1 ? "s" : ""}`)}
                          </button>
                        </span>
                        <button
                          onClick={openEditLevelModal({
                            showEditLevelModal,
                            editingLevelIndex,
                            editLevelTitle,
                            editLevelPrompt,
                            levels,
                            levelIndex: result.levelIndex,
                          })}
                          style={{
                            padding: "4px 8px",
                            background: "rgba(0,0,0,0.1)",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "11px",
                            color: "#4b5563",
                          }}
                        >
                          Edit Level Prompt
                        </button>
                      </div>
                      {/* Level Prompt - shared by all peers */}
                      <div
                        style={{
                          padding: "8px 16px 12px 16px",
                          fontSize: "13px",
                          color: "#4b5563",
                          borderTop: "1px solid rgba(0,0,0,0.1)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: "600",
                            color: "#6b7280",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            marginBottom: "4px",
                          }}
                        >
                          Level Prompt (shared by all peers)
                        </div>
                        <div style={{ lineHeight: "1.4" }}>
                          {result.levelPrompt}
                        </div>
                      </div>
                    </div>,
                    null
                  )}

                  {/* Spindle Card */}
                  <div
                    style={{
                      border: ifElse(
                        result.isStale,
                        "2px solid #f59e0b",
                        derive(result.levelIndex, (idx: number) => `1px solid ${levelColors[(idx - 1) % levelColors.length]?.border || "#e5e7eb"}`)
                      ),
                      borderRadius: "8px",
                      background: "#fff",
                      overflow: "hidden",
                      marginLeft: derive(result.siblingCount, (count: number) => count > 1 ? "16px" : "0"),
                    }}
                  >
                    {/* Stale indicator */}
                    {ifElse(
                      result.isStale,
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
                        background: derive(result.levelIndex, (idx: number) => levelColors[(idx - 1) % levelColors.length]?.bg || "#f9fafb"),
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: "600", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>
                            {result.levelTitle}{" "}
                            {derive(
                              { siblingIndex: result.siblingIndex, siblingCount: result.siblingCount },
                              (d: { siblingIndex: number; siblingCount: number }) =>
                                d.siblingCount > 1
                                  ? `- Peer ${d.siblingIndex + 1} of ${d.siblingCount}`
                                  : ""
                            )}
                          </span>
                          {/* Branch factor edit button - show for first peer or when siblingCount is 1 */}
                          {ifElse(
                            derive(result.siblingIndex, (idx: number) => idx === 0),
                            <button
                              onClick={openEditBranchModal({
                                showEditBranchModal,
                                editingBranchLevelIndex,
                                editBranchFactor,
                                levels,
                                levelIndex: result.levelIndex,
                              })}
                              style={{
                                padding: "2px 8px",
                                background: "#e0e7ff",
                                color: "#4338ca",
                                border: "1px solid #c7d2fe",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "11px",
                                fontWeight: "500",
                              }}
                              title="Edit branch factor (number of parallel peers)"
                            >
                              {derive(result.siblingCount, (count: number) => `${count} peer${count !== 1 ? "s" : ""}`)}
                            </button>,
                            null
                          )}
                        </div>
                        <div style={{ fontSize: "12px", color: "#666" }}>
                          {ifElse(
                            result.isGenerating,
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <ct-loader size="sm"></ct-loader>
                              Generating options...
                            </span>,
                            ifElse(
                              result.isPinned,
                              derive(result.pinnedIdx, (i: number) => `Option ${i + 1} selected`),
                              "Select an option"
                            )
                          )}
                        </div>
                      </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={openViewPromptModal({
                          showViewPromptModal,
                          viewPromptSpindleId,
                          spindleId: result.spindleId,
                        })}
                        style={{
                          padding: "6px 12px",
                          background: "#8b5cf6",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        View Composed Prompt
                      </button>
                      <button
                        onClick={openEditLevelModal({
                          showEditLevelModal,
                          editingLevelIndex,
                          editLevelTitle,
                          editLevelPrompt,
                          levels,
                          levelIndex: result.levelIndex,
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
                        onClick={respinSpindle({ spindles, spindleId: result.spindleId })}
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
                      {/* Remove Level button - only for last level */}
                      {ifElse(
                        derive(
                          { levelIndex: result.levelIndex, levels },
                          (d: { levelIndex: number; levels: LevelConfig[] }) =>
                            d.levelIndex === (d.levels?.length || 0) - 1
                        ),
                        <button
                          onClick={removeLevel({ levels, spindles, levelIndex: result.levelIndex })}
                          style={{
                            padding: "6px 12px",
                            background: "#fee2e2",
                            color: "#dc2626",
                            border: "1px solid #fecaca",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "12px",
                          }}
                          title="Remove this level"
                        >
                          🗑️ Remove Level
                        </button>,
                        null
                      )}
                    </div>
                  </div>

                  {/* Level Prompt Display - only when siblingCount === 1 (otherwise shown in group header) */}
                  {ifElse(
                    derive(result.siblingCount, (count: number) => count === 1),
                    <div
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#fafafa",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "600",
                          color: "#6b7280",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: "6px",
                        }}
                      >
                        Level Prompt
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#374151",
                          lineHeight: "1.5",
                        }}
                      >
                        {result.levelPrompt}
                      </div>
                    </div>,
                    null
                  )}

                  {/* Spindle Prompt - unique per spindle, always visible */}
                  <div
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #e5e7eb",
                      background: "#f5f3ff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "6px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "600",
                          color: "#7c3aed",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Spindle Prompt
                      </div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          onClick={openEditSpindlePromptModal({
                            showEditSpindlePromptModal,
                            editingSpindlePromptId,
                            editSpindlePromptText,
                            spindles,
                            spindleId: result.spindleId,
                          })}
                          style={{
                            padding: "2px 8px",
                            background: "#8b5cf6",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "11px",
                          }}
                        >
                          Edit
                        </button>
                        {ifElse(
                          result.hasExtraPrompt,
                          <button
                            onClick={clearSpindlePrompt({
                              spindles,
                              spindleId: result.spindleId,
                            })}
                            style={{
                              padding: "2px 8px",
                              background: "#fecaca",
                              color: "#dc2626",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "11px",
                            }}
                          >
                            Clear
                          </button>,
                          null
                        )}
                      </div>
                    </div>
                    {ifElse(
                      result.hasExtraPrompt,
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#5b21b6",
                          lineHeight: "1.5",
                        }}
                      >
                        {result.extraPrompt}
                      </div>,
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#9ca3af",
                          fontStyle: "italic",
                        }}
                      >
                        No spindle-specific guidance set. Click Edit to add direction unique to this spindle (e.g., "Play up the wings metaphor" or "Focus on character chemistry").
                      </div>
                    )}
                  </div>

                  {/* Options Grid, Loading State, or Deferred Generation */}
                  {ifElse(
                    result.isDeferredGeneration,
                    /* Deferred generation - show Generate Options button */
                    <div
                      style={{
                        padding: "48px 16px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "16px",
                      }}
                    >
                      <div style={{ color: "#6b7280", fontSize: "14px", marginBottom: "8px" }}>
                        Ready to generate options
                      </div>
                      <button
                        onClick={startGeneration({
                          spindles,
                          spindleId: result.spindleId,
                        })}
                        style={{
                          padding: "12px 24px",
                          background: "#2563eb",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "600",
                        }}
                      >
                        Generate Options
                      </button>
                    </div>,
                    ifElse(
                      result.isGenerating,
                      <div
                        style={{
                          padding: "48px 16px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "16px",
                        }}
                      >
                        <ct-loader size="lg" show-elapsed></ct-loader>
                        <div style={{ color: "#6b7280", fontSize: "14px" }}>
                          Generating options...
                        </div>
                      </div>,
                      <div>
                        {/* Options header with fullscreen button */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px 16px",
                            borderBottom: "1px solid #e5e7eb",
                            background: "#f9fafb",
                          }}
                        >
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>
                            Generated Options
                          </div>
                          <button
                            onClick={openOptionPicker({
                              showOptionPicker,
                              pickerSpindleId,
                              pickerPreviewIndex,
                              spindleId: result.spindleId,
                              currentPinnedIdx: result.pinnedIdx,
                            })}
                            style={{
                              padding: "6px 12px",
                              background: "#4f46e5",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "12px",
                              fontWeight: "500",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            🔍 Fullscreen View
                          </button>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "12px",
                            padding: "16px",
                          }}
                        >
                      {ifElse(
                        result.hasOption0,
                        <div
                          style={{
                            padding: ifElse(result.isPinned0, "16px", "12px"),
                            borderRadius: "8px",
                            minHeight: "80px",
                            border: ifElse(
                              result.isPinned0,
                              "3px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(result.isPinned0, "#bfdbfe", "#fff"),
                            boxShadow: ifElse(
                              result.isPinned0,
                              "0 0 0 4px rgba(37, 99, 235, 0.3), 0 8px 20px rgba(37, 99, 235, 0.35)",
                              "none"
                            ),
                            opacity: ifElse(
                              derive(result.pinnedIdx, (p: number) => p >= 0 && p !== 0),
                              "0.15",
                              "1"
                            ),
                            transform: ifElse(result.isPinned0, "scale(1.03)", "scale(1)"),
                            transition: "all 0.2s ease",
                            position: "relative",
                            zIndex: ifElse(result.isPinned0, "10", "1"),
                          }}
                        >
                          {ifElse(
                            result.isPinned0,
                            <div
                              style={{
                                position: "absolute",
                                top: "-16px",
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                                color: "white",
                                padding: "8px 20px",
                                borderRadius: "16px",
                                fontSize: "14px",
                                fontWeight: "800",
                                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.5)",
                                letterSpacing: "0.5px",
                              }}
                            >
                              📌 SELECTED
                            </div>,
                            null
                          )}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "8px",
                              marginTop: ifElse(result.isPinned0, "8px", "0"),
                            }}
                          >
                            <div
                              style={{
                                fontSize: ifElse(result.isPinned0, "14px", "12px"),
                                fontWeight: "600",
                                color: ifElse(result.isPinned0, "#1d4ed8", "#666"),
                              }}
                            >
                              Option 1
                            </div>
                            {ifElse(
                              derive(result.pinnedIdx, (p: number) => p < 0),
                              <button
                                onClick={pinOption({
                                  spindles,
                                  levels,
                                  spindleId: result.spindleId,
                                  optionIndex: 0,
                                  optionContent: result.option0,
                                })}
                                style={{
                                  padding: "4px 8px",
                                  background: "#2563eb",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  fontWeight: "500",
                                }}
                              >
                                📌 Pin
                              </button>,
                              null
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              maxHeight: ifElse(result.isPinned0, "none", "150px"),
                              overflow: ifElse(result.isPinned0, "visible", "auto"),
                              color: ifElse(
                                derive(result.pinnedIdx, (p: number) => p >= 0 && p !== 0),
                                "#9ca3af",
                                "#374151"
                              ),
                            }}
                          >
                            <ct-markdown content={result.option0} />
                          </div>
                        </div>,
                        null
                      )}
                      {ifElse(
                        result.hasOption1,
                        <div
                          style={{
                            padding: ifElse(result.isPinned1, "16px", "12px"),
                            borderRadius: "8px",
                            minHeight: "80px",
                            border: ifElse(
                              result.isPinned1,
                              "3px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(result.isPinned1, "#bfdbfe", "#fff"),
                            boxShadow: ifElse(
                              result.isPinned1,
                              "0 0 0 4px rgba(37, 99, 235, 0.3), 0 8px 20px rgba(37, 99, 235, 0.35)",
                              "none"
                            ),
                            opacity: ifElse(
                              derive(result.pinnedIdx, (p: number) => p >= 0 && p !== 1),
                              "0.15",
                              "1"
                            ),
                            transform: ifElse(result.isPinned1, "scale(1.03)", "scale(1)"),
                            transition: "all 0.2s ease",
                            position: "relative",
                            zIndex: ifElse(result.isPinned1, "10", "1"),
                          }}
                        >
                          {ifElse(
                            result.isPinned1,
                            <div
                              style={{
                                position: "absolute",
                                top: "-16px",
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                                color: "white",
                                padding: "8px 20px",
                                borderRadius: "16px",
                                fontSize: "14px",
                                fontWeight: "800",
                                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.5)",
                                letterSpacing: "0.5px",
                              }}
                            >
                              📌 SELECTED
                            </div>,
                            null
                          )}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "8px",
                              marginTop: ifElse(result.isPinned1, "8px", "0"),
                            }}
                          >
                            <div
                              style={{
                                fontSize: ifElse(result.isPinned1, "14px", "12px"),
                                fontWeight: "600",
                                color: ifElse(result.isPinned1, "#1d4ed8", "#666"),
                              }}
                            >
                              Option 2
                            </div>
                            {ifElse(
                              derive(result.pinnedIdx, (p: number) => p < 0),
                              <button
                                onClick={pinOption({
                                  spindles,
                                  levels,
                                  spindleId: result.spindleId,
                                  optionIndex: 1,
                                  optionContent: result.option1,
                                })}
                                style={{
                                  padding: "4px 8px",
                                  background: "#2563eb",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  fontWeight: "500",
                                }}
                              >
                                📌 Pin
                              </button>,
                              null
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              maxHeight: ifElse(result.isPinned1, "none", "150px"),
                              overflow: ifElse(result.isPinned1, "visible", "auto"),
                              color: ifElse(
                                derive(result.pinnedIdx, (p: number) => p >= 0 && p !== 1),
                                "#9ca3af",
                                "#374151"
                              ),
                            }}
                          >
                            <ct-markdown content={result.option1} />
                          </div>
                        </div>,
                        null
                      )}
                      {ifElse(
                        result.hasOption2,
                        <div
                          style={{
                            padding: ifElse(result.isPinned2, "16px", "12px"),
                            borderRadius: "8px",
                            minHeight: "80px",
                            border: ifElse(
                              result.isPinned2,
                              "3px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(result.isPinned2, "#bfdbfe", "#fff"),
                            boxShadow: ifElse(
                              result.isPinned2,
                              "0 0 0 4px rgba(37, 99, 235, 0.3), 0 8px 20px rgba(37, 99, 235, 0.35)",
                              "none"
                            ),
                            opacity: ifElse(
                              derive(result.pinnedIdx, (p: number) => p >= 0 && p !== 2),
                              "0.15",
                              "1"
                            ),
                            transform: ifElse(result.isPinned2, "scale(1.03)", "scale(1)"),
                            transition: "all 0.2s ease",
                            position: "relative",
                            zIndex: ifElse(result.isPinned2, "10", "1"),
                          }}
                        >
                          {ifElse(
                            result.isPinned2,
                            <div
                              style={{
                                position: "absolute",
                                top: "-16px",
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                                color: "white",
                                padding: "8px 20px",
                                borderRadius: "16px",
                                fontSize: "14px",
                                fontWeight: "800",
                                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.5)",
                                letterSpacing: "0.5px",
                              }}
                            >
                              📌 SELECTED
                            </div>,
                            null
                          )}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "8px",
                              marginTop: ifElse(result.isPinned2, "8px", "0"),
                            }}
                          >
                            <div
                              style={{
                                fontSize: ifElse(result.isPinned2, "14px", "12px"),
                                fontWeight: "600",
                                color: ifElse(result.isPinned2, "#1d4ed8", "#666"),
                              }}
                            >
                              Option 3
                            </div>
                            {ifElse(
                              derive(result.pinnedIdx, (p: number) => p < 0),
                              <button
                                onClick={pinOption({
                                  spindles,
                                  levels,
                                  spindleId: result.spindleId,
                                  optionIndex: 2,
                                  optionContent: result.option2,
                                })}
                                style={{
                                  padding: "4px 8px",
                                  background: "#2563eb",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  fontWeight: "500",
                                }}
                              >
                                📌 Pin
                              </button>,
                              null
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              maxHeight: ifElse(result.isPinned2, "none", "150px"),
                              overflow: ifElse(result.isPinned2, "visible", "auto"),
                              color: ifElse(
                                derive(result.pinnedIdx, (p: number) => p >= 0 && p !== 2),
                                "#9ca3af",
                                "#374151"
                              ),
                            }}
                          >
                            <ct-markdown content={result.option2} />
                          </div>
                        </div>,
                        null
                      )}
                      {ifElse(
                        result.hasOption3,
                        <div
                          style={{
                            padding: ifElse(result.isPinned3, "16px", "12px"),
                            borderRadius: "8px",
                            minHeight: "80px",
                            border: ifElse(
                              result.isPinned3,
                              "3px solid #2563eb",
                              "1px solid #e5e7eb"
                            ),
                            background: ifElse(result.isPinned3, "#bfdbfe", "#fff"),
                            boxShadow: ifElse(
                              result.isPinned3,
                              "0 0 0 4px rgba(37, 99, 235, 0.3), 0 8px 20px rgba(37, 99, 235, 0.35)",
                              "none"
                            ),
                            opacity: ifElse(
                              derive(result.pinnedIdx, (p: number) => p >= 0 && p !== 3),
                              "0.15",
                              "1"
                            ),
                            transform: ifElse(result.isPinned3, "scale(1.03)", "scale(1)"),
                            transition: "all 0.2s ease",
                            position: "relative",
                            zIndex: ifElse(result.isPinned3, "10", "1"),
                          }}
                        >
                          {ifElse(
                            result.isPinned3,
                            <div
                              style={{
                                position: "absolute",
                                top: "-16px",
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                                color: "white",
                                padding: "8px 20px",
                                borderRadius: "16px",
                                fontSize: "14px",
                                fontWeight: "800",
                                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.5)",
                                letterSpacing: "0.5px",
                              }}
                            >
                              📌 SELECTED
                            </div>,
                            null
                          )}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "8px",
                              marginTop: ifElse(result.isPinned3, "8px", "0"),
                            }}
                          >
                            <div
                              style={{
                                fontSize: ifElse(result.isPinned3, "14px", "12px"),
                                fontWeight: "600",
                                color: ifElse(result.isPinned3, "#1d4ed8", "#666"),
                              }}
                            >
                              Option 4
                            </div>
                            {ifElse(
                              derive(result.pinnedIdx, (p: number) => p < 0),
                              <button
                                onClick={pinOption({
                                  spindles,
                                  levels,
                                  spindleId: result.spindleId,
                                  optionIndex: 3,
                                  optionContent: result.option3,
                                })}
                                style={{
                                  padding: "4px 8px",
                                  background: "#2563eb",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  fontWeight: "500",
                                }}
                              >
                                📌 Pin
                              </button>,
                              null
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              maxHeight: ifElse(result.isPinned3, "none", "150px"),
                              overflow: ifElse(result.isPinned3, "visible", "auto"),
                              color: ifElse(
                                derive(result.pinnedIdx, (p: number) => p >= 0 && p !== 3),
                                "#9ca3af",
                                "#374151"
                              ),
                            }}
                          >
                            <ct-markdown content={result.option3} />
                          </div>
                        </div>,
                        null
                      )}
                        </div>
                      </div>
                    )
                  )}

                  {/* Summary */}
                  {ifElse(
                    result.isPinned,
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
                          result.hasSummary,
                          <span>{result.summary}</span>,
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div
                              style={{
                                display: "inline-block",
                                background: "linear-gradient(90deg, #bbf7d0 0%, #86efac 50%, #bbf7d0 100%)",
                                backgroundSize: "200% 100%",
                                animation: "shimmer 1.5s ease-in-out infinite",
                                padding: "4px 12px",
                                borderRadius: "4px",
                              }}
                            >
                              Generating summary...
                            </div>
                            <style>{`
                              @keyframes shimmer {
                                0% { background-position: 200% 0; }
                                100% { background-position: -200% 0; }
                              }
                            `}</style>
                          </div>
                        )}
                      </div>
                    </div>,
                    null
                  )}
                </div>
                {/* End Spindle Card */}
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
          {derive(
            { orphanLevels, levels },
            (deps: { orphanLevels: Array<{ index: number; title: string }>; levels: LevelConfig[] }) => {
              const orphans = deps.orphanLevels;
              const totalLevels = deps.levels?.length || 0;
              if (!orphans || orphans.length === 0) return null;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
                  {orphans.map((level) => {
                    const isLastLevel = level.index === totalLevels - 1;
                    return (
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
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                          <div style={{ fontWeight: "600", fontSize: "14px", color: "#6b7280" }}>
                            Level {level.index} - {level.title}
                          </div>
                          {isLastLevel && (
                            <button
                              onClick={removeLevel({ levels, spindles, levelIndex: level.index })}
                              style={{
                                padding: "2px 8px",
                                background: "#fee2e2",
                                color: "#dc2626",
                                border: "1px solid #fecaca",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "12px",
                              }}
                              title="Remove this level"
                            >
                              🗑️ Remove
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px" }}>
                          ⏳ Waiting for parent level to be pinned
                        </div>
                        <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
                          Pin an option in the level above to generate options here
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }
          )}

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
                  <ct-input
                    type="number"
                    $value={newLevelBranch}
                    min="1"
                    max="10"
                    style="width: 80px; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px;"
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
                  Edit Level
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
                  <ct-input
                    $value={editLevelTitle}
                    placeholder="e.g., Chapters"
                    style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px;"
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
                  <ct-input
                    $value={editLevelPrompt}
                    placeholder="Enter the prompt for this level..."
                    style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; min-height: 120px;"
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
                      editLevelTitle,
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

          {/* View Prompt Modal */}
          {ifElse(
            showViewPromptModal,
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
                  width: "600px",
                  maxWidth: "90%",
                  maxHeight: "80vh",
                  overflow: "auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: "18px" }}>Full Composed Prompt</h2>
                  <button
                    onClick={closeViewPromptModal({ showViewPromptModal })}
                    style={{
                      padding: "4px 8px",
                      background: "#f3f4f6",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "18px",
                    }}
                  >
                    ×
                  </button>
                </div>

                {ifElse(
                  derive(viewPromptDetails, (d) => d !== null),
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Header info */}
                    <div
                      style={{
                        padding: "12px",
                        background: "#f0f9ff",
                        borderRadius: "6px",
                        fontSize: "14px",
                        color: "#0369a1",
                      }}
                    >
                      {derive(viewPromptDetails, (d) =>
                        d
                          ? d.positionSuffix
                            ? `${d.levelTitle} - ${d.positionSuffix}`
                            : d.levelTitle
                          : ""
                      )}
                    </div>

                    {/* Section 1: Parent Output */}
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                          marginBottom: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        1. Parent's Pinned Output
                      </div>
                      <div
                        style={{
                          padding: "12px",
                          background: "#fef3c7",
                          borderRadius: "6px",
                          fontSize: "13px",
                          whiteSpace: "pre-wrap",
                          maxHeight: "150px",
                          overflow: "auto",
                          border: "1px solid #fcd34d",
                        }}
                      >
                        {derive(viewPromptDetails, (d) => d?.parentOutput || "")}
                      </div>
                    </div>

                    {/* Section 2: Level Prompt */}
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                          marginBottom: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        2. Level's Default Prompt
                      </div>
                      <div
                        style={{
                          padding: "12px",
                          background: "#dbeafe",
                          borderRadius: "6px",
                          fontSize: "13px",
                          whiteSpace: "pre-wrap",
                          border: "1px solid #93c5fd",
                        }}
                      >
                        {derive(viewPromptDetails, (d) => d?.levelPrompt || "")}
                      </div>
                    </div>

                    {/* Section 3: Extra Prompt (conditional) */}
                    {ifElse(
                      derive(viewPromptDetails, (d) => !!d?.extraPrompt),
                      <div>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          3. Extra Prompt (Per-Spindle)
                        </div>
                        <div
                          style={{
                            padding: "12px",
                            background: "#fce7f3",
                            borderRadius: "6px",
                            fontSize: "13px",
                            whiteSpace: "pre-wrap",
                            border: "1px solid #f9a8d4",
                          }}
                        >
                          {derive(viewPromptDetails, (d) => d?.extraPrompt || "")}
                        </div>
                      </div>,
                      null
                    )}

                    {/* Section 4: Position Suffix - only shown when multiple siblings */}
                    {ifElse(
                      derive(viewPromptDetails, (d) => !!d?.positionSuffix),
                      <div>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          {derive(viewPromptDetails, (d) =>
                            d?.extraPrompt ? "4. Position Suffix" : "3. Position Suffix"
                          )}
                        </div>
                        <div
                          style={{
                            padding: "12px",
                            background: "#dcfce7",
                            borderRadius: "6px",
                            fontSize: "13px",
                            border: "1px solid #86efac",
                          }}
                        >
                          {derive(viewPromptDetails, (d) => d?.positionSuffix || "")}
                        </div>
                      </div>,
                      null
                    )}

                    {/* Section: Generation Instruction - number depends on what's shown */}
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                          marginBottom: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {derive(viewPromptDetails, (d) => {
                          if (!d) return "Generation Instruction";
                          // Base: Parent Output (1), Level Prompt (2)
                          let num = 3;
                          if (d.extraPrompt) num++;
                          if (d.positionSuffix) num++;
                          return `${num}. Generation Instruction`;
                        })}
                      </div>
                      <div
                        style={{
                          padding: "12px",
                          background: "#f3e8ff",
                          borderRadius: "6px",
                          fontSize: "13px",
                          fontStyle: "italic",
                          border: "1px solid #d8b4fe",
                        }}
                      >
                        {derive(viewPromptDetails, (d) => d?.generationInstruction || "")}
                      </div>
                    </div>
                  </div>,
                  <div style={{ color: "#666", textAlign: "center", padding: "20px" }}>
                    No prompt details available
                  </div>
                )}

                <div
                  style={{
                    marginTop: "20px",
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={closeViewPromptModal({ showViewPromptModal })}
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
                    Close
                  </button>
                </div>
              </div>
            </div>,
            null
          )}

          {/* Edit Spindle Prompt Modal */}
          {ifElse(
            showEditSpindlePromptModal,
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
                  width: "500px",
                  maxWidth: "90%",
                }}
              >
                <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#7c3aed" }}>
                  Edit Spindle Prompt
                </h2>

                <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#6b7280" }}>
                  Add specific guidance for THIS spindle only. This is combined with the level prompt to generate options.
                  Examples: "Play up the wings metaphor", "Focus on the chemistry between Sarah and Steve", "Make it more suspenseful".
                </p>

                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "4px",
                      fontWeight: "500",
                      fontSize: "14px",
                    }}
                  >
                    Spindle Prompt
                  </label>
                  <ct-input
                    $value={editSpindlePromptText}
                    placeholder="Enter spindle-specific guidance..."
                    style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; min-height: 120px;"
                  />
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={closeEditSpindlePromptModal({ showEditSpindlePromptModal })}
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
                    onClick={saveSpindlePrompt({
                      spindles,
                      editingSpindlePromptId,
                      editSpindlePromptText,
                      showEditSpindlePromptModal,
                    })}
                    style={{
                      padding: "8px 16px",
                      background: "#8b5cf6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>,
            null
          )}

          {/* Edit Branch Factor Modal */}
          {ifElse(
            showEditBranchModal,
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
                  width: "320px",
                  maxWidth: "90%",
                }}
              >
                <h2 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>
                  Edit Branch Factor
                </h2>
                <p style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#6b7280" }}>
                  How many variations to generate at this level?
                </p>

                {ifElse(
                  showBranchDeleteWarning,
                  <div
                    style={{
                      padding: "12px",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "8px",
                      marginBottom: "16px",
                    }}
                  >
                    <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#991b1b" }}>
                      <strong>Warning:</strong> Decreasing the branch factor will delete some spindles and their content.
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={closeEditBranchModal({ showEditBranchModal, showBranchDeleteWarning })}
                        style={{
                          padding: "6px 12px",
                          background: "#f3f4f6",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmBranchDecrease({
                          levels,
                          spindles,
                          editingBranchLevelIndex,
                          pendingBranchFactor,
                          showEditBranchModal,
                          showBranchDeleteWarning,
                        })}
                        style={{
                          padding: "6px 12px",
                          background: "#dc2626",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        Delete & Apply
                      </button>
                    </div>
                  </div>,
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <button
                        onClick={handler<unknown, { editBranchFactor: Cell<number> }>(
                          (_, { editBranchFactor }) => {
                            const current = editBranchFactor.get();
                            if (current > 1) editBranchFactor.set(current - 1);
                          }
                        )({ editBranchFactor })}
                        style={{
                          width: "36px",
                          height: "36px",
                          background: "#f3f4f6",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "18px",
                        }}
                      >
                        -
                      </button>
                      <span style={{ fontSize: "24px", fontWeight: "600", minWidth: "40px", textAlign: "center" }}>
                        {derive(editBranchFactor, (v: number) => String(v))}
                      </span>
                      <button
                        onClick={handler<unknown, { editBranchFactor: Cell<number> }>(
                          (_, { editBranchFactor }) => {
                            const current = editBranchFactor.get();
                            if (current < 10) editBranchFactor.set(current + 1);
                          }
                        )({ editBranchFactor })}
                        style={{
                          width: "36px",
                          height: "36px",
                          background: "#f3f4f6",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "18px",
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {ifElse(
                  showBranchDeleteWarning,
                  null,
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button
                      onClick={closeEditBranchModal({ showEditBranchModal, showBranchDeleteWarning })}
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
                      onClick={applyBranchFactor({
                        levels,
                        spindles,
                        editingBranchLevelIndex,
                        editBranchFactor,
                        showEditBranchModal,
                        showBranchDeleteWarning,
                        pendingBranchFactor,
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
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </div>,
            null
          )}

          {/* Option Picker Modal - Fullscreen */}
          {ifElse(
            showOptionPicker,
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "#f8fafc",
                zIndex: 1000,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "white",
                }}
              >
                <button
                  onClick={closeOptionPicker({ showOptionPicker })}
                  style={{
                    padding: "8px 16px",
                    background: "#f3f4f6",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Close
                </button>

                <div style={{ fontWeight: "600", fontSize: "16px" }}>
                  Option {derive(pickerPreviewIndex, (i: number) => i + 1)} of 4
                </div>

                <button
                  onClick={pinFromPicker({
                    spindles,
                    levels,
                    pickerSpindleId,
                    pickerPreviewIndex,
                    showOptionPicker,
                    optionContent: derive(
                      { pickerSpindleId, pickerPreviewIndex, spindleResults },
                      (deps: { pickerSpindleId: string; pickerPreviewIndex: number; spindleResults: typeof spindleResults }) => {
                        // This is a simplified approach - would need proper lookup
                        return "";
                      }
                    ),
                  })}
                  style={{
                    padding: "8px 16px",
                    background: "#2563eb",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  Pin This Option
                </button>
              </div>

              {/* Content - show current option
                  TODO: Integrate ct-picker component here to display options.
                  Challenge: Need to create Cell array with UI for each option without
                  causing reactivity loops. See labs/packages/ui/src/v2/components/ct-picker/
                  and labs/packages/patterns/wish.tsx for examples of ct-picker usage.
              */}
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "32px",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    background: "white",
                    padding: "32px",
                    borderRadius: "12px",
                    maxWidth: "800px",
                    width: "100%",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                >
                  <p style={{ color: "#6b7280", textAlign: "center" }}>
                    Fullscreen picker coming soon - use ct-picker integration
                  </p>
                </div>
              </div>

              {/* Navigation */}
              <div
                style={{
                  padding: "16px 20px",
                  borderTop: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "24px",
                  background: "white",
                }}
              >
                <button
                  onClick={handler<unknown, { pickerPreviewIndex: Cell<number> }>(
                    (_, { pickerPreviewIndex }) => {
                      const current = pickerPreviewIndex.get();
                      pickerPreviewIndex.set((current - 1 + 4) % 4);
                    }
                  )({ pickerPreviewIndex })}
                  style={{
                    padding: "12px 24px",
                    background: "#f3f4f6",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Previous
                </button>

                {/* Dot indicators */}
                <div style={{ display: "flex", gap: "8px" }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: derive(
                          pickerPreviewIndex,
                          (idx: number) => idx === i ? "#2563eb" : "#d1d5db"
                        ),
                        cursor: "pointer",
                      }}
                      onClick={handler<unknown, { pickerPreviewIndex: Cell<number> }>(
                        (_, { pickerPreviewIndex }) => {
                          pickerPreviewIndex.set(i);
                        }
                      )({ pickerPreviewIndex })}
                    />
                  ))}
                </div>

                <button
                  onClick={handler<unknown, { pickerPreviewIndex: Cell<number> }>(
                    (_, { pickerPreviewIndex }) => {
                      const current = pickerPreviewIndex.get();
                      pickerPreviewIndex.set((current + 1) % 4);
                    }
                  )({ pickerPreviewIndex })}
                  style={{
                    padding: "12px 24px",
                    background: "#f3f4f6",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Next
                </button>
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

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export default StoryWeaver;
