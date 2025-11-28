# Design: Reactive Reduce and Keyed Map Primitives

## Status

**Draft v2** - Design proposal for framework authors

**Last Updated:** 2025-11-27

---

## Executive Summary

This document proposes two primitives to complement the existing `Cell.map()`:

| Primitive | Purpose | Key Innovation |
|-----------|---------|----------------|
| `reduce()` | Aggregate array of cells | Schema-based unwrapping via `asCell: false` |
| `mapByKey()` | Process arrays with stable identity | Key-based `createRef()` instead of index |

Both leverage existing framework machinery and require ~200-300 lines of code each.

---

## Quick Start: What These Primitives Do

### reduce() - Aggregate with Unwrapping

```typescript
// Problem: Can't check .pending on array of LLM results
const analyses = articles.map(a => generateObject({...}));
const pending = analyses.get()[0].pending;  // ← Returns proxy, not boolean!

// Solution: reduce() unwraps values
const completed = reduce(analyses, {
  initial: [],
  reducer: (acc, item) => {
    if (item.pending) return acc;        // ← item.pending IS boolean
    return [...acc, item.result.text];   // ← item.result IS the value
  }
});
```

### mapByKey() - Stable Identity by Key

```typescript
// Problem: Reordering array causes wrong processing
const urls = cell(["a", "b"]);
const results = urls.map(u => fetch(u));
urls.set(["b", "a"]);  // ← map thinks index 0 changed, re-fetches "b"!

// Solution: mapByKey() uses key, not index
const results = mapByKey(urls, u => fetch(u));
urls.set(["b", "a"]);  // ← Same keys, no re-fetch. Just reorders results.
```

---

## Context

The Common Tools framework provides `Cell.map()` for processing arrays reactively. However, when building streaming pipelines that aggregate results from multiple items (e.g., per-item LLM processing), we encounter two fundamental limitations:

1. **No reactive aggregation primitive** - There's no way to combine values from an array of cells while maintaining reactivity
2. **Index-stability assumption** - `Cell.map()` assumes arrays are append-only; reordering breaks downstream processing

This document proposes two complementary primitives: `reduce()` for aggregation and `mapByKey()` for stable-identity processing.

---

## Part 1: The `reduce()` Primitive

### Motivation

MapReduce is powerful because it's **streaming**, not batch. Values flow incrementally through the system. The current framework supports the "map" half well, but lacks the "reduce" half.

Consider processing articles for prompt injection detection:
```typescript
const articles = cell([...urls]);
const analyses = articles.map(url => generateObject({...}));  // Per-item LLM

// NOW WHAT? How do we aggregate results?
// - derive() passes proxied cells, can't unwrap .pending
// - computed() can't handle dynamic arrays
// - We need REDUCE
```

### Key Insight: Schema-Based Unwrapping

The framework already has the machinery to unwrap values via schemas:

```typescript
// In map.ts:
const { list, op, params } = inputsCell.asSchema({
  type: "object",
  properties: {
    list: { type: "array", items: { asCell: true } },  // ← Returns Cell[]
    op: { asCell: true },
    params: { type: "object" },  // ← No asCell, returns plain value
  }
}).withTx(tx).get();
```

The `reduce()` primitive would use `asCell: false` (the default) to unwrap values before passing them to the reducer function.

### API Design

```typescript
// Pattern code
import { reduce, cell } from "commontools";

const items: Cell<LLMResult[]> = articles.map(url => generateObject({...}));

const aggregated = reduce(items, {
  // Initial value (required)
  initial: { completedCount: 0, allLinks: [] as string[] },

  // Reducer receives UNWRAPPED values
  reducer: (acc, item) => {
    // item.pending is boolean, not Cell<boolean>!
    if (item.pending) return acc;
    return {
      completedCount: acc.completedCount + 1,
      allLinks: [...acc.allLinks, ...item.result.links]
    };
  },

  // Optional: schema for unwrapping items (default: unwrap everything)
  itemSchema: {
    type: "object",
    properties: {
      pending: { type: "boolean" },
      result: {
        type: "object",
        properties: {
          links: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
});

// Use the result reactively
const { completedCount, allLinks } = aggregated.get();
```

### Implementation Approach

The reduce builtin uses a **functional reducer** (plain JavaScript function) rather than a recipe. This is simpler and mirrors how `computed()` works in the framework.

