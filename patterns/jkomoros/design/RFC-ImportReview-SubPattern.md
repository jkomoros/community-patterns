# RFC: Composable Import/Review Sub-Pattern

**Author:** @jkomoros (with Claude)
**Status:** Draft - Seeking Framework Author Review
**Date:** 2024-12-16

## Summary

Propose creating a **composable sub-pattern** called `ImportReview` that encapsulates the common "extract → review → commit" flow used across multiple patterns. This RFC seeks framework author feedback on whether the proposed architecture is idiomatic before implementation.

## Problem

Multiple patterns share a common flow:

1. User provides free-form text or uploads a file (image, PDF)
2. LLM extracts structured data via `generateObject()`
3. User reviews extracted items with selection checkboxes
4. User commits selected items to target data

This flow is currently implemented 3+ times with ~200-400 lines each:
- `person.tsx` - Extract profile fields from notes
- `food-recipe.tsx` - Extract recipe data from notes/images
- `store-mapper.tsx` - Extract aisles from photos

The implementations are finicky and prone to:
- **Reactive storms** - Naive LLM prompt binding triggers on every keystroke
- **Performance traps** - `computed()` inside `.map()` in JSX
- **Handler/Cell bridge confusion** - When to use handlers vs direct Cell mutation

## Proposed Solution

Create a **composable sub-pattern** following the pattern established by `chatbot.tsx`:

```typescript
export const ImportReview = pattern<ImportReviewInput<T>, ImportReviewOutput<T>>(
  ({ schema, systemPrompt, trigger, mode, existingItems, getKey, getLabel, fuzzyMatch }) => {

    // ═══════════════════════════════════════════════════════════════════
    // 1. LLM EXTRACTION (in pattern body - framework safe)
    // ═══════════════════════════════════════════════════════════════════

    const { result, pending, error } = generateObject({
      system: systemPrompt,
      prompt: trigger,  // Parent controls timing via trigger Cell
      schema,
    });

    // ═══════════════════════════════════════════════════════════════════
    // 2. PROCESS RESULTS WITH SELECTION STATE
    // ═══════════════════════════════════════════════════════════════════

    const processedItems = computed(() => {
      if (!result) return [];
      const items = Array.isArray(result) ? result : result.items ? result.items : [result];
      return items.map((item, i) => ({
        item,
        key: getKey?.(item) || `item-${i}`,
        label: getLabel?.(item) || getKey?.(item) || `Item ${i}`,
        isNew: !existingItems?.some(e => getKey(e) === getKey(item)),
        isConflict: fuzzyMatch && existingItems?.some(e => fuzzyMatch(e, item)),
        selected: Cell.of(true),  // Per-item selection state
      }));
    });

    // ═══════════════════════════════════════════════════════════════════
    // 3. SELECTION HELPERS (called from parent's commit handler)
    // ═══════════════════════════════════════════════════════════════════

    const getSelectedItems = () =>
      processedItems.filter(p => p.selected.get()).map(p => p.item);

    // ═══════════════════════════════════════════════════════════════════
    // 4. PRE-COMPOSED UI COMPONENTS (like chatbot.tsx)
    // ═══════════════════════════════════════════════════════════════════

    const itemList = (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {processedItems.map(({ key, label, isNew, isConflict, selected }) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ct-checkbox $checked={selected} />
            <span>{label}</span>
            {ifElse(isNew, <ct-tag size="sm" color="green">NEW</ct-tag>, null)}
          </label>
        ))}
      </div>
    );

    const reviewPanel = (
      <ct-card>
        <h3>Review Extracted Data</h3>
        {ifElse(pending, <ct-loader />, null)}
        {ifElse(error, <ct-alert variant="error">{error}</ct-alert>, null)}
        {itemList}
      </ct-card>
    );

    // ═══════════════════════════════════════════════════════════════════
    // 5. RETURN (state + ui.* components)
    // ═══════════════════════════════════════════════════════════════════

    return {
      pending,
      error,
      hasResults: computed(() => processedItems.length > 0),
      items: processedItems,
      getSelectedItems,
      selectAll: () => processedItems.forEach(p => p.selected.set(true)),
      selectNone: () => processedItems.forEach(p => p.selected.set(false)),
      ui: { loadingState, errorState, itemList, selectionBar, reviewPanel },
    };
  }
);
```

