# Map Implementation: Index-Based vs Element-Based Identity Tracking

## Problem

The current `map()` implementation in `packages/runner/src/builtins/map.ts` uses **index-based identity** for result cells, not **element-based identity**. This causes result cells to be disconnected and recomputed when array elements shift positions.

## Current Behavior

When mapping over an array, result cells are created with identity:
```typescript
const resultCell = runtime.getCell(
  parentCell.space,
  { result, index: initializedUpTo },  // ← Uses INDEX as identity
  undefined,
  tx,
);
```

This means:
- Result cell at index 0 → connected to element at index 0
- Result cell at index 1 → connected to element at index 1
- Result cell at index 2 → connected to element at index 2

## The Issue

When an array element is removed, remaining elements shift positions:

**Before deletion:** `[Photo A, Photo B, Photo C]`
- Index 0: Photo A → Result Cell 0 (extraction state for A)
- Index 1: Photo B → Result Cell 1 (extraction state for B)
- Index 2: Photo C → Result Cell 2 (extraction state for C)

**After deleting Photo B:** `[Photo A, Photo C]`
- Index 0: Photo A → Result Cell 0 (still has A's state ✓)
- Index 1: Photo C → Result Cell 1 (had B's state, now recomputes for C ✗)

Photo C moved from index 2 to index 1, so it's now connected to Result Cell 1 (which was for Photo B). This triggers full re-computation of the map operation for Photo C, even though Photo C itself hasn't changed.

## Real-World Impact

**Use Case:** Store mapper with photo analysis
- User uploads 3 photos of grocery store aisles
- AI analyzes each photo (expensive operation, takes 5-10 seconds per photo)
- User clicks "Add All" on one photo to import its aisles
- The handler deletes that photo from the array with `.toSpliced()`
- **Bug:** Other photos reset to "Analyzing..." state because they shifted positions

The analysis results are lost even though those photos themselves are unchanged.

## Evidence of Prior Consideration

Lines 163-169 in `map.ts` contain commented-out code suggesting element-based tracking was considered:

```typescript
// NOTE: We leave prior results in the list for now, so they reuse prior
// runs when items reappear
//
// Remove values that are no longer in the input sourceRefToResult =
//   sourceRefToResult.filter(({ ref }) => seen.find((seenValue) =>
//     isEqualCellReferences(seenValue, ref))
//);
```

This suggests there was an intention to track by element reference, not just index.

## Proposed Solution

Use element identity (via `[ID]` symbol or Cell reference) instead of index for result cell identity:

```typescript
// Instead of:
{ result, index: initializedUpTo }

// Use element identity:
{ result, element: elementCell.entityId }
// or
{ result, element: elementCell[ID] }
```

This would allow result cells to stay connected to their input elements even when array positions change.

## Current Workaround

The workaround is to avoid physically removing elements from arrays. Instead:
1. Add a `hidden: boolean` field to array elements
2. Mark items as hidden instead of splicing them
3. Filter out hidden items during rendering

This preserves indices and prevents unnecessary re-computation, but it's not intuitive and requires extra bookkeeping.

## Questions

1. Is index-based identity a fundamental architectural requirement, or can it be changed to element-based?
2. If element-based tracking is possible, should it use `[ID]` symbol, Cell identity, or something else?
3. Are there other built-in operations (filter, sort, etc.) that have similar issues?
4. Would element-based tracking have performance implications for large arrays?

## Related Code

- `packages/runner/src/builtins/map.ts` lines 115-120 (result cell creation)
- `packages/runner/src/builtins/map.ts` lines 163-169 (commented tracking code)
- `packages/runner/src/cell.ts` lines 1270-1280 (automatic [ID] assignment)
- `packages/patterns/list-operations.tsx` (demonstrates [ID] usage for stable refs)