Key implementation insight: The framework's `FunctionCache` (used by the scheduler) shows the pattern for caching and invoking JavaScript functions.

```typescript
// builtins/reduce.ts
import { type JSONSchema, type Recipe } from "../builder/types.ts";
import { type Cell } from "../cell.ts";
import { type Action } from "../scheduler.ts";
import { type AddCancel } from "../cancel.ts";
import type { IRuntime } from "../runtime.ts";
import type { IExtendedStorageTransaction } from "../storage/interface.ts";

/**
 * Reactive reduce over an array of cells.
 *
 * Unlike map(), reduce() UNWRAPS cell values before passing them to the reducer.
 * This enables aggregation over arrays of pending async results.
 *
 * The reducer function receives plain JavaScript values, not Cell proxies:
 * - item.pending is boolean, not Cell<boolean>
 * - item.result is the actual value, not a proxy
 *
 * Re-runs whenever any item in the list changes (streaming behavior).
 */
export function reduce(
  inputsCell: Cell<{
    list: any[];
    reducer: (acc: any, item: any, index: number) => any;
    initial: any;
    itemSchema?: JSONSchema;
  }>,
  sendResult: (tx: IExtendedStorageTransaction, result: any) => void,
  _addCancel: AddCancel,
  cause: any,
  parentCell: Cell<any>,
  runtime: IRuntime,
): Action {
  let resultCell: Cell<any> | undefined;

  return (tx: IExtendedStorageTransaction) => {
    // Create result cell once
    if (!resultCell) {
      resultCell = runtime.getCell(
        parentCell.space,
        { reduce: parentCell.entityId, cause },
        undefined,
        tx,
      );
      sendResult(tx, resultCell);
    }

    const resultWithTx = resultCell.withTx(tx);

    // Build schema that UNWRAPS array items (no asCell on items)
    const inputSchema = {
      type: "object",
      properties: {
        list: {
          type: "array",
          items: {},  // No asCell = unwrap items!
        },
        reducer: {},  // Function passed through
        initial: {},
      },
      required: ["list", "reducer", "initial"],
    } as const satisfies JSONSchema;

    const inputs = inputsCell.asSchema(inputSchema).withTx(tx).get();

    // Handle undefined/empty list
    if (!inputs || !inputs.list || !Array.isArray(inputs.list)) {
      resultWithTx.set(inputs?.initial ?? null);
      return;
    }

    const { list, reducer, initial } = inputs;

    // Validate reducer is a function
    if (typeof reducer !== "function") {
      console.error("reduce: reducer must be a function");
      resultWithTx.set(initial);
      return;
    }

    // Run the reduce - items are ALREADY UNWRAPPED by asSchema
    try {
      let accumulator = initial;
      for (let i = 0; i < list.length; i++) {
        accumulator = reducer(accumulator, list[i], i);
      }
      resultWithTx.set(accumulator);
    } catch (error) {
      console.error("reduce: reducer threw error", error);
      // On error, keep previous value or use initial
      if (resultWithTx.get() === undefined) {
        resultWithTx.set(initial);
      }
    }
  };
}
```

### Why Functional Reducer (Not Recipe)

The reducer must be a plain JavaScript function for several reasons:

1. **Synchronous execution required** - reduce runs in a single scheduler action, not across multiple reactive passes

2. **Items are already unwrapped** - the key insight is that `asSchema` with `items: {}` (no `asCell`) unwraps the array items, giving the reducer plain values

3. **Matches existing patterns** - `computed()` and `derive()` also take functions, not recipes

4. **Simpler implementation** - no need for recipe invocation machinery

The trade-off is that reducers can't use reactive features internally, but that's intentional - the reactivity is at the list level, not inside the reducer.

### Streaming Behavior

Unlike batch operations, reduce is **incrementally reactive**:

```
Time 0: list = []                    → result = initial
Time 1: list = [pending, pending]    → result = initial (both pending)
Time 2: list = [done, pending]       → result = reducer(initial, done)
Time 3: list = [done, done]          → result = reducer(reducer(initial, done), done)
```

Each time any item in the list changes, reduce re-runs with the new unwrapped values.

---

## Part 2: The `mapByKey()` Primitive

### Motivation

The current `Cell.map()` has a critical limitation: it tracks progress by **index**, not by **identity**.

