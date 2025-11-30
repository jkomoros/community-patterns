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

### Spindle

A **spindle** is the atomic unit of generation. It:

1. Takes input from parent spindle(s)
2. Has its own prompt that describes what to generate
3. Generates `n` options (default: 4)
4. Has one **pinned/selected** option that becomes its output
5. Produces an auto-generated **summary** of its output

```
┌─────────────────────────────────────────┐
│ Spindle: "Story Outline"                │
├─────────────────────────────────────────┤
│ Parent: Synopsis                        │
│ Prompt: "Create a 5-act story outline"  │
├─────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ │Option 1 │ │Option 2 │ │Option 3 │ ...│
│ │         │ │ [PINNED]│ │         │    │
│ │ (gray)  │ │         │ │ (gray)  │    │
│ └─────────┘ └─────────┘ └─────────┘    │
├─────────────────────────────────────────┤
│ Summary: "Five-act noir structure..."   │
└─────────────────────────────────────────┘
```

### Board

A **board** is a collection of spindles wired together in a DAG (directed acyclic graph). It represents a complete project like "My Detective Novel".

Board contains:
- **Title** and **description**
- **Spindles** with their parent-child relationships
- **Settings** (future: defaultSummaryPrompt, default n)

### Options

Each spindle generates `n` options. Options are:
- **Generated** by the LLM based on the composed prompt
- **Displayed** side-by-side for comparison
- **Pinnable** (one at a time) - pinning = selecting

### Pinning

**Pinning** is the core selection mechanism:

- **Pin an option** → It becomes the selected output
- **Non-pinned options** → Grayed out visually
- **Respin (explicit)** → Regenerates all non-pinned options (pinned one survives)

**Auto-respin behavior (when parent output changes):**
- **Nothing pinned** → Auto-respin ALL options (this is the default state)
- **Something pinned** → Show "stale" indicator, do NOT auto-respin
- **User clicks "Refresh" on stale spindle** → Clears pin, regenerates all options fresh

### Summary

Each spindle auto-generates a **summary** of its selected output:

- Generated when output changes
- Uses `summaryPrompt` (customizable per-spindle)
- Visible to user in compact view
- Future: Used by peer spindles for context compression

---

## Prompt Composition

The actual prompt sent to the LLM is composed from multiple sources:

```
[Parent 1's selected output]
[Parent 2's selected output]
...
[This spindle's prompt]
[System suffix for n-up generation]
```

### System Suffix (auto-appended)

```
Generate {n} distinct options for the above request.
Each option should take a meaningfully different approach.
Wrap each option in <option></option> tags.
```

### Example

**Synopsis Spindle** (root, no parent):
- Prompt: "A detective in 1920s Chicago discovers her missing sister is running a speakeasy..."
- Output: Same as prompt (generate: false)

**Outline Spindle** (child of Synopsis):
- Parent output: "A detective in 1920s Chicago..."
- Prompt: "Develop this into a 5-act story outline with major plot beats"
- Composed: `[synopsis text]\n\nDevelop this into a 5-act story outline...`

**Chapter 1 Spindle** (child of Outline):
- Parent output: The selected outline
- Prompt: "Now write Chapter 1"
- Composed: `[full outline]\n\nNow write Chapter 1`

---

## Data Model

### Board

```typescript
interface Board {
  id: string;
  title: string;
  description: string;

  // All spindles in this board
  spindles: Spindle[];

  // Future: Board-level defaults
  // defaultTargetOptions?: number;
  // defaultSummaryPrompt?: string;
  // defaultModel?: string;
}
```

### Spindle

```typescript
interface Spindle {
  id: string;
  title: string;
  description?: string;

  // Generation config
  prompt: string;
  targetOptions: number; // Default: 4
  generate: boolean; // Default: true. If false, output = prompt
  summaryPrompt: string; // Default: "Summarize the above in 2-3 sentences"

  // Relationships
  parentIds: string[]; // Usually 1, could be 0 (root) or multiple

  // Position in tree view (for rendering and {{position}} template)
  level: number; // 0 = root
  position: number; // Left-to-right within level (0-indexed)

  // Generated content
  options: SpindleOption[];
  pinnedOptionId: string | null;
  summary: string | null;

  // State
  isStale: boolean; // True if pinned but parent changed
}
```

