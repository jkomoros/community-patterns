# Design: Reactive Reduce and Keyed Map Primitives

## Status

**Draft v3** - Design proposal with critical blockers identified

**Last Updated:** 2025-11-27

---

## ⚠️ Critical Blockers Identified

After deep research into the framework implementation, several **critical blockers** have been identified with the original reduce() design:

### Blocker 1: Function Serialization

**Problem:** The original design proposed passing a reducer function as runtime data:

```typescript
reduce(analyses, {
  initial: [],
  reducer: (acc, item) => { ... }  // ← This function can't be serialized!
});
```

**Why it fails:**
1. Builtins receive their inputs via `inputsCell.asSchema()` which reads from storage
2. Storage only supports JSON-serializable values
3. Functions are converted to strings via `.toString()` during serialization (see `json-utils.ts:218`)
4. Closures captured by the function are LOST during stringification
5. The FunctionCache only helps with functions that are part of Module implementations, not runtime data

**Evidence:** In `runner.ts:742-746`:
```typescript
if (typeof module.implementation === "function" &&
    !this.functionCache.has(module)
) {
  this.functionCache.set(module, module.implementation);
}
```
Functions work when they're the `implementation` of a Module, but NOT when passed as data.

### Blocker 2: derive() and computed() Are NOT Builtins

**Problem:** The design assumed we could create reduce() similar to derive()/computed().

**Reality:** Looking at `module.ts:226-227`:
```typescript
export const computed: <T>(fn: () => T) => OpaqueRef<T> = <T>(fn: () => T) =>
  lift<any, T>(fn)(undefined);
```

`derive()` and `computed()` use `lift()` to create a **Module** where the function IS the implementation. They're NOT builtins like map() - they work because:
1. The function becomes the module's `implementation` property at compile time
2. ts-transformers convert the code to wrap captured variables
3. The module is registered with the recipe system

### Blocker 3: Recipe Composition for Reduce

**Problem:** Even if we could pass a reducer as a Recipe, reduce needs to COMPOSE results:
- `reduce(initial, item1)` → `result1`
- `reduce(result1, item2)` → `result2`
- ...

This requires feeding the output of one recipe invocation as input to the next, which is fundamentally different from map() where each item is processed independently.

---

## Revised Approach Options

Given these blockers, here are the viable options:

### Option A: Derive-Based Aggregation - ❌ DOES NOT WORK

**Experiment performed:** Tried using derive() with array.reduce():

```typescript
const completed = derive([analyses], (items) => {
  return items.reduce((acc, item) => {
    if (item.pending) return acc;  // TypeScript error!
    return [...acc, item.result];
  }, []);
});
```

**Results (TypeScript compilation errors):**
```
[ERROR] Operator '+' cannot be applied to types 'number' and 'Cell<number[]>'
[ERROR] Property 'doubled' does not exist on type 'OpaqueCell<...>'
[ERROR] Property 'pending' does not exist on type 'Cell<LLMResult[]>'
```

**Conclusion:** derive() does NOT unwrap array items. Inside the derive callback:
- `items` is an `OpaqueCell` or `Cell` proxy
- `items[0]` is ALSO a proxy, not the unwrapped value
- `.reduce()` receives proxied items, not plain values
- TypeScript correctly catches this - you can't access `.pending` on a Cell

**This option is NOT viable.** We need a primitive that explicitly unwraps values.

### Option B: Module Factory for Reduce

Create `reduce` as a module factory (like derive), not a builtin:

```typescript
// In module.ts (framework change)
export function reduce<T, R>(
  list: Opaque<T[]>,
  initial: R,
  reducer: (acc: R, item: T, index: number) => R,
): OpaqueRef<R> {
  // Implementation uses lift() to create a module
  return lift((inputs: { list: T[]; initial: R }) => {
    return inputs.list.reduce(reducer, inputs.initial);
  })({ list, initial });
}
```

**Pros:**
- Follows existing patterns
- Function becomes module implementation
- ts-transformers can handle closure capture

**Cons:**
- Requires framework changes to module.ts
- Still runs full reduce on every change
- Reducer closures need transformer support

### Option C: ts-Transformer Approach - ✅ MOST PROMISING

**Key Insight:** reduce() could work like derive(), not like map().

For map, each item needs its own recipe invocation (parallel processing).
For reduce, we need sequential composition - but if we use **lift()**, the reducer runs synchronously inside the lift callback.

**How it would work:**