```typescript
// In map.ts:
let initializedUpTo = 0;

while (initializedUpTo < list.length) {
  const resultCell = runtime.getCell(
    parentCell.space,
    { result, index: initializedUpTo },  // ← Identity by INDEX
    undefined,
    tx,
  );
  // ...
  initializedUpTo++;
}
```

If the input array reorders, items at existing indices are NOT re-processed:

```
Time 1: ["url-0"]               → map processes index 0: "url-0"
Time 2: ["url-0", "url-2"]      → map processes index 1: "url-2"
Time 3: ["url-0", "url-1", "url-2"]
                     ↑
         Index 1 CHANGED from "url-2" to "url-1"!
         But map already has a result cell for index 1.
         "url-1" never gets processed!
```

### Key Insight: Use createRef with Keys

The framework's `createRef()` generates deterministic entity IDs from cause objects:

```typescript
// Current map.ts:
const resultCell = runtime.getCell(
  parentCell.space,
  { result, index: initializedUpTo },  // ← Index-based cause
  undefined,
  tx,
);

// Proposed mapByKey:
const resultCell = runtime.getCell(
  parentCell.space,
  { result, key: itemKey },  // ← Key-based cause
  undefined,
  tx,
);
```

Same key → same entity ID → same result cell, regardless of position.

### API Design

```typescript
// Pattern code
import { mapByKey, cell } from "commontools";

const urls: Cell<string[]> = cell(["url-0", "url-1", "url-2"]);

// Key function extracts stable identity
const fetches = mapByKey(
  urls,
  url => url,  // Key function: URL itself is the identity
  url => fetchData({ url })  // Recipe to apply
);

// Or with explicit key extraction:
const articles = mapByKey(
  articleCells,
  article => article.id,  // Extract stable ID
  article => generateObject({ prompt: article.content })
);
```

### Implementation Approach

The key insight is that `createRef()` generates deterministic entity IDs from the cause object. By using `{ result, key }` instead of `{ result, index }`, we get stable cell identity by key.