### SpindleOption

```typescript
interface SpindleOption {
  id: string;
  content: string;
  generatedAt: string; // ISO timestamp
}
```

### Computed Properties

```typescript
// The selected output (used by children)
spindle.output = spindle.pinnedOptionId
  ? spindle.options.find(o => o.id === spindle.pinnedOptionId)?.content
  : null;

// Whether this spindle needs attention
spindle.needsSelection = !spindle.pinnedOptionId && spindle.options.length > 0;
spindle.needsGeneration = spindle.options.length === 0;
```

---

## User Flows

### Flow 1: Create New Board

1. User clicks "New Board"
2. Enter title: "My Detective Novel"
3. Enter description: "A noir story set in 1920s Chicago"
4. Board created with empty spindle list

### Flow 2: Add Root Spindle (Synopsis)

1. User clicks "Add Spindle" on empty board
2. Enter title: "Synopsis"
3. Enter prompt: "A detective in 1920s Chicago discovers..."
4. Set `generate: false` (this is just the seed)
5. Spindle appears at level 0
6. Output = prompt (no options generated)

### Flow 3: Add Child Spindle (Outline)

1. User clicks "Add Child" on Synopsis spindle
2. Enter title: "Story Outline"
3. Enter prompt: "Develop this into a 5-act story outline with major plot beats, character arcs, and key scenes"
4. Target options: 4 (default)
5. Click "Spin"
6. 4 outline options appear
7. User reviews, pins their favorite
8. Summary auto-generates

### Flow 4: Respin (Not Happy with Options)

1. User reviews 4 options, none are quite right
2. User pins the closest one (Option 2)
3. User clicks "Respin"
4. Options 1, 3, 4 regenerate
5. Option 2 stays (pinned)
6. User reviews new options
7. New Option 4 is better, user pins it instead
8. Output updates, children see new outline

### Flow 5: Add Chapter Spindles

1. User clicks "Add Children" on Outline spindle (or adds them one by one)
2. Creates "Chapter 1", "Chapter 2", etc.
3. Each has prompt: "Now write Chapter {{position + 1}}"
4. `{{position}}` is auto-replaced with the spindle's position (0-indexed)
5. User spins each chapter
6. Reviews 4 versions of each chapter
7. Pins favorites

### Flow 6: Parent Changes (Stale Detection)

1. User has pinned Chapter 1 output
2. User goes back to Outline, changes their selection
3. Chapter 1 shows "STALE" indicator (yellow border?)
4. User can click "Refresh" to respin with new parent
5. Or keep the stale content if they prefer it

### Flow 7: Export Board

1. User clicks "Export"
2. JSON downloaded containing:
   - Board metadata
   - All spindles with their selected outputs as markdown
3. Can re-import to continue editing

---

## UI Components

### Board View

