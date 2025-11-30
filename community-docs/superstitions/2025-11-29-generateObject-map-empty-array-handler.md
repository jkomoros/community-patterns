# generateObject with map() requires empty array + handler pattern

**Date:** 2025-11-29
**Confidence:** HIGH (verified with working pattern)
**Related patterns:** `map-test-100-items.tsx`, `prompt-injection-tracker.tsx`

## The Problem

When using `generateObject` inside a `.map()` over an array, pre-populating the array with data in the `Default` type causes the LLM extraction to return no results (empty `result` field).

## What Doesn't Work

```typescript
// DON'T DO THIS - LLM results will be empty
const TEST_DATA = [{ id: "1", content: "..." }, ...];

interface Input {
  items: Default<Item[], typeof TEST_DATA>;  // Pre-populated
}

export default pattern<Input, Output>(({ items }) => {
  const extractions = items.map((item) => ({
    extraction: generateObject({
      prompt: item.content,
      schema: MY_SCHEMA,
    }),
  }));
  // extraction.result will be undefined even when pending is false!
});
```

## What Works

```typescript
// DO THIS - start empty, use handler to add items
const TEST_DATA = [{ id: "1", content: "..." }, ...];

const loadItems = handler<unknown, { items: Cell<Item[]> }>(
  (_event, { items }) => {
    for (const item of TEST_DATA) {
      items.push(item);
    }
  }
);

interface Input {
  items: Default<Item[], []>;  // Start EMPTY
}

export default pattern<Input, Output>(({ items }) => {
  const extractions = items.map((item) => ({
    extraction: generateObject({
      prompt: item.content,
      schema: MY_SCHEMA,
    }),
  }));

  return {
    [UI]: (
      <div>
        <button onClick={loadItems({ items })}>Load Items</button>
        {/* ... */}
      </div>
    ),
  };
});
```

## Key Points

1. **Start with empty array**: `Default<Item[], []>` not `Default<Item[], typeof DATA>`
2. **Use handler to push items**: Create a handler that calls `items.push(item)` for each item
3. **Trigger via UI**: Add a button or other mechanism to trigger the handler
4. **Same pattern as map-test-100-items.tsx**: This is how the verified working example does it

## Why This Matters

The difference between these two approaches is significant:
- Pre-populated: `extraction.result` is `undefined` even when `pending: false`
- Handler-pushed: `extraction.result` contains the actual LLM response

## Symptoms of the Problem

- `pending: false` but no `result` field in the extraction
- Items show as "completed" but with 0 results
- No LLM API calls visible in network tab (may be short-circuited)

## Verification

This was verified by:
1. Trying pre-populated approach - got 0 links extracted from articles with many URLs
2. Switching to empty array + handler - got 12 links extracted correctly
3. Pattern matches working `map-test-100-items.tsx` reference implementation