```typescript
// builtins/map-by-key.ts
import { type JSONSchema, type Recipe } from "../builder/types.ts";
import { type Cell } from "../cell.ts";
import { type Action } from "../scheduler.ts";
import { type AddCancel } from "../cancel.ts";
import type { IRuntime } from "../runtime.ts";
import type { IExtendedStorageTransaction } from "../storage/interface.ts";

/**
 * Map over an array with stable key-based identity.
 *
 * Unlike map(), which tracks progress by index, mapByKey() uses a key function
 * to establish stable identity. This means:
 * - Reordering the input array doesn't cause re-processing
 * - Same key = same result cell, regardless of position
 * - Automatic deduplication (duplicate keys are skipped)
 *
 * This is critical for streaming pipelines where derived arrays may reorder.
 */
export function mapByKey(
  inputsCell: Cell<{
    list: any[];
    keyFn: (item: any) => any;  // Plain JS function for sync key extraction
    op: Recipe;                  // Recipe to apply to each item
    params?: Record<string, any>;
  }>,
  sendResult: (tx: IExtendedStorageTransaction, result: any) => void,
  addCancel: AddCancel,
  cause: any,
  parentCell: Cell<any>,
  runtime: IRuntime,
): Action {
  let result: Cell<any[]> | undefined;

  // Track key → result cell mapping across invocations
  // This persists between scheduler runs to reuse existing result cells
  const keyToResultCell = new Map<string, Cell<any>>();
  const keyToCancel = new Map<string, () => void>();

  return (tx: IExtendedStorageTransaction) => {
    // Create result array cell once
    if (!result) {
      result = runtime.getCell<any[]>(
        parentCell.space,
        { mapByKey: parentCell.entityId, cause },
        undefined,
        tx,
      );
      result.send([]);
      result.setSourceCell(parentCell);
      sendResult(tx, result);
    }

    // Get inputs - list items as Cells for passing to recipe
    const { list, keyFn, op, params } = inputsCell.asSchema({
      type: "object",
      properties: {
        list: { type: "array", items: { asCell: true } },  // Items as Cells
        keyFn: {},  // Plain function
        op: { asCell: true },  // Recipe reference
        params: { type: "object" },
      },
      required: ["list", "op"],
    } as const satisfies JSONSchema).withTx(tx).get();

    const resultWithTx = result.withTx(tx);

    // Handle empty/undefined list
    if (!list || !Array.isArray(list)) {
      resultWithTx.set([]);
      return;
    }

    // Default key function: identity (use item value as key)
    const getKey = typeof keyFn === "function"
      ? keyFn
      : (item: any) => item;  // Default: item IS the key

    const opRecipe = op?.getRaw();
    if (!opRecipe) {
      console.error("mapByKey: op recipe is required");
      resultWithTx.set([]);
      return;
    }

    const resultArray: Cell<any>[] = [];
    const seenKeys = new Set<string>();

    for (let i = 0; i < list.length; i++) {
      const itemCell = list[i] as Cell<any>;

      // Extract key from item
      // Note: We read the item value to compute the key
      // This creates a dependency on the item's value
      let key: any;
      try {
        const itemValue = itemCell.withTx(tx).get();
        key = getKey(itemValue);
      } catch (e) {
        console.warn("mapByKey: keyFn threw, using index as fallback", e);
        key = i;
      }

      const keyString = JSON.stringify(key);

      // Skip duplicate keys (first wins)
      if (seenKeys.has(keyString)) {
        continue;
      }
      seenKeys.add(keyString);

      // Check if we already have a result cell for this key
      let resultCell = keyToResultCell.get(keyString);

      if (!resultCell) {
        // Create NEW result cell with KEY-based identity
        // This is the critical difference from map.ts!
        resultCell = runtime.getCell(
          parentCell.space,
          { result, key },  // ← KEY instead of index
          undefined,
          tx,
        );

        // Run the recipe for this item
        runtime.runner.run(
          tx,
          opRecipe,
          params !== undefined
            ? { element: itemCell, key, index: i, array: inputsCell.key("list"), params }
            : { element: itemCell, key, index: i, array: inputsCell.key("list") },
          resultCell,
        );

        resultCell.getSourceCell()?.setSourceCell(parentCell);

        // Track cancel for cleanup
        const cancel = () => runtime.runner.stop(resultCell!);
        keyToCancel.set(keyString, cancel);
        addCancel(cancel);

        keyToResultCell.set(keyString, resultCell);
      }

      resultArray.push(resultCell);
    }

    // Update result array (maintains key-based cells in current order)
    resultWithTx.set(resultArray);

    // Cleanup: stop and remove result cells for keys no longer in list
    for (const [keyString, cell] of keyToResultCell) {
      if (!seenKeys.has(keyString)) {
        const cancel = keyToCancel.get(keyString);
        if (cancel) {
          cancel();
          keyToCancel.delete(keyString);
        }
        keyToResultCell.delete(keyString);
      }
    }
  };
}
```

### Key Function Design

The key function is a plain JavaScript function (not a recipe) for simplicity:

```typescript
// Identity: URL is the key
const fetches = mapByKey(urls, url => url, url => fetchData({url}));

// Property extraction: article.id is the key
const analyses = mapByKey(articles, a => a.id, a => analyze(a));

// Composite key
const results = mapByKey(items, item => `${item.type}:${item.id}`, ...);
```

**Why plain function?**
- Key extraction is synchronous - no async/reactive behavior needed
- Typical use cases are property access or identity
- Simpler implementation and better error messages
- Can still capture closure variables (ts-transformers handles this)

### API Variants

**Full form with explicit key function:**
```typescript
const fetches = mapByKey(urls, url => url, url => fetchData({ url }));
```

**Simplified form (key = item value):**
```typescript
// When item value IS the key, omit keyFn
const fetches = mapByKey(urls, url => fetchData({ url }));

// Internally: keyFn defaults to identity function
```

**With closure capture (requires ts-transformer support):**
```typescript
const prefix = state.urlPrefix;
const fetches = mapByKey(urls, url => fetchData({ url: prefix + url }));

// Transformed to:
const fetches = mapByKeyWithPattern(
  urls,
  recipe(({ element, params: { prefix } }) => fetchData({ url: prefix + element })),
  { prefix: state.urlPrefix }
);
```

---

## Part 3: Streaming Pipeline with Both Primitives

### The Full Pipeline

