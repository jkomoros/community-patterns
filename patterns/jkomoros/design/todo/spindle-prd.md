# Spindle PRD

## Overview

Spindle is a collaborative AI writing tool that transforms how humans work with LLMs for complex, multi-step generation tasks like story writing. Instead of getting one output and being stuck if you don't like it, Spindle shows you multiple possibilities at each step. You pick the best one, and that choice guides the next round of generation.

### The Core Problem

Current AI tools position you as either:
- **Prompt engineer**: Carefully craft prompts hoping for the right output
- **Accept/reject arbiter**: Take what the AI gives you or start over

Neither leverages human taste effectively. Spindle changes this by making selection the primary interaction, not prompting.

### The Spindle Metaphor

A spindle is a tool that transforms raw material through controlled rotation. In textiles, it turns loose fiber into strong thread. Spindle does the same with ideas:

- **Raw material**: Your initial concept, synopsis, or seed idea
- **Spinning**: LLM generates multiple options
- **Selection**: Human taste guides which thread continues
- **Thread**: The final output, refined through iterative human-AI collaboration

---

## Core Concepts

### Level-Based Architecture (v2)

**NEW IN V2:** Spindle uses a **level-based** design rather than individual spindle configuration. This simplifies the UI and makes branching intuitive.

```
Level 0: Synopsis (1 spindle, root, generate=false)
    ↓ branch=1
Level 1: Outline (1 spindle)
    ↓ branch=5
Level 2: Chapters (5 spindles)
    ↓ branch=3
Level 3: Scenes (15 spindles per chapter = 75 total? No - lazy creation)
```

**Key insight:** You configure LEVELS, not individual spindles. Each level has:
- A **title** (e.g., "Chapters")
- A **default prompt** (applied to all spindles at that level)
- A **branching factor** (how many children per parent)

Spindles are then created automatically based on the tree structure.

### Spindle

A **spindle** is the atomic unit of generation. It:

1. Takes input from its parent spindle's pinned output
2. Uses the level's default prompt + optional per-spindle extra prompt
3. Generates `n` options (default: 4)
4. Has one **pinned/selected** option that becomes its output
5. Auto-appends "Peer X of Y" to help LLM understand position

```
┌─────────────────────────────────────────┐
│ Chapter 3                               │
│ Peer 3 of 5 in level | Sibling 3 of 5   │
├─────────────────────────────────────────┤
│ [Parent output: Story Outline...]       │
│ [Level prompt: Write this chapter]      │
│ [Extra prompt: Focus on tension]        │
├─────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ │Option 1 │ │Option 2 │ │Option 3 │ ...│
│ │         │ │ [PINNED]│ │         │    │
│ │ (gray)  │ │         │ │ (gray)  │    │
│ └─────────┘ └─────────┘ └─────────┘    │
├─────────────────────────────────────────┤
│ Summary: "Chapter 3 escalates the..."   │
└─────────────────────────────────────────┘
```

### Board

A **board** is a collection of levels and spindles forming a tree. It represents a complete project like "My Detective Novel".

Board contains:
- **Title** and **description**
- **Levels** with their configuration (title, prompt, branching)
- **Spindles** (created lazily as parents are pinned)

### Levels

Each **level** defines:

```typescript
interface LevelConfig {
  title: string;           // "Chapters"
  defaultPrompt: string;   // "Write this chapter based on the outline above"
  branchFactor: number;    // How many children per parent (1, 2, 4, 5, etc.)
}
```

- **Level 0** is always the root (typically synopsis, generate=false)
- Adding a level creates children for each pinned spindle at the previous level
- Spindles inherit the level's default prompt

### Automatic Position Suffix

Every spindle's prompt automatically includes position information:

**Format:** `Peer X of Y` where:
- X = position among siblings (children of same parent)
- Y = total siblings

**Example for Chapters level with branchFactor=5:**
- "Write this chapter. Peer 1 of 5"
- "Write this chapter. Peer 2 of 5"
- etc.

**If level has total > sibling count, also show:**
- "Peer 3 of 5 | Spindle 13 of 25 in level"

