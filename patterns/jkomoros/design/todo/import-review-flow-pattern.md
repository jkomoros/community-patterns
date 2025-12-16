# Import/Review Flow Pattern Design

## Problem Statement

Multiple patterns in this codebase share a common flow:
1. User provides free-form text input OR uploads a file (image, PDF)
2. LLM extracts/parses structured data from that input
3. User reviews extracted items in a UI that allows:
   - Selecting which items to include/exclude
   - Viewing diffs against existing data
   - Possibly editing items before acceptance
4. User accepts changes, which mutate the target data

This flow is currently implemented ~3x with significant code duplication:
- **person.tsx**: Extract profile fields from notes → diff review modal → apply changes
- **food-recipe.tsx**: Extract recipe data from notes/images → diff review modal → apply
- **store-mapper.tsx**: Extract aisles from photos → per-item checkboxes → merge/add

The implementations are finicky and easy to get wrong due to:
- **Reactive complexity**: LLM calls only work in pattern body, not handlers/computed
- **State management**: Tracking pending, result, selected items, trigger state
- **Performance traps**: Easy to create reactive storms with naive approaches
- **UI boilerplate**: Rendering diff views, checkboxes, accept/cancel flows

## Research Summary

### Pattern 1: person.tsx (Field Diff Flow)

**Input mechanisms:**
- Notes field with "Extract Data from Notes" button
- `extractTrigger` cell holds notes snapshot with timestamp to trigger extraction

**Extraction:**
```typescript
const extractTrigger = Cell.of<string>("");
const { result: extractionResult, pending: extractionPending } = generateObject({
  system: "...",
  prompt: extractTrigger,
  schema: { ... },
});
```

**Review UI:**
- Uses `ifElse(hasExtractionResults, reviewModal, normalForm)`
- `compareFields()` utility computes list of changes
- `computeWordDiff()` for word-level diff rendering in notes field
- Single "Accept Changes" button applies all changes

**Apply flow:**
- Handler iterates all fields, applies non-empty extracted values
- Clears extractionResult to hide modal

**Key insight:** This is "all-or-nothing" - no per-field selection.

### Pattern 2: food-recipe.tsx (Field Diff Flow, similar to person)

Nearly identical structure to person.tsx:
- Same `extractTrigger` pattern with timestamp
- Same `compareFields()` and `computeWordDiff()` utilities
- Same modal overlay approach
- Same all-or-nothing apply

**Additional complexity:** Handles arrays (ingredients, stepGroups, tags)

### Pattern 3: store-mapper.tsx (Per-Item Selection Flow)

**Input mechanism:**
- `uploadedPhotos` cell with file upload
- Each photo triggers generateObject via `.map()`

**Extraction:**
```typescript
const photoExtractions = uploadedPhotos.map((photo, photoIndex) => {
  const extraction = generateObject({
    prompt: derive(photo, (p) => [...]),
    schema: { ... },
  });
  return { photo, extractedAisles: extraction.result, pending: extraction.pending };
});
```

**Review UI:**
- Per-photo sections with individual aisle items
- Per-item checkboxes for merge conflicts
- `selectedMergeItems` cell tracks checkbox state: `Record<string, string[]>`
- Three action types:
  - "Add All X New Aisles from All Photos" (batch)
  - "Add All X New" (per-photo batch)
  - "Merge Selected into Aisle X" (per-item merge with checkbox selection)

**Apply flow:**
- Multiple handlers for different granularities
- `analyzeOverlap()` determines new vs existing items
- `hiddenPhotoIds` tracks "consumed" photos

**Key insight:** This is fine-grained selection with merge logic.

### Framework Constraints (from docs)

1. **generateObject/generateText only in pattern body** - Cannot call from handlers or computed()
2. **Automatic caching** - Framework caches LLM responses by content hash
3. **computed() for transforms** - Direct iteration over reactive arrays fails
4. **ifElse() for conditional rendering** - Ternaries don't work for elements
5. **Cell.of() for local state** - Needed for trigger cells, selection state
6. **derive() creates read-only cells** - Can't use for mutation targets

