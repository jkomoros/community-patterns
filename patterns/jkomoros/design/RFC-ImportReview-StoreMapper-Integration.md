# RFC: ImportReview Extension for Full Store-Mapper Feature Support

**Author:** jkomoros
**Date:** 2025-12-18
**Status:** Planned (not yet implemented)
**Branch:** feature/import-review-pattern

---

## Summary

Extend ImportReview sub-pattern to idiomatically support all store-mapper features, enabling store-mapper to migrate ~300 lines of custom extraction/merge logic to the reusable ImportReview pattern.

**Three Extensions Required:**
1. **Multi-Trigger Mode** - Parallel extractions from N sources (photos)
2. **Custom Matching** - Fuzzy/Levenshtein matching with confidence scores
3. **Nested Array Selection** - Per-item selection within matched parents

**Scope:** ~400-500 lines of new code in import-review.tsx

---

## Background

### Current State

ImportReview (`lib/import-review.tsx`) provides:
- Single-trigger extraction via `generateObject()`
- Per-item selection (reviewPanel)
- Per-field diff selection (fieldDiffPanel)
- ID-based merge mode with field-level selection (mergeDiffPanel)
- `showUnmatchedItems` for new items (implemented 2025-12-18)

Store-mapper (`store-mapper.tsx`) has custom implementation for:
- Multi-photo extraction (~70 lines)
- Levenshtein fuzzy matching (~60 lines)
- Per-product checkbox selection (~90 lines)
- Batch operations across photos (~80 lines)

### Why Integrate?

| Benefit | Description |
|---------|-------------|
| Code reduction | ~300 lines moved from store-mapper to reusable pattern |
| Consistency | Same UX patterns across extraction flows |
| Maintainability | Bug fixes in ImportReview benefit all consumers |
| Reusability | Other patterns can use fuzzy matching, multi-source extraction |

### Why It's Non-Trivial

| Store-Mapper Feature | ImportReview Gap |
|---------------------|------------------|
| N photo triggers | Single trigger only |
| Levenshtein matching | Exact ID match only |
| Per-product checkboxes | Per-field checkboxes only |
| Photo → Aisle → Product hierarchy | Flat item list |
| Batch "add all from photo" | No batch operations |

---

## Extension 1: Multi-Trigger Mode

### Problem
ImportReview has one `trigger` Cell. Store-mapper needs N parallel extractions (one per uploaded photo).

### Proposed API

```typescript
interface ImportReviewInput<T> {
  // EXISTING: Single trigger (backwards compatible)
  trigger?: Cell<string>;

  // NEW: Multi-source triggers
  sources?: Cell<SourceData[]>;
  sourcePromptBuilder?: (source: SourceData, index: number) => PromptContent;
  getSourceKey?: (source: SourceData) => string;
  getSourceLabel?: (source: SourceData) => string;
  hiddenSourceIds?: Cell<string[]>;
}
```

### New Outputs

```typescript
interface MultiTriggerOutput<T> {
  isMultiTriggerMode: boolean;

  // Per-source states
  sourceExtractions: Array<{
    sourceKey: string;
    sourceLabel: string;
    pending: boolean;
    error: unknown;
    items: ProcessedItem<T>[];
  }>;

  // Aggregated states
  anyPending: boolean;
  allPending: boolean;
  pendingCount: number;
  completedCount: number;

  // Per-source handlers
  hideSource: (sourceKey: string) => void;
  selectAllInSource: (sourceKey: string) => void;

  // UI components
  ui: {
    sourceList: JSX.Element;
    perSourceReviewPanel: JSX.Element;
  };
}
```

### Implementation Pattern

```typescript
// Use .map() pattern for parallel extraction (proven in store-mapper)
const sourceExtractions = sources.map((source, index) => {
  const extraction = generateObject({
    system: systemPrompt,
    prompt: derive(source, (s) => sourcePromptBuilder(s, index)),
    schema: effectiveSchema,
  });

  return {
    source,
    sourceKey: getSourceKey(source),
    sourceLabel: getSourceLabel(source),
    result: extraction.result,
    pending: extraction.pending,
    error: extraction.error,
  };
});
```

### Key Design Decisions

1. **`.map()` over sources** - Framework handles parallelization, caching
2. **Soft-delete for hiding** - Use `hiddenSourceIds` filter, not array splice
3. **Two-level aggregation** - Per-source for UI, aggregated for batch ops
4. **Auto-detection** - Mode determined by which inputs provided

---

## Extension 2: Custom Matching Logic

### Problem
ImportReview uses exact string ID matching. Store-mapper needs Levenshtein fuzzy matching.

### Proposed API

