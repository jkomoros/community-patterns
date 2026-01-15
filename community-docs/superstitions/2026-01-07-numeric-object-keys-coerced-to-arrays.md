---
topic: reactivity
discovered: 2026-01-07
sessions: [extract-notes-cleanup]
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
status: superstition
---

# Objects with Numeric Keys Are Coerced to Arrays, Losing Data

## Problem

When storing a `Record<number, T>` (object with numeric keys) in a CommonTools Cell, the Cell runtime coerces objects with numeric keys into arrays, resulting in **complete data loss**.

**Example error behavior:**
```typescript
// Setting this:
const map: Record<number, string> = { 0: "content", 1: "more content" };
cell.set(map);

// Results in getting back:
cell.get(); // Returns [] (empty array) instead of { 0: "content", 1: "more content" }
```

The data is silently lost - no error is thrown.

## Root Cause (Hypothesis)

JavaScript objects with numeric keys are structurally indistinguishable from sparse arrays at runtime. The Cell serialization/storage layer interprets `{0: "value", 1: "other"}` as an array representation.

When `JSON.stringify()` or the Cell serializer encounters an object where all keys are numeric strings, it may treat it as array-like. During deserialization, this becomes an actual empty or sparse array.

## Solution That Seemed To Work

Use `Record<string, T>` with explicit string keys instead of numeric keys:

```typescript
// WRONG - numeric keys get coerced to array
const map: Record<number, string> = {};
map[index] = content;  // index is a number
cell.set(map);
// cell.get() returns [] - data lost!

// CORRECT - string keys preserve object structure
const map: Record<string, string> = {};
map[String(index)] = content;  // Convert index to string: "0", "1", etc.
cell.set(map);
// cell.get() returns {"0": "content"} - data preserved!
```

## Example

```typescript
// Context: Storing a snapshot map indexed by module position

// Before (data lost)
interface ExtractorState {
  notesContentSnapshot: Record<number, string>;  // DON'T DO THIS
}

// In handler:
const snapshots: Record<number, string> = {};
snapshots[moduleIndex] = content;  // moduleIndex is number
snapshotCell.set(snapshots);
// Later: snapshotCell.get() === [] ... all data gone!

// After (works correctly)
interface ExtractorState {
  notesContentSnapshot: Record<string, string>;  // String keys
}

// In handler:
const snapshots: Record<string, string> = {};
snapshots[String(moduleIndex)] = content;  // Explicit string conversion
snapshotCell.set(snapshots);
// Later: snapshotCell.get() === {"0": "content"} ... preserved!
```

## Debug Evidence

```
[Extract] Setting notesSnapshots: {"0":"John Smith..."} type: object isArray: false
[Extract] Read back after set: [] type: object isArray: true
```

The value was set as an object but immediately read back as an array.

## Context

- Pattern: `extractor-module.tsx` (Record pattern extraction)
- Attempting to store Notes content snapshots indexed by subCharm array position
- Data was being set correctly but read back as empty array
- No errors thrown, silent data loss
- Fix confirmed working after switching to string keys

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` (no mention of this issue)
- **Related superstitions:**
  - `2025-11-29-cells-must-be-json-serializable.md` (Set/Map serialization issues)
  - `2025-12-04-maps-dont-serialize-in-framework.md` (Map serialization)

## Next Steps

- [ ] Verify against official docs and runtime code
- [ ] Test with various numeric key patterns (sparse, sequential, negative)
- [ ] If confirmed, upstream to labs docs
- [ ] Then delete this superstition

## Guestbook

- 2026-01-07 - Discovered while implementing Notes cleanup in extractor-module.tsx. Using `Record<number, string>` for `notesContentSnapshot` caused all snapshot data to be lost after Cell.set(). Switching to `Record<string, string>` with explicit `String(index)` conversion fixed the issue. (extract-notes-cleanup session)