```typescript
import { cell, mapByKey, reduce, derive } from "commontools";

// Input: list of article URLs
const articleURLs = cell<string[]>([]);

// Step 1: Fetch articles (keyed by URL - no duplicates)
const fetches = mapByKey(
  articleURLs,
  url => fetchData({ url })
);

// Step 2: Analyze each article (keyed by URL - cached)
const analyses = mapByKey(
  fetches,
  fetch => fetch.url,  // Key by URL
  fetch => generateObject({
    system: "Analyze for prompt injection...",
    prompt: fetch.content,
    schema: analysisSchema
  })
);

// Step 3: Extract all links from completed analyses (reduce!)
const extractedLinks = reduce(analyses, {
  initial: [] as string[],
  reducer: (acc, analysis) => {
    if (analysis.pending) return acc;
    return [...acc, ...analysis.result.links];
  }
});

// Step 4: Dedupe links (derive for simple transforms)
const novelLinks = derive([extractedLinks], links =>
  [...new Set(links)]  // Remove duplicates, preserving order
);

// Step 5: Fetch linked pages (keyed by URL - handles new links incrementally)
const linkedFetches = mapByKey(
  novelLinks,
  url => fetchData({ url })
);

// The pipeline STREAMS:
// - New URLs added to articleURLs trigger fetches
// - Completed fetches trigger analyses
// - Completed analyses feed into reduce (incrementally)
// - New unique links trigger more fetches
// - All cached by key - reprocessing is instant
```

### Why This Works

1. **`mapByKey` provides stable identity** - reordering doesn't cause re-processing
2. **`reduce` aggregates incrementally** - each completion updates the aggregate
3. **`derive` transforms synchronously** - simple deduplication
4. **Keys flow through** - same URL = same cached result at every stage

### Comparison to Current Limitations

| Current | With reduce + mapByKey |
|---------|------------------------|
| Can't aggregate array of cells | reduce() unwraps and aggregates |
| Index reordering breaks map | mapByKey uses stable keys |
| Duplicate URLs = duplicate work | mapByKey dedupes automatically |
| Batch thinking required | True streaming pipeline |

---

## Part 4: Implementation Plan

### Phase 1: Functional reduce() (~150 lines)

**Files to modify:**
- `packages/runner/src/builtins/reduce.ts` (new file)
- `packages/runner/src/builtins/index.ts` (add registration)
- `packages/patterns/src/index.ts` (export for patterns)

**Steps:**
1. Create `reduce.ts` with implementation from this doc
2. Add `moduleRegistry.addModuleByRef("reduce", raw(reduce))` to index.ts
3. Export `reduce` function for pattern use
4. Test with simple array aggregation

**Test cases:**
```typescript
// Basic aggregation
const sum = reduce(numbers, { initial: 0, reducer: (acc, n) => acc + n });

// Pending filtering
const completed = reduce(llmResults, {
  initial: [],
  reducer: (acc, item) => item.pending ? acc : [...acc, item.result]
});

// Empty list handling
const empty = reduce(cell([]), { initial: "default", reducer: (a, b) => b });
// → "default"
```

**Estimated effort:** 1-2 days

### Phase 2: mapByKey() (~200 lines)

**Files to modify:**
- `packages/runner/src/builtins/map-by-key.ts` (new file)
- `packages/runner/src/builtins/index.ts` (add registration)
- `packages/patterns/src/index.ts` (export for patterns)

**Steps:**
1. Create `map-by-key.ts` with implementation from this doc
2. Register builtin
3. Export for patterns
4. Test key stability

**Test cases:**
```typescript
// Key stability across reordering
const urls = cell(["a", "b", "c"]);
const fetches = mapByKey(urls, url => fetchData({ url }));
urls.set(["c", "b", "a"]);  // No new fetches - keys unchanged

// Deduplication
const withDupes = cell(["a", "b", "a", "c"]);
const results = mapByKey(withDupes, x => process(x));
// Only 3 process() calls, not 4

// Key function
const articles = cell([{id: 1, text: "..."}, {id: 2, text: "..."}]);
const analyses = mapByKey(articles, a => a.id, a => analyze(a.text));
```

**Estimated effort:** 2-3 days

### Phase 3: ts-transformers Integration

**Files to modify:**
- `packages/ts-transformers/src/closure.ts`
- `packages/ts-transformers/src/index.ts`

**Steps:**
1. Add `mapByKey` and `mapByKeyWithPattern` to recognized methods
2. Transform closures in key function and operation recipe
3. Follow existing `map` → `mapWithPattern` transformation pattern

**Estimated effort:** 1-2 days

### Phase 4: Testing & Documentation

**Test files:**
- `packages/runner/src/builtins/reduce.test.ts`
- `packages/runner/src/builtins/map-by-key.test.ts`
- `packages/runner/src/__tests__/streaming-pipeline.test.ts`