### diff-utils.ts (Shared Utility)

Already extracted common logic:
- `computeWordDiff()` - Word-level diff algorithm
- `compareFields()` - Generic field comparison for building change lists

## Design Options

### Option A: Utility Functions Only (Current State)

Keep current approach of shared utilities + per-pattern implementation.

**Pros:**
- Maximum flexibility for each pattern's unique needs
- No abstraction overhead
- Already partially done (diff-utils.ts)

**Cons:**
- ~200-400 lines of boilerplate per pattern
- Easy to introduce performance bugs
- Inconsistent UX across patterns

### Option B: Composable Patterns (Recommended)

Create reusable sub-patterns that can be composed into larger patterns.

#### B.1: ImportTrigger Pattern
Handles the "trigger extraction from text/image" flow:
```typescript
interface ImportTriggerInput<T> {
  // Text input for extraction
  sourceText?: Cell<string>;
  // Or image input
  sourceImages?: Cell<ImageData[]>;
  // LLM config
  systemPrompt: string;
  schema: JSONSchema;
  // Callback stream for when extraction completes
  onExtraction?: Stream<{ result: T; pending: boolean }>;
}

interface ImportTriggerOutput<T> {
  // Reactive extraction result
  result: T | null;
  pending: boolean;
  // UI element for trigger button
  triggerUI: JSX.Element;
  // Handler to manually trigger
  trigger: () => void;
  // Handler to clear result
  clear: () => void;
}
```

#### B.2: ReviewList Pattern
Handles selectable list of items for review:
```typescript
interface ReviewListInput<T> {
  items: T[];
  // Compare to existing items
  existingItems?: T[];
  // Item identity key
  getKey: (item: T) => string;
  // Render single item
  renderItem: (item: T, isNew: boolean) => JSX.Element;
  // Compute overlap/conflict
  computeConflict?: (item: T, existing: T) => ConflictInfo;
}

interface ReviewListOutput<T> {
  selectedItems: Cell<T[]>;
  conflictItems: T[];
  newItems: T[];
  UI: JSX.Element;
}
```

#### B.3: DiffPreview Pattern
Handles field-by-field diff display:
```typescript
interface DiffPreviewInput<T> {
  extracted: T | null;
  fieldMappings: FieldMapping<T>[];
  onAccept: Stream<void>;
  onCancel: Stream<void>;
}
```

**Pros:**
- Composable building blocks
- Consistent behavior across patterns
- Type-safe

**Cons:**
- Pattern composition has overhead
- Cross-pattern streams are complex
- May not fit all use cases perfectly

### Option C: Higher-Order Pattern Factory

Create a factory that generates the entire import/review pattern:

```typescript
const ImportReviewPattern = createImportReviewFlow({
  // Input source configuration
  inputType: "text" | "image" | "both",

  // Extraction configuration
  extractionConfig: {
    systemPrompt: string,
    schema: JSONSchema,
    model?: string,
  },

  // Review configuration
  reviewMode: "all-or-nothing" | "per-item" | "per-field",

  // Field mappings for diff display
  fieldMappings?: FieldMapping[],

  // Custom merge logic
  mergeStrategy?: (extracted: T, existing: T) => T,

  // Target cell to update
  targetCell: Cell<T>,
});
```

**Pros:**
- Maximum code reuse
- Enforces best practices
- Single point of maintenance

**Cons:**
- Less flexible
- Complex configuration
- May not handle edge cases

## Recommended Approach: Hybrid (B + Utilities)

Given the framework constraints and the variety of use cases, I recommend:

### Phase 1: Enhanced Utilities
Expand diff-utils.ts into a more complete utility library:

```typescript
// utils/import-utils.ts

// Create a triggered extraction that avoids reactive storms
export function createTriggeredExtraction<T>(config: {
  schema: JSONSchema;
  systemPrompt: string;
}) {
  // Returns a pattern-safe structure for triggered LLM extraction
}

// Analyze overlap between extracted and existing items
export function analyzeItemOverlap<T>(config: {
  extracted: T[];
  existing: T[];
  getKey: (item: T) => string;
  fuzzyMatch?: (a: T, b: T) => boolean;
}) {
  // Returns { newItems, overlapping, conflicts }
}

// Create selection state manager for per-item review
export function createSelectionManager<T>(config: {
  items: T[];
  getKey: (item: T) => string;
  defaultSelected?: boolean;
}) {
  // Returns { selectedKeys, toggle, selectAll, selectNone, getSelected }
}
```

### Phase 2: Review UI Components
Create reusable JSX components (not patterns) for review UI:

```typescript
// components/DiffField.tsx - Renders a single field diff
// components/ReviewModal.tsx - Modal wrapper for review flows
// components/ItemCheckbox.tsx - Checkbox with fuzzy-match indicator
```

### Phase 3: Optional Pattern Composition
For patterns that need the full flow, create composable sub-patterns:
- ImportSource (handles text input + file upload + trigger)
- ReviewPanel (displays pending/result with selection UI)

## Key Performance Considerations

### Trigger Pattern (Avoid Reactive Storms)

**Problem:** If LLM prompt directly references a text input cell, any keystroke triggers re-extraction.

**Solution:** Use a separate trigger cell with timestamp:
```typescript
const extractTrigger = Cell.of("");

// In handler (not reactive):
extractTrigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);

// LLM only re-runs when trigger changes:
generateObject({ prompt: extractTrigger, ... });
```

### Selection State Pattern

**Problem:** Checkbox state for N items across M photos = O(N*M) cells if done naively.

**Solution:** Single cell with Record structure:
```typescript
const selectedItems = Cell.of<Record<string, string[]>>({});

// Key: "${photoId}-${aisleId}", Value: selected item names
```

### Map Over LLM Results Pattern

**Problem:** `.map()` inside derive/computed over LLM results can cause issues.

**Solution:** Compute derived structures outside JSX, use pre-computed JSX elements:
```typescript
const processedExtractions = computed(() => {
  return extractions.map(e => ({
    ...e,
    validAisles: e.aisles.filter(a => a && a.name),
    conflictCount: ...
  }));
});
```

## Implementation Plan

### Milestone 1: Consolidate Utilities
1. Review existing diff-utils.ts
2. Extract analyzeOverlap from store-mapper.tsx
3. Create import-utils.ts with common extraction patterns
4. Add comprehensive JSDoc with examples

### Milestone 2: Refactor person.tsx
1. Use new utilities
2. Document the pattern
3. Verify no regressions

### Milestone 3: Refactor food-recipe.tsx
1. Same as person.tsx
2. Handle array fields

### Milestone 4: Refactor store-mapper.tsx
1. Extract selection manager utility
2. Use shared overlap analysis
3. Maintain per-item selection UX

### Milestone 5: Documentation
1. Add to community-docs
2. Create example pattern showing the flow
3. Document performance pitfalls

## Open Questions

1. **Should review modal be extracted as a pattern?**
   - Pro: Maximum reuse
   - Con: Pattern composition complexity, handler streams

2. **How to handle different merge strategies?**
   - Field-level replace vs array merge vs nested object merge
   - May need strategy pattern

3. **Should selection state be per-pattern or composable?**
   - Current: Per-pattern Cell
   - Alternative: Shared utility that manages the cell

4. **Image vs text extraction - unified or separate?**
   - Text: Simple string prompt
   - Image: Array with image data + text prompt
   - May need different utilities

## Current Status