## Key Architecture Questions for Framework Author

### Question 1: Is sub-pattern calling generateObject() framework-safe?

Our understanding is that `generateObject()` must be called in a pattern body, not in handlers or computed(). Since sub-patterns ARE patterns, calling `generateObject()` in a sub-pattern's body should be safe.

**Proposed data flow:**
```
Parent Pattern                          ImportReview Sub-Pattern
─────────────────                      ─────────────────────────

triggerCell.set(content+timestamp) ──► generateObject({ prompt: trigger })
                                              │
                                              ▼
                                       result Cell (reactive)
                                              │
                                              ▼
                                       processedItems (computed)
                                       - isNew, isConflict flags
                                       - selection state per item
                                              │
                                              ▼
                                       ui.* components (VNodes)
                                              │
Parent reads selection ◄────────────── getSelectedItems()
Parent applies to target cells                │
Parent clears trigger ◄─────────────── (modal closes)
```

**Is this correct?**

### Question 2: Trigger pattern for controlled LLM invocation

To prevent reactive storms, we use a "trigger Cell" pattern:

```typescript
const trigger = Cell.of<string>("");

// Parent's handler (user clicks "Extract" button)
const startExtraction = handler((_, { notes, trigger }) => {
  trigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);
});

// Sub-pattern only re-runs extraction when trigger changes
const { result } = generateObject({ prompt: trigger, ... });
```

**Is this the idiomatic way to control LLM invocation timing?** Or is there a better pattern?

### Question 3: Per-item Cell for selection state

Each processed item gets its own selection Cell:

```typescript
const processedItems = computed(() => {
  return items.map(item => ({
    item,
    selected: Cell.of(true),  // New Cell per item
  }));
});

// In JSX, bidirectional binding "just works"
<ct-checkbox $checked={item.selected} />
```

**Concern:** Creating Cells inside `computed()` - is this safe? Will garbage collection work correctly when items change?

**Alternative:** Single Cell with `Record<string, boolean>` instead of per-item Cells.

### Question 4: Handler receiving sub-pattern for commit

Parent's commit handler needs to read the sub-pattern's selection state:

```typescript
// Parent pattern
const applySelected = handler((_, { extraction, aisles, trigger }) => {
  // extraction is the ImportReview sub-pattern instance
  extraction.getSelectedItems().forEach(aisle => aisles.push(aisle));
  trigger.set("");  // Clear extraction
});

// In JSX
<ct-button onClick={applySelected({ extraction, aisles, trigger })}>
  Apply Selected
</ct-button>
```

**Is passing a sub-pattern instance to a handler correct?** Or should we pass Cells explicitly?

### Question 5: Returning ui.* components (chatbot.tsx pattern)

Following chatbot.tsx, we return pre-composed UI components:

```typescript
return {
  // State
  pending,
  items: processedItems,

  // Pre-composed UI (consumers can use default or compose custom)
  ui: {
    loadingState: <ct-loader />,
    itemList: <div>{processedItems.map(...)}</div>,
    reviewPanel: <ct-card>...</ct-card>,
  },
};
```

**Is this the intended composition pattern?** We want:
- Default: `{extraction.ui.reviewPanel}`
- Custom: `{extraction.ui.itemList}` with custom buttons

### Question 6: Per-item vs per-field modes

We want to support two review modes:

1. **Per-item** (store-mapper): Select which aisles to add
2. **Per-field** (person.tsx): Select which fields to update (name, email, phone)

Should these be:
- A) Same sub-pattern with `mode: "per-item" | "per-field"` config
- B) Two separate sub-patterns
- C) Same sub-pattern with different `getKey`/`getLabel` callbacks

## Usage Example