```typescript
interface MergeFieldMapping {
  // EXISTING
  idField: string;

  // NEW: Custom matcher (overrides idField when provided)
  matchItem?: MatchItemFn;
  matchThreshold?: number;  // 0.0-1.0, default 0.0
}

type MatchItemFn = (
  extractedItem: unknown,
  existingItems: readonly unknown[],
  options: { unwrapItem: (item: unknown) => Record<string, unknown> }
) => MatchResult | null;

interface MatchResult {
  existingItem: unknown;
  confidence: number;       // 0.0-1.0
  matchType: 'exact' | 'fuzzy';
}
```

### Extended ProcessedMergeItem

```typescript
interface ProcessedMergeItem {
  // EXISTING
  id: string;
  label: string;
  fieldDiffs: ProcessedMergeFieldDiff[];

  // NEW
  matchConfidence: number;
  matchType: 'exact' | 'fuzzy';
}
```

### UI Enhancement

```tsx
// Show confidence badge for fuzzy matches
{mergeItem.matchType === 'fuzzy' && (
  <span style={{
    fontSize: "11px",
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: mergeItem.matchConfidence > 0.8 ? "#d1fae5" : "#fef3c7",
    color: mergeItem.matchConfidence > 0.8 ? "#065f46" : "#92400e"
  }}>
    {Math.round(mergeItem.matchConfidence * 100)}% match
  </span>
)}
```

### Exported Utility Functions

```typescript
// Export from import-review.tsx for reuse
export function normalizeString(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function levenshteinDistance(a: string, b: string): number {
  // Standard dynamic programming implementation
}

export function createFuzzyStringMatcher(
  fieldName: string,
  options?: {
    exactBonus?: number;      // default 1.0
    substringBonus?: number;  // default 0.8
    fuzzyThreshold?: number;  // default 0.1 (10% edit distance)
  }
): MatchItemFn;
```

### Key Design Decisions

1. **Function option** - Most flexible, user implements any logic
2. **Confidence score** - Enables threshold-based unmatched detection
3. **Match type metadata** - UI can show exact vs fuzzy differently
4. **Utility exports** - ImportReview becomes one-stop-shop for extraction+matching

---

## Extension 3: Nested Array Selection (Per-Item)

### Problem
ImportReview selects fields within matched items. Store-mapper selects items within arrays.

### Proposed API

```typescript
interface MergeFieldMapping {
  // EXISTING
  mergeFields: MergeField[];

  // NEW: Per-item selection for nested arrays
  nestedArrayFields?: NestedArrayField[];
}

interface NestedArrayField {
  key: string;                              // Array field (e.g., "products")
  label: string;                            // Display label
  getItemLabel?: (item: unknown) => string;
  getItemKey?: (item: unknown) => string;
  fuzzyMatch?: (a: unknown, b: unknown) => boolean;
  existingArrayGetter?: (parentItem: unknown) => unknown[];
}
```

### Selection State

```typescript
// Record-based for O(1) lookup per parent
// Key: "parentItemId:nestedFieldKey"
// Value: array of selected nested item keys (null = all selected)
const selectedNestedItems = cell<Record<string, string[] | null>>({});
```

### New Outputs

```typescript
interface NestedArrayOutput {
  nestedArrayDiffs: ProcessedNestedArrayDiff[];

  toggleNestedItemSelection: (parentId: string, fieldKey: string, itemKey: string) => void;
  selectAllNestedItems: (parentId: string, fieldKey: string) => void;
  selectNoNestedItems: (parentId: string, fieldKey: string) => void;

  ui: {
    nestedItemsPanel: JSX.Element;
  };
}

interface ProcessedNestedArrayDiff {
  parentId: string;
  fieldKey: string;
  fieldLabel: string;
  existingItems: unknown[];
  newItems: NestedItemDiff[];
  overlappingItems: OverlapPair[];
}

interface NestedItemDiff {
  item: unknown;
  key: string;
  label: string;
  selected: boolean;
  isDuplicate: boolean;
  duplicateOf?: unknown;
}
```

### Extended getSelectedMergeValues()

```typescript
// Now includes nested array selections
[
  {
    id: "aisle-5",
    description: "Updated description",     // Scalar field
    products: ["Oranges", "Strawberries"],  // Only selected nested items
  }
]
```

### Key Design Decisions

1. **Record-based state** - Proven pattern from store-mapper
2. **Default all selected** - `null` means "all", explicit array means filtered
3. **Separate UI component** - `nestedItemsPanel` alongside `mergeDiffPanel`
4. **Overlap detection** - Via `fuzzyMatch` function option

---

## Store-Mapper Integration Example