- [x] Research existing patterns
- [x] Study framework constraints
- [x] Identify common abstractions
- [x] Agent critiques completed (4 specialized agents)
- [x] Architecture clarification (Single-Call vs Agent Loop)
- [ ] Design utility API
- [ ] Implement import-utils.ts
- [ ] Refactor person.tsx
- [ ] Refactor food-recipe.tsx
- [ ] Refactor store-mapper.tsx
- [ ] Documentation

## Final Design Decision Summary

**Architecture**: **Cell-Only for Single-Charm Import/Review**

The design research concluded that:

1. **YAGNI applies** - Only 3 patterns use this flow; abstraction cost exceeds benefit
2. **Gmail agent patterns don't apply** - They solve different problems (multi-step autonomous LLM vs single-shot extraction + user review)
3. **Cells are sufficient** - No need for Streams or Signal pattern for basic import/review
4. **Fix bugs first** - Performance issues and UX gaps in existing patterns should be addressed before abstraction

**Recommended Implementation Priority:**

| Priority | Task | Effort |
|----------|------|--------|
| HIGH | Fix error handling (infinite spinner on failure) | 1h |
| HIGH | Fix duplicate computed() in store-mapper.tsx | 30m |
| HIGH | Move analyzeOverlap() out of render loop | 30m |
| MEDIUM | Add per-field selection to person.tsx | 2h |
| MEDIUM | Add `triggerExtraction()` helper to diff-utils.ts | 15m |
| MEDIUM | Document trigger pattern with JSDoc | 1h |
| LOW | Add undo capability | 2h |
| SKIP | Pattern abstractions, component libraries, factory functions |

## Agent Critiques (2024-12-16)

Four specialized agents reviewed this design. Key findings below.

---

### Critique 1: Framework Constraints (CRITICAL ISSUES)

**Issue 1: Utilities Cannot Wrap generateObject** ❌
The proposed `createTriggeredExtraction()` utility CANNOT call `generateObject` - that must remain in the pattern body. Utilities can only return *configuration*, not wrapped extraction.

**Fix:** Change API to return config, not wrapped calls:
```typescript
// ❌ WRONG - Can't wrap generateObject
export function createTriggeredExtraction<T>(...) {
  return generateObject({ ... }); // FAILS - not in pattern body
}

// ✅ CORRECT - Return configuration only
export function createExtractionConfig<T>(config) {
  return {
    trigger: Cell.of<string>(""),
    schema: config.schema,
    system: config.systemPrompt,
  };
}
// Pattern body still calls: generateObject({ prompt: config.trigger, ... })
```

**Issue 2: Render Callbacks Hit Opaque Ref Scoping** ❌
The `renderItem: (item: T) => JSX.Element` callback in ReviewList won't work - items in `.map()` are opaque refs that can't be passed to arbitrary functions.

**Fix:** Return data instead of using render callbacks:
```typescript
// ❌ WRONG - Opaque ref scoping breaks this
renderItem: (item: T, isNew: boolean) => JSX.Element

// ✅ CORRECT - Return data, parent renders
interface ReviewListOutput<T> {
  processedItems: Array<{ item: T; isNew: boolean; isConflict: boolean }>;
  // Parent maps over processedItems in its own JSX
}
```

**Issue 3: Pattern Composition Needs Explicit Cell<> Passing**
For sub-patterns to mutate parent state, parent must pass `Cell<T>` references explicitly. Design should document this requirement.

**Verified Correct:**
- ✅ Trigger pattern prevents reactive storms
- ✅ Selection state Record pattern is efficient
- ✅ Stream-based events (onAccept: Stream<void>) avoid ReadOnlyAddressError

---

### Critique 2: UX Consistency (SIGNIFICANT GAPS)

**Missing Review Mode: Per-Field Selection**
Current person.tsx does field diff *display* but only *all-or-nothing acceptance*. Users should be able to accept email but reject phone.

