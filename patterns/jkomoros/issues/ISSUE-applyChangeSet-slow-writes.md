# Performance: `applyChangeSet` takes 15+ seconds with 226 writes due to per-write overhead in `tx.writeValueOrThrow()`

## Summary

When `generateObject` extracts data into a complex schema with many fields, there's a ~16 second UI freeze. The root cause is in `tx.writeValueOrThrow()` - each write takes ~68ms on average, and with 226 writes from the extraction result, this adds up to 15.4 seconds of blocking time.

**Key metric:** `15,441ms for 226 writes (avg 68.33ms per write)`

---

## Minimal Reproduction

### Test Files

**Launcher (`person-test-launcher.tsx`):**

```typescript
/// <cts-enable />
import { handler, NAME, navigateTo, pattern, UI } from "commontools";
import Person from "./person.tsx";

const DEMO_NOTES = `Dr. Maya Rodriguez (she/her)
maya.rodriguez@biotech.com
+1-617-555-7890
Born: 1988-11-03
Twitter: @drmayar
LinkedIn: linkedin.com/in/maya-rodriguez

Biotech researcher specializing in CRISPR gene editing. Lead scientist at GeneTech Labs. Published 25+ peer-reviewed papers. Avid rock climber. Speaks Spanish and English. MIT PhD 2015.`;

const launchPerson = handler<void, void>(() =>
  navigateTo(Person({ notes: DEMO_NOTES }))
);

export default pattern(() => ({
  [NAME]: "Person Test Launcher",
  [UI]: (
    <div style={{ padding: "1rem" }}>
      <ct-button onClick={launchPerson()}>Launch Person (with notes)</ct-button>
    </div>
  ),
}));
```

**Target pattern uses `generateObject` with 14-field schema:**

```typescript
const { result: extractionResult, pending: extractionPending } = generateObject({
  system: `You are a profile data extraction assistant. Extract structured information...`,
  prompt: guardedPrompt,
  model: "anthropic:claude-sonnet-4-5",
  schema: {
    type: "object",
    properties: {
      displayName: { type: "string" },
      givenName: { type: "string" },
      familyName: { type: "string" },
      nickname: { type: "string" },
      pronouns: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      birthday: { type: "string" },
      twitter: { type: "string" },
      linkedin: { type: "string" },
      github: { type: "string" },
      instagram: { type: "string" },
      mastodon: { type: "string" },
      remainingNotes: { type: "string" },
    },
  },
});
```

### Steps to Reproduce

1. Deploy launcher: `deno task ct charm new --api-url http://localhost:8000 --identity ../community-patterns/claude.key --space repro-test ../community-patterns/patterns/jkomoros/person-test-launcher.tsx`
2. Open: `http://localhost:5173/repro-test/`
3. Click **"Launch Person (with notes)"**
4. Wait for Person pattern to load
5. Click **"Extract Data from Notes"**
6. **Observe:** UI freezes for ~16 seconds while CPU spikes to 100%

### Expected vs Actual

| Metric | Expected | Actual |
|--------|----------|--------|
| LLM API response | ~2-3 seconds | ~2-3 seconds ✓ |
| UI update after response | <100ms | **15+ seconds** ✗ |
| CPU during extraction | Low | **100% single core** ✗ |
| UI responsiveness | Normal | **Completely frozen** ✗ |

### Control Test (Direct Deployment)

Deploy the Person pattern directly (not via navigateTo):
```bash
deno task ct charm new --api-url http://localhost:8000 --identity ../community-patterns/claude.key --space control-test ../community-patterns/patterns/jkomoros/person.tsx
```

**Result:** Extraction completes in ~2-3 seconds (normal).

| Creation Method | Extraction Time |
|-----------------|-----------------|
| Direct `charm new` | ~2-3s |
| Via `navigateTo()` | ~16s freeze |

---

## Technical Investigation

### Profiling Methodology

We added targeted timing measurements at each layer of the write stack:

1. **LLM Result Handler** (`llm.ts`)
2. **Cell.set()** (`cell.ts`)
3. **diffAndUpdate()** (`data-updating.ts`)
4. **applyChangeSet()** (`data-updating.ts`) - with per-write timing

### Profiling Instrumentation Added

**In `data-updating.ts` - `applyChangeSet()`:**