**Documentation:**
- Update `docs/common/PATTERNS.md` with reduce/mapByKey examples
- Add streaming pipeline example
- Document when to use each primitive

**Estimated effort:** 1-2 days

### Total Estimated Effort: 5-9 days

---

## Alternative Approaches Considered

### A: Export effect() to Patterns

**Approach:** Let patterns use imperative `effect()` for aggregation

**Why Not:**
- Breaks declarative model
- Side effects are hard to reason about
- Doesn't solve index-stability problem

### B: whenAll() Batch Primitive

**Approach:** Add `whenAll(cells)` that waits for all to complete

**Why Not:**
- Batch thinking in a streaming system
- Creates artificial sync points
- Doesn't stream intermediate results

### C: Enhanced derive() with Unwrapping

**Approach:** Make `derive()` unwrap cell arrays

**Why Not:**
- Breaks existing derive semantics
- Confusing when unwrapping happens
- reduce() is more explicit

### D: Index-Change Detection in map()

**Approach:** Have map detect when items at indices change

**Why Not:**
- O(n) comparison on each update
- Doesn't handle semantic identity
- Keys are the right abstraction

---

## Gotchas and Edge Cases

### reduce() Gotchas

**1. Reducer must be pure**
```typescript
// ❌ BAD - side effect in reducer
let externalCount = 0;
reduce(items, {
  initial: [],
  reducer: (acc, item) => {
    externalCount++;  // Side effect - runs on every reactive pass!
    return [...acc, item];
  }
});

// ✅ GOOD - pure reducer
reduce(items, {
  initial: { count: 0, items: [] },
  reducer: (acc, item) => ({
    count: acc.count + 1,
    items: [...acc.items, item]
  })
});
```

**2. Reducer runs on EVERY item change**
```typescript
// If list has 100 items and one changes, reducer runs 100 times
// For O(n²) reducers, this gets expensive
reduce(largeList, {
  initial: [],
  reducer: (acc, item) => [...acc, item]  // Creates new array each time
});
```

**3. Pending items are still passed**
```typescript
// The reducer sees ALL items, including pending ones
// Filter explicitly in your reducer
reduce(llmResults, {
  initial: [],
  reducer: (acc, item) => {
    if (item.pending || item.error) return acc;  // Must filter!
    return [...acc, item.result];
  }
});
```

### mapByKey() Gotchas

**1. Key function is called on every update**
```typescript
// ❌ BAD - expensive key computation
mapByKey(items, item => computeExpensiveHash(item), ...);

// ✅ GOOD - use existing ID
mapByKey(items, item => item.id, ...);
```

**2. Keys must be JSON-serializable**
```typescript
// ❌ BAD - function as key
mapByKey(items, item => item.callback, ...);

// ❌ BAD - object reference as key (changes on each call)
mapByKey(items, item => ({ id: item.id }), ...);

// ✅ GOOD - primitive or JSON string
mapByKey(items, item => item.id, ...);
mapByKey(items, item => JSON.stringify({ a: item.a, b: item.b }), ...);
```

**3. Duplicate keys are silently deduplicated**
```typescript
const items = cell([{ id: 1 }, { id: 1 }, { id: 2 }]);
const results = mapByKey(items, i => i.id, i => process(i));
// Only 2 process() calls, not 3
// Second { id: 1 } is skipped (first wins)
```

**4. Key changes = new processing**
```typescript
const items = cell([{ id: 1, data: "old" }]);
const results = mapByKey(items, i => i.id, i => process(i.data));

items.set([{ id: 2, data: "old" }]);  // Different key = new process()
// Even though data is the same, key changed
```

### Pipeline Gotchas

**1. reduce() → mapByKey() needs stable reduce output**
```typescript
// ❌ BAD - reduce creates new array on each pass, triggering mapByKey
const links = reduce(analyses, {
  initial: [],
  reducer: (acc, item) => [...acc, ...item.links]  // New array every time
});
const fetches = mapByKey(links, url => fetch(url));
// Every reduce pass creates new array → mapByKey sees "new" items

// ✅ GOOD - dedupe before mapByKey to stabilize
const links = reduce(...);
const uniqueLinks = derive([links], ls => [...new Set(ls)]);  // Dedupe
const fetches = mapByKey(uniqueLinks, url => fetch(url));
// Same URLs → same keys → no re-fetch
```

