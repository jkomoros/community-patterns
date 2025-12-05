# RESOLVED: Cell Values Not Unwrapped in Derived Callbacks for Composed Patterns

**Date:** 2025-12-04
**Resolved:** 2025-12-05
**Reporter:** jkomoros
**Resolution:** User error - was using undocumented API

## Resolution Summary

**This was NOT a framework bug.** The issue was caused by using an undocumented `derive([array])` array syntax that doesn't exist in the framework.

After reviewing the framework source code (`labs/packages/runner/src/builder/module.ts`), the `derive()` function signature is:
```typescript
export function derive<In, Out>(
  input: Opaque<In>,
  f: (input: In) => Out,
): OpaqueRef<Out>;
```

It takes a **single input**, not an array. The documented forms are:
- Single cell: `derive(cell, callback)`
- Object of cells: `derive({ a, b }, ({ a, b }) => ...)`

## Correct Pattern

Use `computed()` with explicit `.get()` calls inside:

```typescript
// CORRECT: Use computed() with .get()
const availableItems = computed(() => {
  const sel = selected.get();  // Explicitly unwrap the cell
  return normalizedItems.filter((item) => !sel.includes(item.value));
});
```

## Key Learnings

1. **Inside `computed()`, cells do NOT auto-dereference** - you MUST call `.get()`
2. **In JSX templates, cells DO auto-dereference** - `{cell.property}` works
3. **Handlers cannot capture values in closures** - pass values through handler state:
   ```typescript
   // WRONG: closure capture doesn't work
   const createHandler = (value) => handler((_, state) => { /* use value */ });

   // CORRECT: pass value through state
   const myHandler = handler((_, { selected, value }) => { /* use value */ });
   onClick={myHandler({ selected, value: item.value })}
   ```
4. **Cannot use reactive values as property keys** - inside JSX `.map()`, items are opaque proxies. Using `lookup[item.value]` triggers `Symbol.toPrimitive` conversion which throws "Tried to directly access an opaque value". Fix: pre-compute lookups inside `computed()` before JSX.

## Working Implementation

The search-select component now works correctly without any workarounds. See:
- `patterns/jkomoros/components/search-select.tsx` - the component
- `patterns/jkomoros/search-select-test.tsx` - test pattern
- Space: `jkomoros-test-search-select`

---

## Original Issue (for historical reference)

The original issue described problems with `derive([cell], ([value]) => ...)` array syntax not unwrapping cells. This syntax is not documented and should not be used. The framework examples consistently use `computed()` with explicit `.get()` calls instead.
