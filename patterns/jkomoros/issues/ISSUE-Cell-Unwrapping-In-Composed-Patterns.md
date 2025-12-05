# Issue: Cell Values Not Unwrapped in Derived Callbacks for Composed Patterns

**Date:** 2025-12-04
**Reporter:** jkomoros
**Severity:** Medium (workaround exists but feels fragile)
**Component:** search-select.tsx (lib pattern for composition)

## Problem Statement

When a pattern receives a `Cell<T>` as an input prop and uses it in `derive()` with array syntax, the callback sometimes receives the Cell object itself rather than the unwrapped value. This requires manual `.get()` calls inside derive callbacks, which contradicts the expected behavior.

## Expected Behavior

According to documentation and folk wisdom, `derive([cell], ([value]) => ...)` should auto-unwrap the cell and pass the primitive/object value to the callback.

## Actual Behavior

When a Cell is **passed as a prop from a parent pattern to a child pattern**, the derive callback receives the Cell object, not the unwrapped value.

## Reproduction

### Parent Pattern (search-select-test.tsx)
```typescript
export default pattern<TestInput>(({ initialSelected }) => {
  // Create local cell
  const selected = cell<string[]>(initialSelected || []);

  // Pass cell to child pattern
  const selector = SearchSelect({
    items: RELATIONSHIP_ITEMS,
    selected: selected,  // <-- Passing Cell as prop
  });
  // ...
});
```

### Child Pattern (search-select.tsx)
```typescript
interface SearchSelectInput {
  items: Default<SearchSelectItem[], []>;
  selected: Cell<string[]>;  // <-- Declared as Cell type
}

export default pattern<SearchSelectInput, SearchSelectOutput>(
  ({ items, selected }) => {
    // This SHOULD work but doesn't:
    const availableItems = derive(
      [normalizedItems, selected],
      ([itemList, sel]: [NormalizedItem[], string[]]) => {
        // BUG: `sel` is a Cell object, not string[]
        // sel.includes() throws: "includes is not a function"
        return itemList.filter((item) => !sel.includes(item.value));
      }
    );
  }
);
```

### Error
```
TypeError: Cannot read properties of undefined (reading 'includes')
```

The error occurs because `sel` is a Cell object, and accessing `.includes()` on it fails.

## Workaround

Created a `safeUnwrap()` helper that defensively checks if a value is a Cell and unwraps it:

```typescript
function safeUnwrap<T>(value: T | Cell<T> | undefined, defaultValue: T): T {
  if (value === undefined || value === null) return defaultValue;
  const v = value as any;
  if (
    typeof v === "object" &&
    typeof v.get === "function" &&
    typeof v.set === "function" &&
    !(v instanceof Map) &&
    !(v instanceof Set)
  ) {
    return v.get() ?? defaultValue;
  }
  return value as T;
}
```

### Why the workaround is fragile

1. **Duck typing Cells**: We detect Cells by checking for `.get()` and `.set()` methods. This could false-positive on other objects.

2. **Must exclude Map/Set**: JavaScript's `Map` and `Set` have `.get()` methods, so we must explicitly exclude them. If other built-in types have `.get()`, they'd also need exclusion.

3. **Framework internals assumption**: We're assuming Cell objects always have both `.get()` and `.set()`. If Cell implementation changes, this breaks.

4. **Performance**: Every derive callback now has extra type-checking overhead.

5. **Type safety lost**: We use `as any` casts, losing TypeScript's protection.

## Questions for Framework Authors

1. **Is this intentional?** Should prop-passed Cells auto-unwrap in derive, or is manual unwrapping expected?

2. **Why the inconsistency?** Locally-created cells seem to unwrap correctly, but prop-passed cells don't. What's different about the code path?

3. **Is there a better pattern?** Should we:
   - Not declare props as `Cell<T>` types?
   - Use a different mechanism for bidirectional binding?
   - Use a framework-provided unwrap utility?

4. **Cell detection**: Is there a canonical way to check if something is a Cell? (e.g., `isCell(value)` utility, or a symbol we can check)

## Context: Why We Need Bidirectional Cell Binding

The search-select component needs to:
1. Read the current selection from parent
2. Modify the selection when user selects/deselects items
3. Have changes propagate back to parent

The pattern of passing `Cell<T>` as a prop seemed like the right approach based on PATTERNS.md documentation about pattern composition with shared cells.

## Test Case

Space: `jkomoros-test-search-select`
Pattern: `search-select-test.tsx`
Working version (with safeUnwrap): Charm ID `baedreidrxarqxtyxoum7drr2pruf3d4mxy5l3fbcrzocpzbbvpkjgo5vju`

## Related

- Folk wisdom: `community-docs/folk_wisdom/derive-object-parameter-cell-unwrapping.md`
- This may be related to the object-parameter unwrapping issue, but occurs even with array syntax