(Omit the second part if redundant - i.e., if there's only one parent)

### Per-Spindle Extra Prompt

Each spindle can have an optional **extra prompt** for customization:

```
[Parent output]
[Level default prompt]
[Extra prompt if any]
Peer X of Y
```

This allows steering individual spindles without changing the level config.

### Lazy Spindle Creation

Spindles are created **lazily** when their parent is pinned:

1. User pins an option on a parent spindle
2. If a child level exists, child spindles are created for that parent
3. Child spindles begin generating options

This prevents creating spindles for branches that will never be used.

### Pinning

**Pinning** is the core selection mechanism:

- **Pin an option** → It becomes the selected output, triggers child creation
- **Non-pinned options** → Grayed out visually
- **Respin (explicit)** → Regenerates all options fresh

**Auto-respin behavior (when parent output changes):**
- **Nothing pinned** → Auto-respin ALL options
- **Something pinned** → Show "stale" indicator, do NOT auto-respin
- **User clicks "Refresh" on stale spindle** → Clears pin, regenerates fresh

### Summary

Each spindle auto-generates a **summary** of its selected output:

- Generated when output is pinned
- Default prompt: "Summarize the above in 2-3 sentences"
- Visible in compact view

---

## Prompt Composition

The actual prompt sent to the LLM is composed from:

```
[Parent's pinned output]

[Level's default prompt]

[Spindle's extra prompt, if any]

Peer X of Y
```

### System Suffix (auto-appended)

```
Generate 4 distinct options for the above request.
Each option should take a meaningfully different approach.
```

### Example

**Level 0 - Synopsis** (root, generate=false):
- Output: "A detective in 1920s Chicago discovers her missing sister is running a speakeasy..."

**Level 1 - Outline** (branchFactor=1):
- Default prompt: "Develop this into a 5-act story outline with major plot beats"
- Composed: `[synopsis]\n\nDevelop this into a 5-act...\n\nPeer 1 of 1`

**Level 2 - Chapters** (branchFactor=5):
- Default prompt: "Now write this chapter"
- Chapter 3 composed: `[outline]\n\nNow write this chapter\n\nPeer 3 of 5`

---

## Data Model

### LevelConfig

```typescript
interface LevelConfig {
  id: string;              // Auto-generated UUID
  title: string;           // "Chapters"
  defaultPrompt: string;   // "Write this chapter"
  branchFactor: number;    // 5
}
```

### SpindleConfig

```typescript
interface SpindleConfig {
  id: string;              // Auto-generated UUID
  levelIndex: number;      // Which level (0, 1, 2, ...)
  positionInLevel: number; // 0-based position across entire level
  siblingIndex: number;    // 0-based position among siblings (same parent)
  siblingCount: number;    // Total siblings
  parentId: string | null; // Parent spindle's ID (null for root)

  // Content
  composedInput: string;   // Parent's pinned output (set by handler)
  extraPrompt: string;     // Per-spindle customization

  // State
  pinnedOptionIndex: number; // -1 = none, 0-3 = pinned option
  pinnedOutput: string;      // The selected option's content
}
```

### Board State

```typescript
interface BoardState {
  // Metadata
  title: string;
  description: string;

  // Configuration
  levels: LevelConfig[];

  // Runtime state (cell arrays for reactivity)
  spindles: SpindleConfig[];
}
```

### Computed Properties

```typescript
// Get pinned output for a spindle
spindle.output = spindle.pinnedOptionIndex >= 0
  ? spindle.pinnedOutput
  : null;

// Check if spindle needs attention
spindle.needsSelection = spindle.pinnedOptionIndex < 0;

// Get children of a spindle
spindle.children = spindles.filter(s => s.parentId === spindle.id);

// Check if has pinned children
spindle.hasPinnedChildren = spindle.children.some(c => c.pinnedOptionIndex >= 0);
```

---

## User Flows

### Flow 1: Create Board with Root

1. Board created with default title
2. Level 0 (root) is auto-created: title="Synopsis", generate=false
3. User enters synopsis text in root spindle
4. Root is automatically "pinned" (since generate=false, input=output)

### Flow 2: Add Level (Outline)

1. User clicks "Add Level"
2. Modal: Enter title="Story Outline", prompt="Develop into 5-act outline", branch=1
3. Level created, spindle created as child of root
4. Spindle generates 4 options
5. User reviews, pins favorite

### Flow 3: Add Level (Chapters)

1. User clicks "Add Level"
2. Modal: Enter title="Chapters", prompt="Write this chapter", branch=5
3. Level created, 5 spindles created as children of Outline
4. Each spindle generates options with "Peer 1 of 5", "Peer 2 of 5", etc.
5. User pins favorites for each chapter

### Flow 4: Add Extra Prompt to Spindle

1. User clicks on Chapter 3 spindle
2. Enters extra prompt: "This chapter should focus on the confrontation"
3. Spindle regenerates with extra context
4. User reviews new options, pins favorite

### Flow 5: Parent Changes (Stale Detection)

1. User has pinned Chapter outputs
2. User goes back to Outline, pins different option
3. All Chapter spindles show "STALE" indicator
4. User can "Refresh" each to respin with new parent
5. Or keep stale content if they prefer it

### Flow 6: Export Board

1. User clicks "Export JSON"
2. JSON downloaded containing:
   - Board metadata (title, description)
   - Level configs
   - All spindles with their pinned outputs
3. Can re-import to continue editing (future)

---

## UI Components

### Board View

```
┌─────────────────────────────────────────────────────────┐
│ My Detective Novel                        [Export JSON] │
│ A noir story set in 1920s Chicago                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Level 0 - Synopsis                                     │
│  ┌─────────────────────────────────────┐                │
│  │ [Synopsis content...]               │                │
│  └─────────────────────────────────────┘                │
│                 │                                       │
│  Level 1 - Outline (branch: 1)           [+ Add Level]  │
│  ┌─────────────────────────────────────┐                │
│  │ [Outline options... Pin one]        │                │
│  └─────────────────────────────────────┘                │
│                 │                                       │
│  Level 2 - Chapters (branch: 5)                         │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                    │
│  │Ch 1│ │Ch 2│ │Ch 3│ │Ch 4│ │Ch 5│                    │
│  └────┘ └────┘ └────┘ └────┘ └────┘                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Add Level Modal

```
┌─────────────────────────────────────────┐
│ Add New Level                           │
├─────────────────────────────────────────┤
│ Title: [Chapters                    ]   │
│                                         │
│ Default Prompt:                         │
│ [Write this chapter based on the    ]   │
│ [outline above.                     ]   │
│                                         │
│ Branch Factor: [5  ▼]                   │
│ (Children per parent)                   │
│                                         │
│              [Cancel]  [Add Level]      │
└─────────────────────────────────────────┘
```

### Spindle Card

```
┌─────────────────────────────────────────┐
│ Chapter 3                    [+ Extra]  │
│ Peer 3 of 5                             │
├─────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ │Option 1 │ │Option 2 │ │Option 3 │ ...│
│ │         │ │ [PINNED]│ │         │    │
│ └─────────┘ └─────────┘ └─────────┘    │
│                                         │
│                           [Respin]      │
├─────────────────────────────────────────┤
│ Summary: "Chapter 3 introduces..."      │
└─────────────────────────────────────────┘
```

### Stale Indicator

```
┌─────────────────────────────────────────┐
│ Chapter 3                    ⚠️ STALE   │
│ Parent output has changed               │
│                                         │
│ [Current pinned content shown...]       │
│                                         │
│              [Refresh]  [Keep Anyway]   │
└─────────────────────────────────────────┘
```

---

## MVP Scope

### In Scope (MVP v2)

| Feature | Priority | Status |
|---------|----------|--------|
| Level-based architecture | P0 | NEW |
| Add Level UI | P0 | NEW |
| Branching factor config | P0 | NEW |
| Lazy spindle creation | P0 | NEW |
| Automatic "Peer X of Y" suffix | P0 | NEW |
| n-up option generation | P0 | ✅ Done |
| Pin/select options | P0 | ✅ Done |
| Parent-child chains | P0 | ✅ Done |
| Respin functionality | P0 | ✅ Done |
| Stale detection | P0 | ✅ Done |
| Export to JSON | P1 | ✅ Done |
| Per-spindle extra prompt | P1 | NEW |
| Summary generation | P1 | ✅ Done |

### Out of Scope (Future)

| Feature | Notes |
|---------|-------|
| Import from JSON | Requires file upload handling |
| Manual option editing | Edit option text directly |
| Peers (left/right) | Adjacent spindle summaries for context |
| Git-style history | Branch, undo, compare versions |
| Model selection | Per-level or board-level |
| Collaborative | Real-time multi-user editing |

---

## Technical Implementation Notes

### Framework Pattern: Dynamic Cell Array

Spindle uses the "empty default + handler" pattern from Common Tools:

```typescript
interface Input {
  levels: Default<LevelConfig[], []>;     // Start empty
  spindles: Default<SpindleConfig[], []>; // Start empty
}

// Handlers modify the arrays
const addLevel = handler(..., ({ levels, spindles }) => {
  levels.push(newLevel);
  // Create spindles for pinned parents
  for (const parent of pinnedParents) {
    for (let i = 0; i < branchFactor; i++) {
      spindles.push({
        levelIndex: newLevel.index,
        parentId: parent.id,
        siblingIndex: i,
        siblingCount: branchFactor,
        composedInput: parent.pinnedOutput,
        // ...
      });
    }
  }
});

// Map creates reactive generations
const spindleGenerations = spindles.map((config) => {
  const prompt = derive(config, (c) =>
    `${c.composedInput}\n\n${levels[c.levelIndex].defaultPrompt}\n\n${c.extraPrompt}\n\nPeer ${c.siblingIndex + 1} of ${c.siblingCount}`
  );

  const generation = generateObject({ prompt, ... });

  return { config, generation, options: [...] };
});
```

### Pin Handler Flow

When user pins an option:

```typescript
const pinOption = handler(..., ({ spindles, spindleId, optionIndex, optionContent }) => {
  // 1. Update this spindle's pinned state
  const spindle = spindles.find(s => s.id === spindleId);
  spindle.pinnedOptionIndex = optionIndex;
  spindle.pinnedOutput = optionContent;

  // 2. Update children's composedInput (triggers regeneration)
  const children = spindles.filter(s => s.parentId === spindleId);
  for (const child of children) {
    child.composedInput = optionContent;
  }

  // 3. Create new children if next level exists but no children yet
  const nextLevel = levels[spindle.levelIndex + 1];
  if (nextLevel && children.length === 0) {
    for (let i = 0; i < nextLevel.branchFactor; i++) {
      spindles.push({
        levelIndex: spindle.levelIndex + 1,
        parentId: spindle.id,
        siblingIndex: i,
        siblingCount: nextLevel.branchFactor,
        composedInput: optionContent,
        // ...
      });
    }
  }

  // 4. Trigger reactivity
  spindles.set([...spindles.get()]);
});
```

### Stale Detection

```typescript
// Store parent hash when pinning
spindle.parentHashWhenPinned = hashString(spindle.composedInput);

// Check for staleness
const isStale = derive(
  { config, currentComposedInput },
  ({ config, currentComposedInput }) => {
    if (config.pinnedOptionIndex < 0) return false;
    return hashString(currentComposedInput) !== config.parentHashWhenPinned;
  }
);
```

### Export Format (v2)

```json
{
  "version": "2.0",
  "exportedAt": "2024-11-30T...",
  "board": {
    "title": "My Detective Novel",
    "description": "A noir story..."
  },
  "levels": [
    { "id": "l0", "title": "Synopsis", "defaultPrompt": "", "branchFactor": 1 },
    { "id": "l1", "title": "Outline", "defaultPrompt": "Develop into 5-act outline", "branchFactor": 1 },
    { "id": "l2", "title": "Chapters", "defaultPrompt": "Write this chapter", "branchFactor": 5 }
  ],
  "spindles": [
    {
      "id": "s0",
      "levelIndex": 0,
      "positionInLevel": 0,
      "siblingIndex": 0,
      "siblingCount": 1,
      "parentId": null,
      "output": "A detective in 1920s Chicago...",
      "summary": null
    },
    {
      "id": "s1",
      "levelIndex": 1,
      "positionInLevel": 0,
      "siblingIndex": 0,
      "siblingCount": 1,
      "parentId": "s0",
      "output": "Act 1: The Discovery...",
      "summary": "Five-act noir structure..."
    },
    {
      "id": "s2",
      "levelIndex": 2,
      "positionInLevel": 0,
      "siblingIndex": 0,
      "siblingCount": 5,
      "parentId": "s1",
      "output": "Chapter 1 content...",
      "summary": "Mary discovers..."
    }
    // ... more spindles
  ]
}
```

---

## Open Questions (Resolved)

1. ~~**Individual spindle config vs level config**~~ → Level-based is simpler
2. ~~**Position template {{position}}**~~ → Auto "Peer X of Y" suffix instead
3. ~~**When are spindles created?**~~ → Lazily when parent is pinned
4. ~~**Branching UI**~~ → Configure per-level, not per-spindle

---

## Changelog

### v2.0 (2024-11-30)
- **NEW:** Level-based architecture replacing individual spindle config
- **NEW:** Branching factor per level
- **NEW:** Automatic "Peer X of Y" suffix
- **NEW:** Lazy spindle creation
- **NEW:** Per-spindle extra prompt
- **CHANGED:** Data model to support levels
- **CHANGED:** Export format to v2.0

### v1.0 (2024-11-30)
- Initial implementation with fixed slots
- Basic n-up generation, pinning, stale detection
- Export JSON functionality
