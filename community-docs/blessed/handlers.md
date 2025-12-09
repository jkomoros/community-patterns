# Handlers - Blessed ✓

Framework author approved community knowledge about handlers in CommonTools.

**Official docs:** `~/Code/labs/docs/common/PATTERNS.md`

---

## Define Handlers Outside the Pattern Function

**Blessed by:** Berni (verbal guidance)
**Date:** 2024-12-09
**Framework version:** Current

---

### The Rule

**Always define handler functions OUTSIDE the pattern function, not inside it.**

```typescript
// ✅ CORRECT: Handler defined outside pattern
const handleClick = handler(({ item }, { item: { type: z.string() } }) => {
  item.set("clicked");
});

export const pattern = ({ item }) => {
  return <button onClick={handleClick({ item })}>Click</button>;
};
```

```typescript
// ❌ WRONG: Handler defined inside pattern
export const pattern = ({ item }) => {
  // DON'T DO THIS
  const handleClick = handler(({ item }, { item: { type: z.string() } }) => {
    item.set("clicked");
  });

  return <button onClick={handleClick({ item })}>Click</button>;
};
```

### Why This Matters

Handlers defined inside the pattern function can **accidentally close over reactive values**:

```typescript
// ❌ DANGEROUS: Accidentally closes over reactive value
export const pattern = ({ items }) => {
  const count = derived(() => items.get().length);

  const handleAdd = handler(({ items }, schema) => {
    // BUG: This captures `count` at handler definition time
    // Not the current reactive value!
    console.log("Count was:", count.get()); // Stale!
    items.set([...items.get(), "new"]);
  });

  return <button onClick={handleAdd({ items })}>Add</button>;
};
```

When handlers are defined inside the pattern:
- They may capture reactive values from the enclosing scope
- These captured values may be stale when the handler executes
- No linting currently catches this mistake
- Can cause subtle, hard-to-debug reactivity issues

### The Safe Pattern

```typescript
// ✅ SAFE: Handler has no access to pattern's local reactive values
const handleAdd = handler(({ items }, { items: { type: itemsSchema } }) => {
  // Only has access to what's explicitly passed via arguments
  items.set([...items.get(), "new"]);
});

export const pattern = ({ items }) => {
  // Local reactive values stay local
  const count = derived(() => items.get().length);

  return (
    <div>
      <span>Count: {count}</span>
      <button onClick={handleAdd({ items })}>Add</button>
    </div>
  );
};
```

### Summary

| Location | Safe? | Reason |
|----------|-------|--------|
| Outside pattern function | ✅ Yes | Cannot close over reactive values |
| Inside pattern function | ❌ No | May accidentally close over stale values |

**Rule of thumb:** If your handler is inside the pattern, move it outside.

---

## Never Use await in Handlers

**Blessed by:** Berni (verbal guidance)
**Date:** 2024-12-09
**Framework version:** Current

---

### The Rule

**Never use `await` inside handler functions. It blocks the UI.**

```typescript
// ❌ WRONG: await blocks the entire UI
const handleFetch = handler(({ url, result }, schema) => {
  const response = await fetch(url.get());  // BLOCKS UI!
  const data = await response.json();        // BLOCKS UI!
  result.set(data);
});
```

```typescript
// ✅ CORRECT: Use fetchData for async operations
const { result, error, loading } = fetchData({
  url: url.get(),
  // ... options
});
```

### Why await Blocks the UI

When you use `await` in a handler:
1. The handler becomes an async function
2. The framework waits for the handler to complete
3. **The entire UI is blocked** while waiting
4. User cannot interact with anything until the async operation completes

### The Correct Approach

For async operations, use the reactive `fetchData` pattern:

```typescript
export const pattern = ({ url, results }) => {
  // Async fetch is reactive - doesn't block
  const { result, error, loading } = fetchData({
    url: url.get(),
  });

  // Handler just triggers the fetch by changing the URL
  const handleSearch = handler(({ url, query }, schema) => {
    url.set(`/api/search?q=${encodeURIComponent(query.get())}`);
  });

  return (
    <div>
      {loading.get() && <span>Loading...</span>}
      {error.get() && <span>Error: {error.get()}</span>}
      {result.get() && <Results data={result.get()} />}
      <button onClick={handleSearch({ url, query })}>Search</button>
    </div>
  );
};
```

### Current State

The framework currently doesn't error when you use `await` in handlers - this is only because the cleanup/enforcement hasn't been implemented yet. **Don't rely on this - it will break.**

### Summary

| Approach | Works? | Why |
|----------|--------|-----|
| `await` in handler | ❌ No | Blocks UI, will be disallowed |
| `fetchData` + reactive URL | ✅ Yes | Non-blocking, reactive |
| Handler triggers reactive flow | ✅ Yes | Handler just sets state |

**Rule of thumb:** Handlers should be synchronous state changes. Async operations go through `fetchData`.
