# Calling .set() and .get() on Same Cell Inside Computed Causes Infinite Loop

**Date**: 2025-12-19
**Severity**: Critical
**Component**: Computed, Reactivity, Side Effects

## Summary

Even with idempotency checks, calling `.set()` on a cell and then `.get()` on that same cell (or a related cell) inside a `computed()` function can cause an infinite reactive loop with 100%+ CPU usage.

## Symptoms

1. Browser becomes unresponsive (200% CPU)
2. Page crashes or never finishes loading
3. Pattern renders initially but then freezes

## Root Cause

When a computed function:
1. Reads from a cell (`.get()`) - creates a dependency
2. Writes to that cell (`.set()`) - triggers re-evaluation
3. Re-evaluation reads the cell again - creates dependency again
4. The cycle never breaks, even with idempotency guards

The idempotency check (`if (lastId !== triggerId)`) doesn't prevent the loop because the **reactive dependency is still registered** on every `.get()` call.

## Failing Pattern

```typescript
const fieldValueSnapshots = cell<Record<string, string>>({});
const lastSnapshotResultId = cell<string>("");

const fieldDiffs = computed(() => {
  // ... setup code ...

  const triggerId = trigger.get() ?? "";
  const lastId = lastSnapshotResultId.get();  // ← READ creates dependency
  const isNewExtraction = triggerId !== "" && triggerId !== lastId;

  if (isNewExtraction) {
    const snapshots = { /* ... */ };
    fieldValueSnapshots.set(snapshots);        // ← WRITE triggers re-eval
    lastSnapshotResultId.set(triggerId);       // ← WRITE triggers re-eval
  }

  const snapshots = fieldValueSnapshots.get() ?? {};  // ← READ creates dependency
  // ... use snapshots ...
});
```

**Why idempotency doesn't help:**
- First run: `isNewExtraction=true`, writes happen, dependencies registered
- Write triggers re-evaluation
- Second run: `isNewExtraction=false` (check passes!), but `.get()` still registers dependency
- System keeps re-evaluating because dependencies exist on cells that were written

## Working Patterns

### Option 1: Don't read from cells you write to

```typescript
let snapshots: Record<string, string>;
if (isNewExtraction) {
  snapshots = { /* build locally */ };
  fieldValueSnapshots.set(snapshots);  // Write only
  lastSnapshotResultId.set(triggerId);
  // Use local `snapshots` variable, don't read from cell
} else {
  snapshots = fieldValueSnapshots.get();  // Only read when NOT writing
}
```

**Problem**: This still reads from `lastSnapshotResultId` to check `isNewExtraction`, creating a dependency on a cell we write to.

### Option 2: Move side effects outside computed entirely

Use `listen()` or effects to capture snapshots separately from the computed that uses them:

```typescript
// Separate effect for capturing snapshots
listen(trigger, (triggerId) => {
  if (!triggerId) return;
  const snapshots = { /* capture current values */ };
  fieldValueSnapshots.set(snapshots);
  lastSnapshotTriggerId.set(triggerId);
});

// Pure computed - only reads, never writes
const fieldDiffs = computed(() => {
  const snapshots = fieldValueSnapshots.get();
  // ... pure transformation ...
});
```

### Option 3: Remove the feature

If the feature isn't critical, removing the snapshot tracking entirely avoids the problem:

```typescript
const fieldDiffs = computed(() => {
  // Pure transformation, no side effects
  // No snapshot tracking = no stale detection = no loop
});
```

## Test Evidence

CPU measurements from systematic testing:
- Commit 49ef026 (no snapshot tracking): **2.4% CPU** ✅
- Commit 9adc05a (with snapshot tracking): **164% CPU** ❌ INFINITE LOOP

## Key Insight

The framework's reactivity model doesn't distinguish between "I'm reading this to check if I should write" vs "I'm reading this as actual input data." Both create dependencies that trigger re-evaluation when the cell changes.

**Rule**: In a computed, never `.get()` from a cell that you might `.set()` in the same function, even conditionally.

## Related

- `blessed/reactivity.md` - Idempotent side effects in computed
- `superstitions/2025-12-14-computed-read-write-infinite-loop.md` - Similar issue with read-whole-write-whole

## Tags

`computed` `infinite-loop` `reactivity` `side-effects` `CPU` `performance`
