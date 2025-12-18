# Inline onClick Handlers Cannot Mutate Recipe Input Cells

**Source: Community debugging session, December 2025**

## Summary

Inline `onClick` handlers in JSX cannot call `.get()` or `.set()` on recipe input parameters. Use `handler()` functions instead.

## The Problem

```typescript
// DON'T DO THIS - will throw "cell.get is not a function"
<button onClick={() => {
  const current = myCell.get();  // ERROR!
  myCell.set({ ...current, value: newValue });
}}>
  Remove
</button>
```

## The Solution

```typescript
// DO THIS - use handler() function
const removeItem = handler<
  Record<string, never>,
  { myCell: Cell<MyData>; item: string }
>((_event, { myCell, item }) => {
  const current = myCell.get();  // Works!
  myCell.set({ ...current, items: current.items.filter(i => i !== item) });
});

// In JSX:
<button onClick={removeItem({ myCell, item })}>
  Remove
</button>
```

## Why This Happens

Recipe input parameters (the destructured args in your recipe function) are Cells, but when captured in an inline closure, they lose their Cell interface. The `handler()` utility properly passes Cell references through its context parameter.

## Common Scenarios

- Remove buttons on chips/tags
- Toggle buttons
- Any inline mutation of array items
- Delete buttons in lists

## Metadata

```yaml
topic: handlers, onClick, cells, recipes, jsx
observed_date: 2025-12-18
source: Community debugging - record.tsx pattern
error_message: "TypeError: cell.get is not a function"
```
