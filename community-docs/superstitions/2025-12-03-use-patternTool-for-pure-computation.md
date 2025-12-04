# Use patternTool for Pure Computation in generateObject Tools

**Date:** 2025-12-03
**Source:** Framework author (seefeldb) via PR #93
**Status:** Framework author guidance

## Summary

When passing tools to `generateObject()`:
- **Pure computation** (no side effects) → Use `pattern` + `patternTool`
- **Side effects** (modifying state, adding to lists) → Use `handler` + `result.set()`

## Framework Author Quote

> "that's a hack we added for handlers as tools, but in this example you should make a pattern and use `patternTool` to pass it in. Generally handlers are for when we have side effects (like adding something to a list) and pure computation should be patterns."

## Example: Pure Computation

```tsx
// Define a pattern for pure computation
const searchPattern = pattern<
  { query: string; database: Item[] },
  { results: Item[] }
>(({ query, database }) => {
  const results = derive({ query, database }, ({ query, database }) => {
    return database.filter(item => item.name.includes(query));
  });
  return { results };
});

// Use patternTool in generateObject
const result = generateObject({
  prompt: "Search for items about cats",
  schema: toSchema<SearchResult>(),
  tools: {
    search: patternTool(searchPattern, { database: items }),
  },
});
```

## Example: Side Effects (Use Handler)

```tsx
// Handler for side effects - adding to a list
const addItemHandler = handler<
  { name: string; result?: Cell<boolean> },
  { items: Cell<Item[]> }
>(
  (input, { items }) => {
    items.push({ name: input.name, id: Date.now() });
    if (input.result) {
      input.result.set(true);  // Must use result.set() for handler tools
    }
  }
);

const result = generateObject({
  prompt: "Add a new item called 'Widget'",
  schema: toSchema<AddResult>(),
  tools: {
    addItem: addItemHandler({ items }),
  },
});
```

## Why This Matters

- `patternTool` naturally returns values - no `result.set()` hack needed
- Handlers with `result.set()` is a hack that may change
- Separating pure computation from side effects is good architecture

## Related

- `2025-11-27-llm-handler-tools-must-write-to-result-cell.md` - The handler hack (for side effects only)

## Tags

`generateObject`, `tools`, `patternTool`, `handler`, `LLM`