```typescript
// User writes:
const result = reduce(analyses, [], (acc, item) => {
  if (item.pending) return acc;
  return [...acc, item.result];
});

// ts-transformer converts to:
const result = lift(
  { type: "object", properties: { list: listSchema, ...capturedSchemas } },
  resultSchema,
  ({ list, ...params }) => {
    // Inside lift, list IS UNWRAPPED to plain values!
    return list.reduce((acc, item) => {
      if (item.pending) return acc;  // item.pending is boolean here
      return [...acc, item.result];
    }, []);
  }
)({ list: analyses, ...capturedValues });
```

**Why this works:**
1. The reducer function becomes part of the lift() callback closure (compile-time capture, not runtime data)
2. ts-transformers use `CaptureCollector` to find OpaqueRefs in the reducer
3. Captured refs become params passed to lift
4. Inside lift's implementation, the `list` input IS unwrapped (that's how lift/derive work)
5. The standard JS `.reduce()` runs on unwrapped array

**What the transformer needs to do:**
1. Recognize `reduce(list, initial, reducer)` calls
2. Use `CaptureCollector` to find OpaqueRefs captured in reducer body
3. Build input schema including `list` and all captured refs
4. Infer result schema from reducer return type
5. Generate lift() call that wraps the reducer in a synchronous reduce

**Transformer sketch (pseudocode):**
```typescript
function transformReduceCall(call: ts.CallExpression): ts.Expression {
  const [listArg, initialArg, reducerArg] = call.arguments;

  // Find OpaqueRefs captured in the reducer
  const collector = new CaptureCollector(checker);
  const { captureTree } = collector.analyze(reducerArg);

  // Build the lift callback body that does actual reduce
  const liftBody = factory.createCallExpression(
    factory.createPropertyAccessExpression(
      factory.createIdentifier('list'),
      'reduce'
    ),
    undefined,
    [reducerArg, initialArg]  // Pass reducer as-is, it's now inside lift
  );

  // Generate: lift(schema, resultSchema, ({list, ...params}) =>
  //             list.reduce(reducer, initial))({list, ...values})
  return generateLiftCall(listArg, captureTree, liftBody);
}
```

**Pros:**
- Follows existing derive/lift patterns
- Reducer closure is captured at compile time (no serialization issues!)
- ts-transformers machinery already exists (CaptureCollector, etc.)
- Works with existing framework - just generates different code

**Cons:**
- Requires new transformer (2-4 days work)
- Different signature from derive: `reduce(list, initial, reducer)` vs `derive(inputs, fn)`
- Need to handle (acc, item) two-parameter signature
- Schema inference for list items and result type

**Estimated effort:** 2-4 days for the transformer + 1 day testing

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

### ⚠️ IMPLEMENTATION BLOCKED

**The above implementation WILL NOT WORK as written.**

