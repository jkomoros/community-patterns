# Map Only Over Cell Arrays, Use Fixed Slots for Variable Data

## Observation

When using the "dumb map approach" in Common Tools patterns, you can only call `.map()` on:
1. **Pattern inputs** (cell arrays passed to the pattern)
2. **Outputs from previous `.map()` calls** (which return cell arrays)

You CANNOT call `.map()` on:
- `derive()` results (returns plain JavaScript values)
- Arrays created with `Array.from()`, spread, or other JS array methods
- Any dynamically computed arrays

## The Fixed Slots Insight

If you need to process a variable number of items (e.g., 0-10 URLs extracted from an article), you can use a **fixed slots approach**:

1. Define a maximum number of slots (e.g., `MAX_URLS = 2`)
2. In your `.map()` callback, extract up to that many items
3. Use `derive()` to get specific slots: `slot0`, `slot1`, etc.
4. Process each slot through the pipeline with `ifElse()` for null handling

This works because the NUMBER of outputs per input is fixed (e.g., always 2 slots), even if some slots are null/empty.

## Example: Processing First URL Per Article

```typescript
// WORKS: Map over input cell, extract first URL, process it
const articleProcessing = articles.map((article) => {
  const extraction = generateObject({ ... });

  // Get first URL (fixed: always 1 slot)
  const firstUrl = derive(extraction, (ext) => ext?.result?.urls?.[0] || null);

  // Process with null handling
  const content = ifElse(
    firstUrl,
    fetchData({ url: firstUrl, ... }),
    null
  );

  return { article, firstUrl, content };
});
```

## Example: Processing Two URLs Per Article (Fixed Slots)

```typescript
const articleProcessing = articles.map((article) => {
  const extraction = generateObject({ ... });

  // Fixed 2 slots
  const url0 = derive(extraction, (ext) => ext?.result?.urls?.[0] || null);
  const url1 = derive(extraction, (ext) => ext?.result?.urls?.[1] || null);

  // Process each slot
  const content0 = ifElse(url0, fetchData({ ... }), null);
  const content1 = ifElse(url1, fetchData({ ... }), null);

  return { article, url0, content0, url1, content1 };
});
```

## What DOESN'T Work

```typescript
// FAILS: Can't map over derive result
const allUrls = derive(articles, (list) =>
  list.flatMap(a => a.extraction?.result?.urls || [])
);
const processed = allUrls.map(...); // ERROR: mapWithPattern is not a function

// FAILS: Can't map over Array.from()
const slots = Array.from({ length: 10 }, (_, i) => i);
const processed = slots.map(...); // Not a reactive cell array
```

## Two Phases: Map Chains vs Derive Aggregation

A key architectural insight: pipelines have two distinct phases:

### Phase 1: Map Chains (Reactive Processing)
```
input.map() → process → [fetch, classify, summarize, ...]
```
This is where the "fixed slots" constraint applies. Each input produces exactly one output with a predictable structure.

### Phase 2: Derive Aggregation (Read-Only Combining)
```typescript
const deduplicated = derive(processedItems, (items) => {
  // Arbitrary JS is fine here - loops, Maps, deduplication, grouping
  const byUrl = new Map();
  for (const item of items) {
    // Group, dedupe, combine however you want
  }
  return Array.from(byUrl.values());
});
```

**The key insight:** `derive()` can do arbitrary JavaScript for aggregation/deduplication/grouping. It returns plain JS values for display. You just can't call `.map()` on the result to start another reactive chain.

So use:
- **Map chains** for per-item processing pipelines (L1→L2→L3→L4→L5)
- **Derive** for combining/deduplicating results after processing is complete

## Why This Works

The framework needs to know the structure of outputs at compile time. When you map over a cell array with a fixed transformation, each input produces a predictable output structure. Dynamic arrays break this because the framework can't track reactivity through arbitrary JavaScript array operations.

## Tags

- reactivity
- map
- derive
- dumb-map-approach
- fixed-slots

## Confirmation Status

- **First observed**: 2025-11-29
- **Confirmed by**: Not yet confirmed by others
- **Needs**: Framework author confirmation on the "fixed slots" principle
