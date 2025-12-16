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
- [ ] Design utility API
- [ ] Implement import-utils.ts
- [ ] Refactor person.tsx
- [ ] Refactor food-recipe.tsx
- [ ] Refactor store-mapper.tsx
- [ ] Documentation

## Session Notes

_Use this section for session-specific notes during implementation._