The critical flaw is on line 366: `if (typeof reducer !== "function")`. When `reducer` is read from storage via `asSchema`, it will be a **string** (the function's source code), not a function object. Closures captured by the reducer will be lost.

**See "Critical Blockers Identified" section at the top of this document.**

### Viable Alternative: Module Factory

Instead of a builtin, implement reduce as a module factory (like derive):

```typescript
// In module.ts (framework code)
export function reduce<T, R>(
  list: Opaque<T[]>,
  initial: R,
  reducer: (acc: R, item: T, index: number) => R,
): OpaqueRef<R> {
  // The reducer function becomes the module's implementation
  // ts-transformers will handle closure capture
  return lift((inputs: { list: T[]; initial: R }) => {
    if (!inputs.list) return inputs.initial;
    return inputs.list.reduce(reducer, inputs.initial);
  })({ list, initial });
}
```

This works because:
1. The reducer becomes part of the Module at compile time
2. ts-transformers capture closures into params
3. The function is cached in FunctionCache by module key

### Why The Original Approach Fails

The original design assumed we could pass functions as runtime data:

1. **Builtins are NOT like derive/computed** - derive/computed use `lift()` to make the function the module's `implementation` property at compile time

2. **Functions in storage become strings** - See `json-utils.ts:218`:
   ```typescript
   implementation: typeof module.implementation === "function"
     ? module.implementation.toString()  // ← Stringified!
     : module.implementation,
   ```

3. **Closures don't survive** - When a function is stringified and re-evaluated, any captured variables from the outer scope are lost

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

### ⚠️ Key Function Implementation Challenge

**The key function has the same serialization issue as reduce's reducer.**

When `keyFn` is read from storage, it becomes a string, not a function. However, mapByKey has better workaround options:

**Option 1: String-Based Key Path (Recommended)**
```typescript
// Instead of a function, use a property path string
const analyses = mapByKey(articles, "id", a => analyze(a));
// or
const analyses = mapByKey(articles, ["nested", "id"], a => analyze(a));
```

This is similar to React's `key` prop - just specify which property to use as the key.

**Option 2: Default to Identity**
```typescript
// When item IS the key (e.g., URLs)
const fetches = mapByKey(urls, url => fetchData({ url }));
// Internally: key = JSON.stringify(item)
```

**Option 3: ts-Transformer Support**

The key function could be transformed like map closures:
```typescript
// User writes:
mapByKey(items, item => item.type + ":" + item.id, ...)

// Transformed to:
mapByKeyWithPattern(items, "keyFn",
  recipe(({ element }) => element.type + ":" + element.id), ...)
```

### Key Function Design (Revised)

Given serialization constraints, the recommended API uses property paths instead of functions:

```typescript
// Identity: URL is the key (default when no key specified)
const fetches = mapByKey(urls, url => fetchData({url}));

// Property path: article.id is the key
const analyses = mapByKey(articles, "id", a => analyze(a));

// Nested property path
const results = mapByKey(items, ["nested", "id"], ...);

// Composite key (requires ts-transformer)
const results = mapByKey(items, item => `${item.type}:${item.id}`, ...);
```

**Why property path instead of function?**
- Property paths are JSON-serializable
- Covers 90% of use cases (keying by ID)
- No closure serialization issues
- ts-transformer can handle complex cases

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

## Part 4: Revised Implementation Plan

### ⚠️ Critical Path Dependency

The original implementation plan assumed we could pass functions as runtime data.
**This is not possible.** The plan must be revised.

### Phase 1: Validate Workarounds - ✅ COMPLETED

**Experiment A: derive() with array.reduce()** - FAILED

Created `patterns/jkomoros/WIP/reduce-experiment.tsx` to test:
```typescript
const completed = derive([analyses], (items) => {
  return items.reduce((acc, item) => {
    if (item.pending) return acc;  // Does this work?
    return [...acc, item.result];
  }, []);
});
```

**Results:** TypeScript compilation errors confirm derive does NOT unwrap:
```
[ERROR] Operator '+' cannot be applied to types 'number' and 'Cell<number[]>'
[ERROR] Property 'pending' does not exist on type 'Cell<LLMResult[]>'
```

**Conclusion:** derive() passes proxied Cells, not unwrapped values. Array items remain as OpaqueCell proxies.

**Experiment B: Check types** - CONFIRMED

Inside derive callback:
- `items` is `OpaqueCell<T[]>` or `Cell<T[]>`, not `T[]`
- `items[0]` is also proxied, not the unwrapped value
- Properties like `.pending` don't exist on the Cell type

**Result: derive() workaround is NOT viable. We need a new primitive.**

### Phase 2: reduce() Module Factory (2-3 days)

If derive() doesn't unwrap, implement reduce as a module factory (NOT a builtin):

**Files to modify:**
- `packages/runner/src/builder/module.ts` (add reduce export)
- `packages/ts-transformers/src/transformers/builtins/reduce.ts` (new transformer)
- `packages/patterns/src/index.ts` (export for patterns)

**Implementation:**
```typescript
// In module.ts
export function reduce<T, R>(
  list: Opaque<T[]>,
  initial: R,
  reducer: (acc: R, item: T, index: number) => R,
): OpaqueRef<R> {
  return lift((inputs: { list: T[]; initial: R }) => {
    if (!inputs.list) return inputs.initial;
    return inputs.list.reduce(reducer, inputs.initial);
  })({ list, initial });
}
```

**ts-transformer work:**
- Recognize `reduce(list, initial, reducer)` calls
- Transform reducer closure to capture variables
- Generate schema types from TypeScript types

**Risk:** May need to understand how derive transformer works and replicate pattern.

### Phase 3: mapByKey() Builtin (3-5 days)

**More feasible** because the operation recipe follows the same pattern as map().

**Files to modify:**
- `packages/runner/src/builtins/map-by-key.ts` (new builtin)
- `packages/runner/src/builtins/index.ts` (registration)
- `packages/ts-transformers/src/transformers/closure.ts` (add mapByKey recognition)

**Key implementation decisions:**

1. **Key extraction:** Use property path strings instead of functions
   ```typescript
   // Instead of: mapByKey(items, i => i.id, ...)
   // Use: mapByKey(items, "id", ...)  // Property path
   ```

2. **Key-based createRef:** Change from `{ result, index }` to `{ result, key }`
   ```typescript
   resultCell = runtime.getCell(
     parentCell.space,
     { result, key: JSON.stringify(keyValue) },  // Key-based identity
     undefined,
     tx,
   );
   ```

3. **Cleanup tracking:** Need to track and stop orphaned result cells
   ```typescript
   const keyToResultCell = new Map<string, Cell<any>>();
   // When key disappears from list, call runtime.runner.stop(resultCell)
   ```

**Test cases (with property paths):**
```typescript
// Key stability across reordering (key = item value)
const urls = cell(["a", "b", "c"]);
const fetches = mapByKey(urls, url => fetchData({ url }));  // Default: key = item
urls.set(["c", "b", "a"]);  // No new fetches - same keys, different order

// Property path key
const articles = cell([{id: 1, text: "..."}, {id: 2, text: "..."}]);
const analyses = mapByKey(articles, "id", a => analyze(a.text));
```

### Phase 4: ts-transformers for mapByKey (2-3 days)

**Files to modify:**
- `packages/ts-transformers/src/transformers/closure.ts`

**Steps:**
1. Add `mapByKey` to list of recognized reactive array methods
2. Transform the operation callback (same as map)
3. Handle key function if it's a lambda (convert to recipe or property path)

**Challenge:** Deciding whether key functions need transformation or should be limited to property paths.

### Phase 5: Testing & Documentation (1-2 days)

**Test files needed:**
- `packages/runner/src/builtins/map-by-key.test.ts`
- Integration tests for streaming pipelines

**Documentation:**
- Update `docs/common/PATTERNS.md` with mapByKey examples
- Document property path syntax for keys

---

### Revised Total Estimated Effort

| Phase | Effort | Risk |
|-------|--------|------|
| 1. Validate workarounds | 1-2 days | LOW - just experiments |
| 2. reduce() module factory | 2-3 days | MEDIUM - needs ts-transformer work |
| 3. mapByKey() builtin | 3-5 days | MEDIUM - similar to map but key management |
| 4. ts-transformers | 2-3 days | HIGH - complex AST transformation |
| 5. Testing & docs | 1-2 days | LOW |

**Total: 9-15 days** (vs original estimate of 5-9 days)

**Recommendation:** Start with Phase 1 experiments to validate whether derive() already solves the problem. If it does, reduce() may not be needed.

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

## Summary (Revised After Critical Analysis)

### Key Findings

After deep research into the framework implementation:

1. **Functions cannot be passed as runtime data to builtins** - they get serialized to strings, losing closures

2. **derive() and computed() are NOT builtins** - they use `lift()` to make the function a module implementation at compile time

3. **mapByKey() is more feasible than reduce()** - the operation is a Recipe (like map), but the key function needs special handling

4. **ts-transformers are required** for any solution involving user-provided functions

### Recommended Path Forward

| Priority | Approach | Effort | Risk |
|----------|----------|--------|------|
| 1 | Test if derive() with array.reduce() already works | 1-2 days | LOW |
| 2 | Implement mapByKey() with property path keys | 3-5 days | MEDIUM |
| 3 | Add reduce() as module factory (like derive) | 2-3 days | MEDIUM |
| 4 | ts-transformer support for both | 2-3 days | HIGH |

### What Actually Works

**mapByKey() core mechanism is sound:**
```typescript
// Key-based createRef works
resultCell = runtime.getCell(space, { result, key }, ...);
// Same key → same entity ID → same result cell
```

**Key extraction should use property paths:**
```typescript
// Instead of functions (serialization issues)
mapByKey(items, "id", item => process(item))  // Property path

// Not functions (closure loss)
mapByKey(items, item => item.id, item => process(item))  // ❌
```

**reduce() needs module factory approach:**
```typescript
// In module.ts (framework change)
export function reduce<T, R>(list: Opaque<T[]>, initial: R, reducer: ...) {
  return lift(inputs => inputs.list.reduce(reducer, inputs.initial))({ list, initial });
}
```

### What Doesn't Work

**Original reduce() builtin approach:**
```typescript
// ❌ reducer function can't survive serialization
reduce(analyses, {
  reducer: (acc, item) => { ... }  // Lost when stored
});
```

**Key functions as runtime data:**
```typescript
// ❌ keyFn can't survive serialization
mapByKey(items, item => item.complex.key, ...)
```

### Immediate Next Steps

1. **Experiment:** Test derive() with array.reduce() to see if it unwraps items
2. **Design:** Finalize mapByKey API with property path keys
3. **Discuss:** Review this document with framework authors
4. **Prototype:** Build mapByKey builtin with property path support

---

**Document History:**
- 2025-11-27: Initial draft (v1)
- 2025-11-27: Added Quick Start, Gotchas, detailed implementation (v2)
- 2025-11-27: **Critical revision (v3)** - Identified function serialization blocker, revised implementation plan, recommended property path approach for keys