```typescript
export default pattern(({ aisles, notes }) => {
  const trigger = Cell.of<string>("");

  // Create sub-pattern instance
  const extraction = ImportReview({
    schema: AisleSchema,
    systemPrompt: "Extract grocery aisles from notes...",
    trigger,
    mode: "per-item",
    existingItems: aisles,
    getKey: (a) => a.name.toLowerCase(),
    getLabel: (a) => `${a.name}: ${a.products?.slice(0,3).join(", ")}...`,
  });

  const startExtraction = handler((_, { notes, trigger }) => {
    trigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);
  });

  const applySelected = handler((_, { extraction, aisles, trigger }) => {
    extraction.getSelectedItems().forEach(aisle => aisles.push(aisle));
    trigger.set("");
  });

  return {
    [UI]: (
      <ct-screen>
        {ifElse(extraction.hasResults,
          // Review mode - use pre-composed UI
          <div>
            {extraction.ui.selectionBar}
            {extraction.ui.itemList}
            <ct-button onClick={applySelected({ extraction, aisles, trigger })}>
              Add Selected Aisles
            </ct-button>
          </div>,
          // Input mode
          <div>
            <ct-textarea $value={notes} />
            <ct-button onClick={startExtraction({ notes, trigger })}>Extract</ct-button>
          </div>
        )}
      </ct-screen>
    ),
  };
});
```

## Companion Component: SmartTextInput

### Problem: Multi-Source Text Input

The ImportReview pattern assumes the parent pattern provides text (via the trigger Cell). But collecting that text from multiple sources is itself error-prone:

1. **Direct typing/pasting** - Simple, just bind to a Cell
2. **Text file uploads** - Need to read file contents
3. **Image uploads with OCR** - Need LLM extraction, pending states, error handling
4. **Multiple images** - Need parallel OCR, per-image status, selection

Patterns like `store-mapper.tsx` handle multiple image uploads (up to 50 photos) with parallel OCR extraction. This is ~200 lines of boilerplate that's easy to mess up.

### Proposed Solution: SmartTextInput

A companion component that provides unified text input from multiple sources:

```typescript
interface SmartTextInputProps {
  // Required: Target text cell
  $value: Cell<string>;

  // Optional: Configuration
  placeholder?: string;
  maxImages?: number;              // Default: 50
  ocrPrompt?: string;              // Custom prompt for image text extraction
  imageResultMode?: "concatenate" | "separate";  // Default: "concatenate"
  separator?: string;              // For concatenate mode, default: "\n\n---\n\n"
  autoCommit?: boolean;            // Auto-apply OCR results
}

interface SmartTextInputOutput {
  // State
  value: Cell<string>;
  pendingOCR: boolean;
  hasUncommittedResults: boolean;

  // For separate mode (like store-mapper)
  imageResults: PerImageResult[];
  selectedCount: number;

  // Actions
  commitResults: () => void;
  selectAll: () => void;
  selectNone: () => void;

  // Pre-composed UI
  ui: {
    complete: VNode;          // Full input (drop-in usage)
    textArea: VNode;          // Individual pieces for custom layouts
    uploadButtons: VNode;
    imageResultsList: VNode;
    commitButton: VNode;
  };
}

interface PerImageResult {
  imageId: string;
  imageName: string;
  pending: boolean;
  error?: string;
  extractedText: string | null;
  selected: Cell<boolean>;
}
```

### Multi-Image Result Modes

**Concatenate mode** (simpler, default):
- All OCR results automatically join into single text block
- Good for: recipe import, document scanning

**Separate mode** (like store-mapper):
- Per-image results shown with checkboxes
- User selects which results to include
- Good for: batch photo processing where some images may fail

### Data Flow

```
User Input Sources:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Direct Typing  │  │  Text File      │  │  Image Upload   │
│  (ct-textarea)  │  │  (ct-file-input)│  │  (ct-image-input│
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         │                    │                    ▼
         │                    │           generateObject()
         │                    │           (OCR extraction)
         │                    │                    │
         ▼                    ▼                    ▼
      ┌──────────────────────────────────────────────┐
      │           Mode Handler                        │
      │  "concatenate" → append all to value         │
      │  "separate"    → show per-image selection    │
      └──────────────────────────────────────────────┘
                              │
                              ▼
                    Cell<string> $value
                              │
                              ▼
                    ImportReview.trigger
                    (for structured extraction)
```

