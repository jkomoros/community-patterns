# Reactive References from .map() Cannot Be Passed to Handlers

**Date:** 2026-01-15
**Status:** confirmed
**Confidence:** high
**Stars:** 5

## TL;DR - The Rule

**Never pass the item object from a `.map()` callback to an event handler.** The item is a reactive reference that cannot be accessed outside its reactive context.

```tsx
// BROKEN - Passing reactive item to handler
{items.map((item) => (
  <button onClick={deleteItem({ items, item })}>  // ERROR!
    Delete
  </button>
))}

// CORRECT - Pass index (primitive) instead
{items.map((item, index: number) => (
  <button onClick={deleteItem({ items, index })}>
    Delete
  </button>
))}
```

**Error message:** `Tried to access a reactive reference outside a reactive context`

---

## Summary

When you iterate over a reactive array with `.map()`, each `item` is a reactive reference bound to that iteration context. Passing this reference to a handler fails because:

1. The handler runs in a different context (`inHandler: true`)
2. The reactive reference is no longer valid outside its original context
3. Accessing properties on the item throws the "reactive reference outside context" error

**The fix:** Pass primitive values (like `index`) that aren't reactive references. The handler can then use the index to look up the item from the array Cell.

## The Pattern

This is the canonical pattern used in `simple-list.tsx` and other working examples:

```tsx
// 1. Define handler with index + array Cell
const deleteItem = handler<
  unknown,
  { items: Writable<Item[]>; index: number }
>((_event, { items, index }) => {
  const current = items.get() || [];
  if (index < 0 || index >= current.length) return;
  items.set(current.toSpliced(index, 1));
});

// 2. Use in .map() with index parameter
{items.map((item, index: number) => (
  <button onClick={deleteItem({ items, index })}>
    Delete {item.name}
  </button>
))}
```

## What Doesn't Work

### Passing item object to handler

```tsx
const deleteItem = handler<unknown, { items: Writable<Item[]>; item: Item }>(
  (_event, { items, item }) => {
    // ERROR: item is reactive ref from .map() context
    const idx = items.get().findIndex((i) => equals(item, i));
    items.set(items.get().toSpliced(idx, 1));
  }
);

{items.map((item) => (
  <button onClick={deleteItem({ items, item })}>Delete</button>  // BROKEN
))}
```

### Using equals() with item from callback

```tsx
{items.map((item) => (
  <button onClick={() => {
    const current = items.get();
    // ERROR: accessing item.* inside handler
    const idx = current.findIndex((i) => equals(item, i));
    items.set(current.toSpliced(idx, 1));
  }}>
    Delete
  </button>
))}
```

### Capturing item properties in closure

```tsx
{items.map((item) => {
  const itemName = item.name;  // Still a reactive access!
  return (
    <button onClick={() => {
      // ERROR: itemName came from reactive context
      const idx = items.get().findIndex((i) => i.name === itemName);
      items.set(items.get().toSpliced(idx, 1));
    }}>
      Delete
    </button>
  );
})}
```

## Why Index Works

Index is a **primitive number**, not a reactive reference:

1. **Primitives have no reactive wrapper** - The number `0` is just `0`
2. **Safe to pass anywhere** - No context binding issues
3. **Handler uses index to lookup** - Gets fresh item from `items.get()[index]`

```tsx
const moveUp = handler<unknown, { items: Writable<Item[]>; index: number }>(
  (_event, { items, index }) => {
    if (index <= 0) return;

    const current = items.get();
    const newOrder = [...current];
    // Swap using index - no reactive refs involved
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    items.set(newOrder);
  }
);
```

## Reference Implementation

See `packages/patterns/simple-list.tsx` in labs:

- Lines 59-83: Handler definitions with `{ items, index }` signature
- Lines 107-205: `.map()` usage with `onClick={handler({ items, index })}`

Also see `packages/patterns/parking-coordinator.tsx`:
- `movePriorityUpByIndex`, `movePriorityDownByIndex`, `removePersonByIndex`

## When You Might Think This Works (But Doesn't)

The `todo-list.tsx` pattern appears to use `equals(item, el)` inside an inline onClick:

```tsx
{items.map((item) => (
  <ct-button
    onClick={() => {
      const current = items.get();
      const index = current.findIndex((el) => equals(item, el));
      if (index >= 0) {
        items.set(current.toSpliced(index, 1));
      }
    }}
  >
    ×
  </ct-button>
))}
```

This works **sometimes** because:
- The inline arrow function captures the reactive context
- UI callbacks may run in a compatible context
- The `items` being iterated is the same Cell being mutated

But this pattern is **fragile** and fails in more complex scenarios like:
- Nested patterns
- Handler bindings instead of inline arrows
- When items come from derived/computed sources

**The index-based pattern is always safe.**

## Debugging Tips

If you see this error:
```
Error: Tried to access a reactive reference outside a reactive context
```

1. Check if you're passing an item from `.map()` to a handler
2. Change to index-based lookup
3. Define handlers outside `.map()`, not inline

## Key Takeaway

**Always use index (or other primitives like ID strings) when passing data from `.map()` to handlers. Never pass the item object itself.**

---

## Related

- [2026-01-08: computed() inside .map() infinite loops](./2026-01-08-computed-inside-map-callback-infinite-loop.md)
- [2025-12-14: inline computed in .map() is fine](./2025-12-14-inline-computed-in-map-is-fine.md)