```typescript
export function applyChangeSet(tx: IExtendedStorageTransaction, changes: ChangeSet) {
  let totalWriteTime = 0;
  let slowWrites = 0;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const start = performance.now();
    tx.writeValueOrThrow(change.location, change.value);
    const elapsed = performance.now() - start;
    totalWriteTime += elapsed;
    if (elapsed > 10) {
      slowWrites++;
      if (slowWrites <= 5) {
        console.log(`[PROFILING] applyChangeSet slow write #${i}: ${elapsed.toFixed(2)}ms path=${change.location.path.join(".")}`);
      }
    }
  }
  if (slowWrites > 5) {
    console.log(`[PROFILING] applyChangeSet: ${slowWrites - 5} more slow writes not shown`);
  }
  console.log(`[PROFILING] applyChangeSet totalWriteTime: ${totalWriteTime.toFixed(2)}ms for ${changes.length} writes (avg ${(totalWriteTime / changes.length).toFixed(2)}ms)`);
}
```

### Profiling Results

```
[PROFILING] diffAndUpdate-normalizeAndDiff: 1.8ms        ← Computing changes: FAST
[PROFILING] diffAndUpdate changes count: 226             ← Large number of granular writes
[PROFILING] applyChangeSet slow write #13: 11.60ms path=internal.__#7.4.type
[PROFILING] applyChangeSet slow write #14: 11.00ms path=internal.__#7.4.word
[PROFILING] applyChangeSet slow write #15: 68.40ms path=internal.__#7.5
[PROFILING] applyChangeSet: 208 more slow writes not shown
[PROFILING] applyChangeSet totalWriteTime: 15441.50ms for 226 writes (avg 68.33ms)
[PROFILING] diffAndUpdate-applyChangeSet: 15441.93ms     ← Applying changes: SLOW
```

### What We Ruled Out

| Hypothesis | Evidence Against It |
|------------|---------------------|
| O(n²) in scheduler | `topologicalSort-build-graph` and `arraysOverlap` both <1ms |
| `normalizeAndDiff` traversal | Completed in 1.8ms (even for 226 changes) |
| LLM response parsing | `generateObject-idle-wait` completed in <1ms |
| Schema transformation | `recursivelyAddIDIfNeeded` completed in <5ms |
| ct-autolayout component | Removed it, still freezes |
| Network/async overhead | All time spent in synchronous `applyChangeSet` |

### Definitive Finding

The problem is in `applyChangeSet()`. Each individual `tx.writeValueOrThrow()` call takes ~68ms on average. With 226 writes, this adds up to 15+ seconds of blocking time.

---

## Root Cause Analysis

### Primary Bottleneck: Per-Write Overhead

The `writeValueOrThrow` call chain reveals significant per-write overhead:

1. **Path Resolution & Validation** (`chronicle.ts`)
   - Each write loads the current fact from the replica
   - Validates against current state via `rebase()` which iterates over prior novelty entries

2. **Deep Cloning via JSON Serialization** (`attestation.ts` lines 82-85)
   ```typescript
   value: source.value === undefined
     ? source.value
     : JSON.parse(JSON.stringify(source.value)),
   ```
   Every write creates a full deep clone. With 226 writes to a complex nested object, this is extremely expensive.

3. **Activity Tracking Overhead** (`journal.ts`)
   ```typescript
   journal.state.activity.push({ write: { ...address, space } });
   ```
   Each write creates a new activity object.

4. **Novelty Map Operations** (`chronicle.ts` - `Changes.rebase()`)
   Iterates through existing changes to find overlapping addresses. With many writes, this approaches O(n²).

### Why 68ms Per Write?

- Deep clone via `JSON.parse(JSON.stringify())` on increasingly large objects
- O(n) rebase operations that grow with prior write count
- Memory allocation pressure from cloned objects
- Possible GC pauses from high allocation rate

### Framework Code Path

```
Cell.set()
  → diffAndUpdate()
    → normalizeAndDiff()  ← 1.8ms (FAST - computes changes)
    → applyChangeSet()    ← 15,441ms (SLOW - applies changes)
      → for each change:
        → tx.writeValueOrThrow()  ← ~68ms per call
          → chronicle.write()
            → rebase()
            → JSON.parse(JSON.stringify())
            → novelty.claim()
```

---

## Suggested Fixes

### Option 1: Coalesce Changes at applyChangeSet Level (Recommended First Step)

**Complexity:** Low | **Impact:** High

Group changes by document ID and write the merged result once instead of 226 individual writes:

```typescript
export function applyChangeSet(tx: IExtendedStorageTransaction, changes: ChangeSet) {
  // Group changes by document (id + type)
  const byDocument = new Map<string, ChangeSet>();
  for (const change of changes) {
    const key = `${change.location.id}/${change.location.type}`;
    if (!byDocument.has(key)) byDocument.set(key, []);
    byDocument.get(key)!.push(change);
  }

  // Apply changes per document as a single merged write
  for (const [_key, docChanges] of byDocument) {
    const rootChange = docChanges.find(c => c.location.path.length === 0);
    if (rootChange) {
      const merged = applyNestedChanges(rootChange.value, docChanges);
      tx.writeValueOrThrow(rootChange.location, merged);
    } else {
      for (const change of docChanges) {
        tx.writeValueOrThrow(change.location, change.value);
      }
    }
  }
}
```

### Option 2: Batch Write API

Add `writeValuesOrThrow` batch method that:
- Performs single rebase per document
- Defers activity tracking to batch completion
- Uses single deep clone, mutates in place

### Option 3: Eliminate JSON Deep Clone

Replace `JSON.parse(JSON.stringify())` with structural sharing (Immer-style):
- Only clone the path from root to modified leaf
- Share unchanged subtrees between versions

---

## Questions for Framework Authors

1. **Transaction Isolation:** Is it acceptable for reads within the same transaction to not immediately see prior writes? (Would enable deferred consolidation)

2. **Activity Tracking:** Is per-write activity tracking essential, or could it be aggregated?

3. **Existing Batch Patterns:** Are there internal batch patterns we should follow?

---

## Critical Files

| File | Relevance |
|------|-----------|
| `data-updating.ts` | `applyChangeSet()` - the slow loop |
| `chronicle.ts` | `write()` and `rebase()` - per-write overhead |
| `attestation.ts` | `JSON.parse(JSON.stringify())` deep clone |
| `extended-storage-transaction.ts` | `writeValueOrThrow()` wrapper |
| `cell.ts` | Entry point `Cell.set()` |

---

## Environment

- Framework: Common Tools / Labs (local dev)
- Pattern: `patterns/jkomoros/person.tsx` + `person-test-launcher.tsx`
- Browser: Chrome (tested)
- OS: macOS Darwin 24.6.0

---

## Appendix A: Full person-test-launcher.tsx

See: `patterns/jkomoros/person-test-launcher.tsx`

---

## Appendix B: Full person.tsx

See: `patterns/jkomoros/person.tsx` (1360 lines)

The key section triggering this issue is the `generateObject` call at lines 686-728.
