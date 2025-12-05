# ISSUE: Styles Inside .map() Don't Update Reactively When Dependent Cells Change

**Date:** 2025-12-05
**Reporter:** jkomoros
**Status:** Open - Needs Framework Clarification
**Component:** search-select

## Summary

When rendering a list with `.map()` and using a style property that depends on an external cell, the style doesn't visually update when that cell changes, even when the value is pre-computed in a `derive()` or `computed()` outside the map.

## Reproduction

### Expected Behavior
When pressing ArrowDown, the visual highlight should move from "Colleague" to "Manager".

### Actual Behavior
The visual highlight stays on "Colleague", even though:
1. The `highlightedIndex` cell correctly updates to 1
2. The `selectHighlighted` handler correctly selects "Manager" when Enter is pressed
3. Pre-computed `filteredItemsWithHighlight` has correct `highlightBg` values

## Code Example

```typescript
// Pre-compute items with highlight state
const filteredItemsWithHighlight = derive(highlightedIndex, (idx) => {
  const idxVal = (idx as any).get ? (idx as any).get() : idx;
  return filteredItems.map((item, i) => ({
    ...item,
    highlightBg: i === idxVal ? "#e2e8f0" : "transparent",
  }));
});

// In JSX - style doesn't update when highlightedIndex changes
{filteredItems.map((item, index) => (
  <div style={{
    background: filteredItemsWithHighlight[index]?.highlightBg ?? "transparent",
  }}>
    {item.label}
  </div>
))}
```

## Approaches Tried (All Failed)

### 1. derive() with object params + .get()
```typescript
const filteredItemsWithHighlight = derive(
  { items: filteredItems, idx: highlightedIndex },
  ({ items, idx }) => {
    const idxVal = (idx as any).get ? (idx as any).get() : idx;
    return itemsVal.map((item, i) => ({
      highlightBg: i === idxVal ? "#e2e8f0" : "transparent",
    }));
  }
);
```
**Result:** Visual doesn't update

### 2. computed() with explicit .get()
```typescript
const filteredItemsWithHighlight = computed(() => {
  const idx = highlightedIndex.get();
  return filteredItems.map((item, i) => ({
    highlightBg: i === idx ? "#e2e8f0" : "transparent",
  }));
});
```
**Result:** Visual doesn't update

### 3. derive() with single cell dependency
```typescript
const filteredItemsWithHighlight = derive(highlightedIndex, (idx) => {
  const idxVal = (idx as any).get ? (idx as any).get() : idx;
  return filteredItems.map((item, i) => ({
    highlightBg: i === idxVal ? "#e2e8f0" : "transparent",
  }));
});
```
**Result:** Visual doesn't update

### 4. Direct inline comparison
```typescript
{filteredItems.map((item, index) => (
  <div style={{
    background: index === highlightedIndex ? "#e2e8f0" : "transparent",
  }}>
```
**Result:** Compile error - "This comparison appears to be unintentional because the types 'OpaqueCell<number> & number' and 'Cell<number>' have no overlap"

### 5. ifElse(computed(...)) inside map
```typescript
{filteredItems.map((item, index) => (
  <div style={{
    background: ifElse(
      computed(() => index === highlightedIndex.get()),
      "#e2e8f0",
      "transparent"
    ),
  }}>
```
**Result:** Visual doesn't update (and likely violates "no computed inside map" rule)

## Observations

1. **Internal state works correctly** - The `highlightedIndex` cell updates, and pressing Enter selects the correct item based on the updated index.

2. **Map indices are opaque** - The compile error shows that `index` inside `.map()` is `OpaqueCell<number> & number`, not a plain number.

3. **External cell references don't trigger re-render** - Even with pre-computation, the JSX inside `.map()` doesn't re-evaluate styles when external cells change.

4. **Similar superstition pattern works differently** - The `no-computed-inside-map` superstition shows a pattern that allegedly works:
```typescript
const listWithReadState = derive(
  { list: myList, read: readUrls },
  ({ list, read }) => list.map((item) => ({ ...item, isRead: read.includes(item.url) }))
);
{listWithReadState.map((item) => (
  <div style={{ opacity: item.isRead ? 0.6 : 1 }}>
```
**Difference:** Their ternary uses `item.isRead` (a property on the mapped item), not an external cell or index comparison.

## Questions for Framework Authors

1. Is this expected behavior? Is there a fundamental reason why styles depending on external cells can't update inside `.map()`?

2. Is there a correct pattern for achieving per-item reactive styles based on external state (like a "selected index")?

3. Should this be implemented as a built-in component (`ct-search-select`) to have full DOM access for proper reactivity?

4. Does the framework intentionally freeze/memoize the `.map()` output to prevent re-renders?

## Workaround

The component is **functionally complete** - keyboard navigation works correctly, only the visual highlight feedback is missing. Users can still navigate with arrow keys and press Enter to select.

## Test Spaces

- `jkomoros-test-search-select-v5` through `jkomoros-test-search-select-v8` demonstrate the various attempts

## Related Files

- `patterns/jkomoros/components/search-select.tsx` - The component
- `patterns/jkomoros/design/todo/search-select-component.md` - Design documentation
- `community-docs/superstitions/2025-11-29-no-computed-inside-map.md` - Related superstition