### Usage Examples

**Simple drop-in:**
```typescript
const notes = cell<string>("");

return {
  [UI]: (
    <SmartTextInput
      $value={notes}
      placeholder="Type, paste, or upload images..."
    />
  ),
};
```

**With ImportReview integration:**
```typescript
const notes = cell<string>("");
const trigger = Cell.of<string>("");

const smartInput = SmartTextInput({ $value: notes });

const extraction = ImportReview({
  schema: PersonSchema,
  systemPrompt: "Extract profile fields...",
  trigger,
  existingItems: [profile],
  getKey: (p) => p.email,
});

const startExtraction = handler((_, { notes, trigger }) => {
  trigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);
});

return {
  [UI]: (
    <ct-vstack>
      {smartInput.ui.complete}

      <ct-button onClick={startExtraction({ notes, trigger })}>
        Extract Profile Data
      </ct-button>

      {ifElse(extraction.hasResults, extraction.ui.reviewPanel, null)}
    </ct-vstack>
  ),
};
```

**Multi-image with separate results:**
```typescript
const notes = cell<string>("");
const smartInput = SmartTextInput({
  $value: notes,
  maxImages: 10,
  imageResultMode: "separate",
  autoCommit: false,
});

return {
  [UI]: (
    <ct-vstack>
      {smartInput.ui.textArea}
      {smartInput.ui.uploadButtons}

      {/* Per-image results with checkboxes */}
      {smartInput.ui.imageResultsList}

      <ct-button
        onClick={smartInput.commitResults}
        disabled={smartInput.selectedCount === 0}
      >
        Apply {smartInput.selectedCount} Results
      </ct-button>
    </ct-vstack>
  ),
};
```

### Implementation Notes

SmartTextInput reuses proven patterns from existing code:

1. **From store-mapper.tsx**: Multi-image upload via `ct-image-input multiple`, `.map()` with `generateObject` for parallel OCR, `hiddenPhotoIds` pattern for deletion without array mutation bugs

2. **From food-recipe.tsx**: Single image OCR, "Add to Notes" confirmation flow

3. **Framework-safe**: All `generateObject()` calls in pattern body, handler pattern for mutations

### Question for Framework Author

**Question 7: Is SmartTextInput the right abstraction level?**

SmartTextInput handles text collection from multiple sources, while ImportReview handles structured extraction from that text. This separation means:

- SmartTextInput: `images/files → raw text`
- ImportReview: `raw text → schema-validated objects`

**Is this separation correct?** Or should ImportReview directly accept images/files as input sources?

## Success Criteria

If this pattern is idiomatic:

- Consumer patterns reduced from 200+ lines to ~30-50 lines
- Same abstraction works for both per-item and per-field modes
- No reactive storms (trigger pattern works)
- Commit handlers correctly bridge reactive → imperative
- UI components composable (use reviewPanel or individual parts)

## Alternatives Considered

### A. Utilities Only (Current State)

Keep `diff-utils.ts` and per-pattern implementation.

**Rejected because:** ~200 lines of boilerplate per pattern, inconsistent UX.

### B. Handler Factory Functions

```typescript
const { trigger, result } = createTriggeredExtraction(schema, systemPrompt);
```

**Rejected because:** Cannot call `generateObject()` from utility functions.

### C. Component-Only (No Sub-Pattern)

Just create reusable JSX components for review UI.

**Rejected because:** Still need extraction logic, selection state, etc.

## Request

Please review this RFC and provide feedback on:

1. Is the overall architecture idiomatic for CommonTools?
2. Are there any framework constraints we're missing?
3. Is there a simpler/better way to achieve this?
4. Any naming suggestions (`ImportReview`, `ExtractReview`, `DataExtractor`)?

We're happy to adjust the design based on your feedback before implementing.