```typescript
const extraction = ImportReview({
  // Multi-trigger: one extraction per photo
  sources: uploadedPhotos,
  sourcePromptBuilder: (photo, i) => ({
    role: "user",
    content: [{ type: "image", image: photo.data }],
  }),
  getSourceKey: (photo) => photo.name,
  getSourceLabel: (photo) => `Photo: ${photo.name}`,
  hiddenSourceIds: hiddenPhotoIds,

  schema: AisleExtractionSchema,

  mergeFieldMappings: [{
    key: "aisles",
    label: "Store Aisles",
    idField: "name",
    existingItems: aisles,

    // Custom fuzzy matching
    matchItem: createFuzzyStringMatcher("name", { fuzzyThreshold: 0.1 }),
    matchThreshold: 0.5,

    // Per-product selection
    nestedArrayFields: [{
      key: "products",
      label: "Products to add",
      getItemKey: (p) => normalizeString(p),
      fuzzyMatch: (a, b) => levenshteinDistance(a, b) <= 2,
      existingArrayGetter: (aisle) => parseProducts(aisle.description),
    }],

    showUnmatchedItems: true,
  }],
});

// Use in UI
{extraction.ui.perSourceReviewPanel}
{extraction.ui.mergeDiffPanel}
{extraction.ui.nestedItemsPanel}
{extraction.ui.unmatchedItemsPanel}
```

---

## Implementation Phases

### Phase 1: Custom Matching (~100 lines, ~2-3 hours)
1. Add `matchItem` and `matchThreshold` to MergeFieldMapping interface
2. Update matching logic in `processedMergeItems` computed
3. Add `matchConfidence` and `matchType` to ProcessedMergeItem
4. Update mergeDiffPanel UI with confidence badges
5. Export utility functions (normalizeString, levenshteinDistance, createFuzzyStringMatcher)

**Test:** Verify food-recipe.tsx still works (backwards compatibility)

### Phase 2: Nested Array Selection (~150 lines, ~3-4 hours)
1. Add `NestedArrayField` interface
2. Add `selectedNestedItems` Cell and handlers
3. Implement `nestedArrayDiffs` computed with overlap detection
4. Add `nestedItemsPanel` UI component
5. Extend `getSelectedMergeValues()` to include nested array selections

**Test:** Create test pattern with nested array merge

### Phase 3: Multi-Trigger Mode (~200 lines, ~4-5 hours)
1. Add `sources` input with mutual exclusivity validation
2. Implement `.map()` pattern for parallel extraction
3. Add aggregated state computeds (anyPending, completedCount, etc.)
4. Add per-source handlers (hideSource, selectAllInSource)
5. Add `sourceList` and `perSourceReviewPanel` UI components

**Test:** Create test pattern with multiple image sources

### Phase 4: Store-Mapper Migration (~3-4 hours)
1. Replace custom matching logic with ImportReview matchItem
2. Replace per-product selection UI with nestedItemsPanel
3. Replace batch operation handlers with ImportReview equivalents
4. Keep photo upload UI (ImportReview doesn't handle file uploads)
5. Verify all existing functionality works

**Test:** Full regression test of store-mapper

---

## Files to Modify

| File | Changes | Estimated Lines |
|------|---------|-----------------|
| `lib/import-review.tsx` | All three extensions | +400-500 |
| `store-mapper.tsx` | Migrate to ImportReview | -200-300 (net) |
| `test-import-review-fields.tsx` | Add nested array test | +50 |

---

## Backwards Compatibility

All changes are **strictly additive**:

| Feature | Without new option | With new option |
|---------|-------------------|-----------------|
| Trigger model | Single trigger works | Multi-source if `sources` provided |
| Matching | Exact idField match | Custom if `matchItem` provided |
| Selection | Per-field selection | Per-nested-item if `nestedArrayFields` provided |

**Existing patterns require NO changes:**
- food-recipe.tsx (merge mode) ✅
- test-import-review-fields.tsx (field diff mode) ✅
- Any pattern using basic extraction ✅

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OpaqueRef issues in nested .map() | High | High | Pre-compute JSX in computed(), avoid callbacks in render |
| Selection state complexity | Medium | Medium | Use proven Record pattern from store-mapper |
| Breaking existing merge mode | Low | High | Extensive testing with food-recipe.tsx |
| Performance with many sources | Low | Medium | Framework handles caching per-source |

---

## Open Questions

1. **Batch operations** - Should ImportReview provide "add all non-conflicting" helpers, or leave to parent?
2. **Source aggregation** - Should items from multiple sources be deduped, or shown per-source?
3. **Error handling** - If one source errors, should others continue? (Current: yes)

---

## References

- `lib/import-review.tsx` - Current implementation (~2,100 lines)
- `store-mapper.tsx` - Reference for multi-photo, fuzzy matching, per-product selection
- `food-recipe.tsx` - Reference for merge mode integration
- `community-docs/superstitions/2025-12-18-derive-subpattern-map-footgun.md` - OpaqueRef warning
- `issues/ISSUE-subpattern-map-typeregistry.md` - TypeRegistry gap documentation