```
┌─────────────────────────────────────────────────────────┐
│ My Detective Novel                              [Export]│
│ A noir story set in 1920s Chicago                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Level 0:  [Synopsis]                                   │
│                 │                                       │
│  Level 1:  [Story Outline]                              │
│                 │                                       │
│            ┌────┴────┬─────────┬─────────┐              │
│  Level 2:  [Ch 1]  [Ch 2]  [Ch 3]  [Ch 4]  [+ Add]     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Spindle Card (Compact View)

```
┌─────────────────────────────────────────┐
│ Story Outline                    [Edit] │
│ ─────────────────────────────────────── │
│ "Five-act noir structure focusing on    │
│ the sisterly bond, with twist ending.." │
│                             [Expand ▼]  │
└─────────────────────────────────────────┘
```

### Spindle Card (Expanded View)

```
┌─────────────────────────────────────────────────────────┐
│ Story Outline                               [Collapse ▲]│
├─────────────────────────────────────────────────────────┤
│ Prompt: Develop this into a 5-act story outline with    │
│ major plot beats, character arcs, and key scenes        │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐   │
│ │   Option 1    │ │   Option 2    │ │   Option 3    │   │
│ │               │ │   [PINNED]    │ │               │   │
│ │  Classic noir │ │  Relationship │ │  Heist-style  │   │
│ │  structure... │ │  focused...   │ │  escalation...│   │
│ │               │ │               │ │               │   │
│ │   (grayed)    │ │               │ │   (grayed)    │   │
│ └───────────────┘ └───────────────┘ └───────────────┘   │
│                                                         │
│                     [Respin]                            │
├─────────────────────────────────────────────────────────┤
│ Summary: Five-act noir structure focusing on sisterly   │
│ bond. Act 1 establishes Mary as detective, Act 2...     │
└─────────────────────────────────────────────────────────┘
```

### Option Card States

- **Default**: White background, clickable
- **Pinned**: Blue border, highlighted, "Pinned" badge
- **Grayed**: Lower opacity, still readable but de-emphasized
- **Generating**: Skeleton/shimmer loading state

### Stale Indicator

```
┌─────────────────────────────────────────┐
│ Chapter 1                    ⚠️ STALE   │
│ ─────────────────────────────────────── │
│ Content based on outdated parent.       │
│                    [Refresh] [Keep]     │
└─────────────────────────────────────────┘
```

---

## MVP Scope

### In Scope (MVP)

| Feature | Priority | Notes |
|---------|----------|-------|
| n-up option generation | P0 | Core mechanic |
| Pin/select options | P0 | Core mechanic |
| Parent-child chains | P0 | Core mechanic |
| Respin (regenerate unpinned) | P0 | Core mechanic |
| Auto-respin on parent change | P0 | With stale detection |
| Tree view layout | P0 | Fixed levels, no dragging |
| Board create/edit | P0 | Title, description |
| Spindle create/edit | P0 | Title, prompt, targetOptions |
| Summary generation | P1 | Auto-generate on output change |
| Customizable summaryPrompt | P1 | Per-spindle |
| Export to JSON | P1 | ✅ DONE - Board + all spindle outputs |
| Import from JSON | P2 | Resume editing (deferred - requires file upload handling) |
| `generate: false` spindles | P1 | For human-input roots |
| `{{position}}` template var | P1 | For chapter numbering |
| Expanded/compact view toggle | P1 | Per-spindle |

### Out of Scope (Future)

| Feature | Notes |
|---------|-------|
| Manual option editing | Edit an option's text directly |
| Peers (left/right) | Adjacent spindle summaries for context |
| Git-style history | Branch, undo, compare versions |
| Drag-and-drop layout | Spatial canvas positioning |
| Split output | Auto-create children from structured output |
| Board templates/forking | Clone a board structure |
| defaultSummaryPrompt (board-level) | Inheritance hierarchy |
| Tree-level prompt overrides | Different prompts per level |
| Model selection | Per-spindle or board-level |
| "Chat with" refinement | Conversational editing of prompts |

---

## Technical Implementation Notes

### Architecture: Two Patterns

Spindle is implemented as **two separate patterns**:

#### `spindle.tsx` - Single Spindle Component

The atomic unit of generation. Handles:
- Receiving composed input (from parent outputs)
- Generating n options via LLM
- Displaying options for selection
- Pinning/unpinning
- Respin functionality
- Summary generation

**Inputs:**
- `composedInput: string` - The concatenated parent outputs
- `prompt: string` - This spindle's specific prompt
- `targetOptions: number` - How many options to generate
- `summaryPrompt: string` - How to summarize the output

**Outputs:**
- `output: string` - The selected/pinned option content
- `summary: string` - Auto-generated summary
- `isPinned: boolean` - Whether an option is pinned
- `isGenerating: boolean` - Whether currently generating

#### `spindle-board.tsx` - Board Orchestrator

Manages the graph of spindles. Handles:
- Creating/deleting spindles
- Wiring parent-child relationships
- Passing composed inputs to child spindles
- Stale detection and indicators
- Board-level export/import
- Tree view layout and navigation

**Key responsibility:** When a parent spindle's output changes:
- If child has nothing pinned → auto-trigger respin on child
- If child has something pinned → mark child as stale, wait for explicit user action

### Framework Fit

The Common Tools pattern framework is well-suited for Spindle:

**Good fit:**
- `generateObject` for structured option generation
- Reactive cells for spindle state
- Built-in LLM caching (same prompt = cached result)
- Persistence via cell state
- Pattern composition (board instantiates spindle sub-patterns)

**Implementation approach:**
- `spindle-board` = main pattern, owns the spindle graph
- `spindle` = sub-pattern, instantiated by board for each node
- Board passes `composedInput` to each spindle based on parent outputs
- Spindles are reactive - when `composedInput` changes, they can auto-respin

### Option Generation

```typescript
// Compose prompt for LLM
const composedPrompt = derive(
  { parentOutputs, spindlePrompt, targetOptions },
  ({ parentOutputs, spindlePrompt, targetOptions }) => {
    const parentText = parentOutputs.join('\n\n---\n\n');
    return `${parentText}\n\n${spindlePrompt}\n\n` +
      `Generate ${targetOptions} distinct options. ` +
      `Wrap each in <option></option> tags.`;
  }
);