**Recommended Mode Taxonomy:**
```
Selection Granularity (orthogonal to diff display):
├── All-or-Nothing: Accept all or reject all
├── Per-Item: Checkboxes per row
├── Per-Field: Checkboxes per field  ← MISSING
└── Hybrid: Per-item + edit before accept
```

**Critical UX Issues to Fix BEFORE Abstracting:**
1. person.tsx: Add per-field selection checkboxes
2. person.tsx: Make review fields editable (not just display)
3. store-mapper.tsx: Add merge confirmation feedback (toast + scroll)
4. Both: Add undo capability (5s toast with undo button)
5. Both: Standardize color semantics (green=new, yellow=conflict, red=destructive)
6. store-mapper.tsx: Increase touch targets to 44px minimum (accessibility)

**Error/Loading/Empty States NOT Addressed:**
- LLM failure: Need error toast + retry button
- Timeout: Need 30s timeout + retry
- No changes detected: Friendly message instead of empty modal
- Partial extraction: Warning badge "3 of 5 extracted"

**Mobile Issues:**
- person.tsx modal fixed at 600px (overflows on phones)
- Checkbox touch targets too small (10px font = ~20px target)

---

### Critique 3: YAGNI - Simpler Alternative

**Core Argument:** The ~60-100 lines of "duplication" is mostly pattern-specific variation, not true duplication:
- 30% = Diff logic → Already in diff-utils.ts ✅
- 40% = Pattern-specific UI decisions → Should NOT be abstracted
- 30% = JSX boilerplate → Cost of abstraction > benefit

**Recommended Minimal Approach:**
1. Add ONE helper function (5 lines):
```typescript
export function triggerExtraction(content: string, cell: Cell<string>): void {
  cell.set(`${content}\n---EXTRACT-${Date.now()}---`);
}
```

2. Add comprehensive JSDoc documentation to diff-utils.ts (~50 lines of comments)

3. Add cross-references between patterns

4. **SKIP:** Pattern abstractions, component libraries, factory functions

**When to Reconsider Full Abstraction:**
- 5+ patterns using the flow
- Found a bug that required fixing in 3+ places
- Someone new keeps getting the trigger pattern wrong

---

### Critique 4: Performance Analysis

**Verified Correct:**
- ✅ Trigger pattern prevents reactive storms
- ✅ Selection Record pattern is O(1) updates, ~12KB for 50 photos
- ✅ Framework caching works with `.map()` over photos

**Performance Issues Found:**

**Issue 1: Duplicate computed() Work** (store-mapper.tsx lines 792-865)
Both `totalNonConflictingAisles` and `batchAllPhotosData` iterate all photos and check conflicts independently.
- **Fix:** Combine into single computed() returning `{ totalCount, aislesToAdd }`
- **Savings:** 50% reduction in conflict-checking

**Issue 2: analyzeOverlap() in Render Loop** (line 2872)
Called inside `.map()` in JSX - runs O(P·a·n·i·j) = 225,000 ops with 50 photos.
- **Fix:** Move to computed() outside JSX, cache results
- **Benefit:** Only recomputes when photos/aisles change

**Issue 3: Photo Memory Leak** (lines 692-695)
Hidden photos stay in `uploadedPhotos` array indefinitely (workaround for reactive storm).
- **Fix:** Schedule actual removal 5 minutes after hide
- **Benefit:** Prevents OOM with 100+ photos

**Scale Limits (50 photos):**
- Initial render: ~200ms (acceptable but noticeable)
- Adding one aisle: ~50-100ms lag (from triple recomputation)
- Memory: ~250MB for photo data (browser-dependent)

---

## Revised Recommendation

Based on agent critiques, the recommendation shifts from **Hybrid (B + Utilities)** to:

### Option A-Enhanced: Minimal Utilities + Documentation

**Phase 1: Fix Critical Issues (Do First)**
1. Fix duplicate computed() in store-mapper.tsx
2. Move analyzeOverlap() out of render loop
3. Add per-field selection to person.tsx (UX)
4. Add undo capability to both patterns (UX)

