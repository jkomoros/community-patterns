# Framework Issue: `$checked` binding silently fails inside Cell.map()

**Date:** 2025-12-15
**Component:** Cell.map() + bidirectional bindings
**Type:** Design Limitation / Silent Failure
**Severity:** High (causes confusing UI thrashing and errors)

## Summary

Using `$checked={item.property}` (or any `$` bidirectional binding) inside `Cell.map()` **silently fails** because OpaqueRef proxies return values, not Cells, and `CellController.setValue()` ignores non-Cell targets.

The type system allows this pattern but it doesn't work at runtime. This creates confusing UI thrashing and "unexpected object when value was expected" console errors.

---

## Minimal Reproduction

### Code That Looks Correct But Fails

```typescript
interface Item {
  name: string;
  selected: boolean;  // or Default<boolean, true>
}

export default pattern<{ items: Cell<Item[]> }>(({ items }) => {
  return {
    [UI]: (
      <div>
        {items.map((item) => (
          <div>
            {/* TypeScript allows this, but it silently fails at runtime */}
            <ct-checkbox $checked={item.selected} />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    ),
  };
});
```

### What Happens

1. User clicks checkbox
2. `ct-checkbox.setChecked(true)` is called
3. `CellController.setValue(newValue)` runs
4. `defaultSetValue()` checks `isCell(value)` → **FALSE** (it's a boolean from OpaqueRef)
5. The else branch does nothing → **write is silently dropped**
6. Component re-renders with OLD value
7. Checkbox reverts, UI thrashes
8. Console shows: `render.ts:271 unexpected object when value was expected`

---

## Root Cause Analysis

### Finding 1: OpaqueRef Returns VALUES, Not Cells

Inside `Cell.map()`, the callback receives `OpaqueRef<T>` proxies:

```typescript
// From cell.ts
map<S>(
  fn: (
    element: T extends Array<infer U> ? OpaqueRef<U> : OpaqueRef<T>,
    index: OpaqueRef<number>,
    array: OpaqueRef<T>,
  ) => Opaque<S>,
): OpaqueRef<S[]>
```

When you access `item.selected` inside the callback:
- `item` is an OpaqueRef proxy
- `item.selected` returns the **VALUE** (boolean), not a Cell reference
- The proxy auto-unwraps for reading, but provides no write semantics

### Finding 2: CellController Silently Ignores Non-Cells

From `cell-controller.ts` lines 254-263:

```typescript
private defaultSetValue(value: Cell<T> | T, newValue: T, _oldValue: T): void {
  if (isCell(value)) {
    const tx = value.runtime.edit();
    value.withTx(tx).set(newValue);  // ✓ This works
    tx.commit();
  } else {
    // ← PROBLEM: Non-Cell values are silently ignored!
    // No error, no warning, nothing happens
  }
}
```

When the checkbox binding receives a raw boolean (from `item.selected` via OpaqueRef), the write is simply dropped.

### Finding 3: The Thrashing Cycle

1. User clicks checkbox → `setChecked(true)`
2. CellController receives boolean value, not Cell
3. `isCell(value)` returns false → write dropped
4. Component re-renders with OLD value
5. Checkbox visually reverts
6. Some intermediate state exposes OpaqueRef proxies as objects
7. `render.ts:271` logs "unexpected object when value was expected"
8. UI thrashes until framework gives up

---

## Evidence: Console Errors

When triggering this issue, the console shows:

```
render.ts:271 unexpected object when value was expected Object
render.ts:271 unexpected object when value was expected Object
render.ts:271 unexpected object when value was expected Object
(repeated 70+ times)
```

From `render.ts` lines 264-278:
```typescript
} else {
  if (
    childValue === null || childValue === undefined ||
    childValue === false
  ) {
    childValue = "";
  } else if (typeof childValue === "object") {
    console.warn("unexpected object when value was expected", childValue);
    childValue = JSON.stringify(childValue);
  }
  // ... creates text node
}
```

---

## Expected Behavior

**Option A (Preferred):** OpaqueRef should provide write semantics for `$` bindings
- When `$checked={item.selected}` is used inside Cell.map()
- The framework should know how to write back to `items[idx].selected`

**Option B:** Emit a clear error at binding time
- "Cannot use $checked on non-Cell value inside Cell.map()"
- This would prevent developers from wasting time debugging silent failures

**Current Behavior:** Silent failure with confusing UI thrashing

---

## Workaround

Use explicit `onClick` handler with the `handler` pattern to pass Cell references:

### Working Code

```typescript
interface Item {
  name: string;
  selected: boolean;
}

export default pattern<{ items: Cell<Item[]> }>(({ items }) => {
  // Handler receives Cell via state object, not closure
  const toggleSelection = handler<
    unknown,
    { arr: Cell<Item[]>; idx: number }
  >((_, { arr, idx }) => {
    const current = arr.get();
    if (idx < 0 || idx >= current.length) return;
    const updated = { ...current[idx], selected: !current[idx].selected };
    arr.set(current.toSpliced(idx, 1, updated));
  });

  return {
    [UI]: (
      <div>
        {items.map((item, idx) => (
          <div>
            {/* Use checked (not $checked) + onClick handler */}
            <ct-checkbox
              checked={item.selected}
              onClick={toggleSelection({ arr: items, idx })}
            />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    ),
  };
});
```

### Why This Works

1. **Handler receives Cell via state object** - not through closure
2. **Handler can call `.get()` and `.set()` on the Cell** properly
3. **No reliance on OpaqueRef providing write semantics**
4. **Follows same pattern as other array mutation handlers** (like `toggleStatus`)

---

## Type System Gap

The TypeScript types allow `$checked={item.selected}` inside Cell.map() because:

1. `item` is typed as `OpaqueRef<Item>`
2. `item.selected` is typed as `OpaqueRef<boolean>` (or the unwrapped boolean)
3. `$checked` accepts `Cell<boolean> | boolean`
4. No type error is raised

But at runtime, the binding doesn't work because the CellController needs a Cell reference to write to.

---

## Files Referenced

| File | Relevance |
|------|-----------|
| `labs/packages/common/src/cell.ts` | Cell.map() returns OpaqueRef |
| `labs/packages/ui/src/v2/core/cell-controller.ts` | defaultSetValue() silently ignores non-Cells |
| `labs/packages/ui/src/v2/components/ct-checkbox/ct-checkbox.ts` | Uses CellController for $checked |
| `labs/packages/html/src/render.ts:271` | Where "unexpected object" warning originates |

---

## Suggested Fix Location

In `cell-controller.ts`, the `defaultSetValue()` method should either:
1. Support writing through OpaqueRef paths
2. Throw an error when `isCell(value)` is false and value appears to be from an OpaqueRef context

Example improvement:
```typescript
private defaultSetValue(value: Cell<T> | T, newValue: T, _oldValue: T): void {
  if (isCell(value)) {
    const tx = value.runtime.edit();
    value.withTx(tx).set(newValue);
    tx.commit();
  } else {
    // Instead of silently ignoring:
    console.error(
      "CellController.setValue() received a non-Cell value. " +
      "This often happens when using $bindings inside Cell.map(). " +
      "Use an explicit onClick handler instead."
    );
  }
}
```

---

## Related Issues

- WORKAROUND comments in `extracurricular-v2.tsx` referencing this issue
- `community-docs/folk_wisdom/2025-12-15-checkbox-binding-patterns.md` (documents same limitation)
- `community-docs/folk_wisdom/2025-12-14-checkbox-toggle-in-computed-map.md` (related workaround)
