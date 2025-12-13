# Use computed() Instead of derive() for Reactive Transformations

**BLESSED** - Framework author confirmed guidance (December 2025)

## Summary

**Always use `computed()` instead of `derive()` for reactive transformations in JSX.**

The framework author explicitly stated: "You should just never rely on derives, ONLY use computed()."

## Why This Matters

While `computed()` and `derive()` are technically the same function internally (both use `lift()`), there are practical differences in how they behave, especially when:

1. **Handlers are involved** - `derive()` wraps Cell references as read-only proxies, causing `ReadOnlyAddressError` when handlers try to write
2. **Complex reactive contexts** - `computed()` has more predictable behavior in nested reactive scenarios
3. **Future framework changes** - `computed()` is the preferred modern API

## The Problem with derive()

```typescript
// ❌ AVOID - derive() can cause ReadOnlyAddressError with handlers
{derive({ items, selectedId }, ({ items, selectedId }) => {
  return (
    <div>
      {items.map(item => (
        <ct-button onClick={selectItem({ selectedId, itemId: item.id })}>
          Select
        </ct-button>
      ))}
    </div>
  );
})}
```

When handlers are bound inside `derive()` callbacks, Cell references become read-only proxies. Any `.set()` call fails with `ReadOnlyAddressError`.

## The Solution: Use computed()

```typescript
// ✅ CORRECT - computed() for reactive transformations
const itemList = computed(() => {
  const currentItems = items.get();
  return currentItems.map(item => ({
    ...item,
    isSelected: item.id === selectedId.get()
  }));
});

// Handlers OUTSIDE computed, using plain Cell references
const handleSelect = handler<unknown, { selectedId: Cell<string>; itemId: string }>(
  (_, { selectedId, itemId }) => {
    selectedId.set(itemId);
  }
);

// JSX uses computed values for display, handlers bound with real Cells
return {
  [UI]: (
    <div>
      {itemList.map(item => (
        <ct-button onClick={handleSelect({ selectedId, itemId: item.id })}>
          {item.isSelected ? "Selected" : "Select"}
        </ct-button>
      ))}
    </div>
  )
};
```

## Key Patterns

### Pattern 1: Computed for Data, Direct JSX for Handlers

```typescript
// Compute derived data outside JSX
const sortedItems = computed(() =>
  [...items.get()].sort((a, b) => a.name.localeCompare(b.name))
);

const filteredItems = computed(() =>
  sortedItems.get().filter(item => item.active)
);

// JSX with direct handler binding (not inside derive)
return {
  [UI]: (
    <div>
      {filteredItems.map(item => (
        <div key={item.id}>
          <span>{item.name}</span>
          <ct-button onClick={deleteItem({ items, itemId: item.id })}>
            Delete
          </ct-button>
        </div>
      ))}
    </div>
  )
};
```

### Pattern 2: Conditional UI with ifElse (Not derive)

```typescript
// ❌ AVOID
{derive(isLoading, (loading) => loading ? <Loading /> : <Content />)}

// ✅ CORRECT
{ifElse(isLoading, <Loading />, <Content />)}
```

### Pattern 3: Complex Conditional Logic

For complex conditions, compute them first:

```typescript
const shouldShowButton = computed(() => {
  const hasItems = items.get().length > 0;
  const isReady = status.get() === "ready";
  return hasItems && isReady;
});

// Use computed value in JSX
{ifElse(shouldShowButton,
  <ct-button onClick={submitHandler({ items })}>Submit</ct-button>,
  null
)}
```

## Migration Guide

If you have existing `derive()` usage:

1. **For pure display transformations**: Keep derive() or switch to computed() - both work fine when no handlers are involved
2. **For UI with handlers**: Replace with computed() + ifElse pattern
3. **For complex conditional rendering**: Break into computed values + ifElse

## Related Documentation

- `folk_wisdom/reactivity.md` - General reactivity patterns
- `superstitions/2025-12-03-prebind-handlers-outside-derive.md` - Workaround (use computed instead)
- `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` - Official docs

## Metadata

```yaml
topic: computed, derive, reactivity, handlers, JSX
blessed_date: 2025-12-12
source: Framework author explicit guidance
related_functions: computed, derive, handler, ifElse
status: blessed
```

## Guestbook

- 2025-12-12 - Framework author confirmed: "You should just never rely on derives, ONLY use computed()" (jkomoros - extracurricular-selector pattern)