**2. Order matters for streaming**
```typescript
// reduce + derive + mapByKey forms a streaming pipeline
// Each step runs when its input changes, propagating downstream
// No "wait for all" - results flow incrementally
```

---

## Open Questions

1. **Key Type Constraints**
   - Should keys be limited to JSON-serializable values?
   - How to handle complex keys (objects)?
   - **Recommendation:** JSON-stringify keys for Map lookup

2. **Duplicate Key Handling**
   - What if two items have the same key?
   - Options: first wins, last wins, error
   - **Recommendation:** first wins with console warning

3. **Reducer Side Effects**
   - Should reducers be pure?
   - What if reducer throws?
   - **Recommendation:** pure, errors return previous accumulator

4. **Key Function Timing**
   - When is key function evaluated?
   - What if item is pending?
   - **Recommendation:** key from whatever's available; pending items use fallback

5. **Memory Management**
   - When to garbage-collect orphaned result cells?
   - **Recommendation:** immediate cleanup when key disappears

---

## Appendix: Framework Code References

### How map() tracks indices

```typescript
// packages/runner/src/builtins/map.ts:52
let initializedUpTo = 0;

// packages/runner/src/builtins/map.ts:115-152
while (initializedUpTo < list.length) {
  const resultCell = runtime.getCell(
    parentCell.space,
    { result, index: initializedUpTo },  // ← Index-based identity
    undefined,
    tx,
  );
  // ...
  initializedUpTo++;
}
```

### How createRef generates entity IDs

```typescript
// packages/runner/src/create-ref.ts:23-70
export function createRef(
  source: Record<string | number | symbol, any> = {},
  cause: any = crypto.randomUUID(),
): EntityId {
  // ...
  return refer(traverse({ ...source, causal: cause }));
}
```

Key insight: same cause object → same entity ID → same cell

### How asSchema unwraps values

```typescript
// packages/runner/src/schema.ts:30-47
// `asCell: true` → return Cell reference
// `asCell: false` (default) → return unwrapped value
```

### How builtins are registered

```typescript
// packages/runner/src/builtins/index.ts:22-53
export function registerBuiltins(runtime: IRuntime) {
  const moduleRegistry = runtime.moduleRegistry;
  moduleRegistry.addModuleByRef("map", raw(map));
  moduleRegistry.addModuleByRef("reduce", raw(reduce));  // ← Would add
  moduleRegistry.addModuleByRef("mapByKey", raw(mapByKey));  // ← Would add
  // ...
}
```

---

## Summary

### What We're Proposing

Two complementary primitives that enable streaming MapReduce pipelines:

| Primitive | Solves | Mechanism | LOC |
|-----------|--------|-----------|-----|
| `reduce()` | Can't aggregate array of pending cells | Schema-based unwrapping (`items: {}` not `items: { asCell: true }`) | ~150 |
| `mapByKey()` | Index reordering breaks map | Key-based `createRef()` for cell identity | ~200 |

### Why These Specific Designs

**reduce() uses functional reducer:**
- Synchronous execution in single scheduler action
- Matches existing `computed()` and `derive()` patterns
- Unwrapping is the key innovation, not the reduce logic

**mapByKey() uses key function:**
- `createRef({ result, key })` gives deterministic entity ID by key
- Existing framework machinery - no new concepts needed
- Key functions are typically simple property access

### Implementation Leverages Existing Code

```typescript
// reduce() - same pattern as ifElse builtin
inputsCell.asSchema({ list: { type: "array", items: {} } })  // Unwrap!

// mapByKey() - same pattern as map builtin
runtime.getCell(space, { result, key }, ...)  // Key not index!
runtime.runner.run(tx, opRecipe, inputs, resultCell)  // Same recipe execution
```

### Expected Effort

~5-9 days total:
- Phase 1: reduce() - 1-2 days
- Phase 2: mapByKey() - 2-3 days
- Phase 3: ts-transformers - 1-2 days
- Phase 4: Tests & docs - 1-2 days

### Next Steps

1. Review this design with framework authors
2. Validate unwrapping approach works as expected
3. Implement reduce() first (simpler, validates pattern)
4. Implement mapByKey()
5. Update ts-transformers for closure capture

---

**Document History:**
- 2025-11-27: Initial draft (v1)
- 2025-11-27: Added Quick Start, Gotchas, detailed implementation (v2)
