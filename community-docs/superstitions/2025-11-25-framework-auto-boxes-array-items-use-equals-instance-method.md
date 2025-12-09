# PROMOTED TO FOLK WISDOM

**This superstition has been promoted to folk wisdom.**

See: `community-docs/folk_wisdom/reactivity.md` - "Use .equals() Instance Method for Cell Comparison in Arrays"

---

**Original content preserved below.**

---

# Framework Auto-Boxes Array Items; Use .equals() Instance Method for Cell Comparison

## Summary

When working with arrays in CommonTools patterns, the framework automatically "boxes" array items into Cells at runtime. You should:
1. Declare input types as plain arrays (`Default<Item[], []>`)
2. Type handler parameters as boxed (`Cell<Array<Cell<Item>>>`)
3. Use the `.equals()` **instance method** for Cell comparison, not `===` or `Cell.equals()`

## The Pattern

### Input Declaration (Plain Array)
```typescript
interface MyInput {
  items: Default<Item[], []>;  // Plain array type
}
```

### Handler Parameter Type (Boxed)
```typescript
const removeItem = handler<
  unknown,
  { items: Cell<Array<Cell<Item>>>; item: Cell<Item> }  // Boxed type
>((_event, { items, item }) => {
  const currentItems = items.get();

  // Use .equals() INSTANCE METHOD for Cell comparison
  const index = currentItems.findIndex((el) => el.equals(item));

  if (index >= 0) {
    items.set(currentItems.toSpliced(index, 1));
  }
});
```

### Pushing Items (Plain Objects)
```typescript
// Framework auto-boxes - just push plain objects
items.push({ name: "New Item", done: false });
```

### JSX Mapping (Cells Available)
```typescript
{items.map((item, index) => (
  // 'item' is a Cell<Item> here
  <ct-button onClick={removeItem({ items, item })}>
    Remove
  </ct-button>
))}
```

## Why This Matters

### Cell Identity Comparison Fails with `===`
```typescript
// BROKEN: Cell identity comparison with === doesn't work reliably
const index = opts.findIndex(opt => opt === optionCell);  // Returns -1!
```

The Cell reference from `.map()` iteration may be a different proxy/wrapper than the Cell in the array, so `===` comparison fails.

### Use `.equals()` Instance Method
```typescript
// WORKS: .equals() instance method compares Cell identity correctly
const index = opts.findIndex(opt => opt.equals(optionCell));  // Works!
```

## Context Differences

### Inside Handlers: Cells Available
```typescript
const myHandler = handler<unknown, { items: Cell<Array<Cell<Item>>> }>(
  (_, { items }) => {
    const currentItems = items.get();
    // currentItems is Array<Cell<Item>>
    // Each element has .get(), .key(), .equals() methods
    currentItems[0].get().name;  // Access item property
    currentItems[0].key("name").set("New Name");  // Mutate via Cell
  }
);
```

### Inside derive(): Plain Values
```typescript
derive({ items }, ({ items }) => {
  // items is UNWRAPPED to Item[] (plain objects)
  // No .get() or .key() methods available
  const found = items.find(item => item.name === "foo");  // Direct property access
});
```

## Complete Example: Manual Reordering

```typescript
interface Option {
  name: string;
  rank: number | null;
}

interface MyInput {
  options: Default<Option[], []>;  // Plain array
}

// Move option up in the list
const moveUp = handler<
  unknown,
  { optionCell: Cell<Option>; optionsCell: Cell<Array<Cell<Option>>> }
>(
  (_, { optionCell, optionsCell }) => {
    const opts = optionsCell.get();

    // Use .equals() instance method!
    const index = opts.findIndex(opt => opt.equals(optionCell));

    if (index <= 0) return; // Already at top

    // Swap Cell references
    const newOpts = [...opts];
    [newOpts[index - 1], newOpts[index]] = [newOpts[index], newOpts[index - 1]];

    // Update rank via .key()
    newOpts[index - 1].key("rank").set(index);
    newOpts[index].key("rank").set(index + 1);

    optionsCell.set(newOpts);
  }
);

// In JSX
{options.map((optionCell, index) => (
  <ct-button onClick={moveUp({ optionCell, optionsCell })}>
    Move Up
  </ct-button>
))}
```

## Reference Pattern

See `labs/packages/patterns/array-in-cell-with-remove-editable.tsx` for the canonical example of this pattern.

## Related Patterns

- **Pass Cells as Handler Parameters** - Essential for accessing Cells from .map() contexts
- **Derive Unwraps to Plain Values** - Understanding what you get inside derive callbacks
- **Handler Parameter Pattern** - General pattern for preserving Cell references

## Metadata

```yaml
topic: Cell, arrays, boxing, equals, identity-comparison, reordering
discovered: 2025-11-25
confirmed_count: 1
last_confirmed: 2025-11-25
sessions: [smart-rubric-phase-4]
related_functions: Cell, handler, derive, equals, map, findIndex
stars: 3
```