// Generate options
const generation = generateObject<{ options: string[] }>({
  prompt: composedPrompt,
  system: "You are a creative writing assistant...",
});
```

### Stale Detection

```typescript
// Track parent output hashes for stale detection
const parentOutputHash = derive(
  parentSpindles.map(p => p.output),
  (outputs) => hashString(outputs.join('|'))
);

// Compare to hash when pinned
const isStale = derive(
  { currentHash: parentOutputHash, pinnedHash: spindle.pinnedParentHash },
  ({ currentHash, pinnedHash }) =>
    spindle.pinnedOptionId && currentHash !== pinnedHash
);
```

### Export Format

```json
{
  "version": "1.0",
  "exportedAt": "2024-11-30T...",
  "board": {
    "id": "...",
    "title": "My Detective Novel",
    "description": "A noir story..."
  },
  "spindles": [
    {
      "id": "...",
      "title": "Synopsis",
      "prompt": "A detective in 1920s Chicago...",
      "output": "A detective in 1920s Chicago...",
      "outputMarkdown": "A detective in 1920s Chicago...",
      "summary": null,
      "level": 0,
      "position": 0,
      "parentIds": []
    },
    {
      "id": "...",
      "title": "Story Outline",
      "prompt": "Develop this into a 5-act outline...",
      "output": "Act 1: The Discovery\n...",
      "outputMarkdown": "## Act 1: The Discovery\n...",
      "summary": "Five-act noir structure...",
      "level": 1,
      "position": 0,
      "parentIds": ["synopsis-id"]
    }
  ]
}
```

---

## Open Questions

1. **Multiple parents**: The data model supports multiple parents, but what's the use case? Keep for flexibility or simplify to single parent?

2. **Option count after respin**: If user pins 1 of 4, respin generates 3 new ones. Should we always maintain exactly `targetOptions`, or allow it to grow?

3. **Summary prompt default**: What's a good default? "Summarize in 2-3 sentences"? "Extract key points"?

4. **Stale refresh behavior**: When user clicks "Refresh" on stale spindle:
   - Clear the pin and regenerate ALL options fresh (decided: yes, this is the behavior)

5. **Root spindle creation**: Should there be a "quick start" that creates Synopsis + Outline spindles with sensible defaults for story creation?

---

## TODO (Future Enhancements)

- [ ] **Peers**: Add left/right peer relationships, summary context injection
- [ ] **History**: Git-style versioning with branch/merge/compare
- [ ] **Manual editing**: Direct text editing of options
- [ ] **Split output**: Parse structured output into child spindles
- [ ] **Templates**: Save board structure as reusable template
- [ ] **Model selection**: Choose LLM model per-spindle or board
- [ ] **Drag-and-drop**: Canvas layout with spatial positioning
- [ ] **Chat refinement**: Conversational prompt editing
- [ ] **Collaborative**: Real-time multi-user editing
- [ ] **Export formats**: Markdown, DOCX, PDF in addition to JSON