**Phase 2: Minimal Utility Additions**
1. Add `triggerExtraction()` helper (5 lines)
2. Enhance diff-utils.ts JSDoc with full pattern documentation
3. Document pitfalls: opaque refs, generateObject location, render callbacks

**Phase 3: Skip (YAGNI)**
- Skip pattern abstractions
- Skip component libraries
- Skip factory functions

**Reconsider Abstraction When:**
- 5+ patterns use the flow
- Bug required fixing in 3+ places
- Pattern-specific logic converges

---

## Architecture Clarification: Single-Call vs Agent Loop (2024-12-16)

**IMPORTANT DISTINCTION**: The import/review flow is fundamentally different from gmail agent patterns.

### Two Different Architectures

| Aspect | Import/Review Flow | Gmail Agent Pattern |
|--------|-------------------|---------------------|
| LLM calls | **Single call** then user reviews | **Continuous loop** driven by agentic LLM |
| User role | Reviews/approves after extraction | Provides initial query, watches agent work |
| UI state | User interacts with selection checkboxes | Mostly display-only, agent does actions |
| Data flow | Trigger → LLM → Review UI → User accepts | Query → Agent loop → Auto-save results |
| Persistence | User explicitly commits changes | Agent auto-saves via `listTool()` |
| Example | person.tsx, store-mapper.tsx | hotel-membership-gmail-agent.tsx |

### Why Gmail Agent Research Doesn't Apply

The gmail agent patterns (e.g., `hotel-membership-gmail-agent.tsx`) use:
- **Agent loop**: LLM continuously runs, calling tools, updating state
- **Auto-save**: Uses `listTool()` to immediately persist extracted data
- **Signal pattern**: Coordinates between base pattern and agent sub-pattern
- **No user review**: Append-only data model doesn't require user approval

These mechanisms solve different problems:
- Agent patterns: "How do I coordinate multi-step autonomous LLM work?"
- Import/review patterns: "How do I let users review single-shot LLM extraction?"

### Architecture for Import/Review Flow

**Use Cells Only** (no Streams needed for single-charm import/review):

```
User Input → Trigger Cell → generateObject() → Result Cell → Review UI → Target Cell
     ↑                                              ↓
     └────────────── Selection State Cell ──────────┘
```

**Key Components:**
1. **Trigger Cell** (`Cell.of<string>("")`) - Snapshot of input with timestamp
2. **Result** - Reactive output from `generateObject()` (pending/result/error)
3. **Selection State Cell** - Tracks user selections during review
4. **Target Cell** - Final destination for accepted changes

**When to Consider Streams:**
- Cross-charm communication (user accepts in one charm, affects another)
- Optional event callbacks (onAccept, onCancel for parent patterns)
- NOT needed for basic single-charm import/review flow

---

## Hybrid Architecture: Cells AND Streams (When Needed)

For patterns that DO need cross-charm coordination or are composed from sub-patterns:

**Key Principles:**
1. **Cells hold STATE** - Extraction results, selection state, UI data
2. **Streams signal EVENTS** - Cross-charm actions, confirmations
3. **Signal Pattern** - Cell<number> increment for cross-pattern coordination

**Decision Framework:**
```
UI displays it?               → Cell
User edits it?                → Cell
Persists between sessions?    → Cell
Cross-charm communication?    → Stream
One-time event notification?  → Stream
Coordinate composed patterns? → Signal (Cell<number>)
```

**Implementation Impact for Import/Review:**
- Continue using Cells for all state (extraction results, selections, pending state)
- Add Streams only if splitting across charms (unlikely for this flow)
- Keep trigger pattern (Cell with timestamp) for LLM calls
- Signal pattern is overkill for single-charm import/review

---

## Session Notes

_Use this section for session-specific notes during implementation._
