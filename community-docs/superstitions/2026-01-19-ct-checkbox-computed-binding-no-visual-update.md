# ct-checkbox $checked with Computed Creates Two-Way Binding Conflict

**Date:** 2026-01-19
**Status:** confirmed
**Confidence:** high
**Stars:** 4

## TL;DR - The Rule

**Don't use `ct-checkbox $checked` with computed (read-only) bindings.** The `$` prefix enables two-way binding, but computed cells are read-only. When clicked, `ct-checkbox` tries to `.set()` on the computed, which silently fails.

```tsx
// BROKEN - $checked tries to write to read-only computed
const isChecked = computed(() => !deselected.includes(itemKey));
<ct-checkbox $checked={isChecked} />  // Click tries to call isChecked.set()!

// CORRECT - Use native checkbox with one-way binding + handler
<input
  type="checkbox"
  checked={isChecked}
  onChange={toggleHandler({ item, selectedItems })}
/>
```

**Symptom:** Checkbox may get into inconsistent state after clicking because the two-way binding conflict.

---

## Summary

The issue is a **two-way binding conflict**, not a reactivity subscription problem:

1. `$checked` passes the CellHandle directly to `ct-checkbox`
2. `ct-checkbox` binds to it via its internal `CellController`
3. When clicked, `ct-checkbox` calls `value.set(newValue)` to update the cell
4. But computed cells are **read-only** - `.set()` silently fails or throws
5. The checkbox's internal state and the computed value get out of sync

This was discovered in the `berkeley-library` pattern where bulk selection checkboxes needed to reflect a computed "is this item selected" state.

## What Doesn't Work

### Using $checked with computed

```tsx
{items.map((item) => {
  const itemKey = item.key;
  const isChecked = computed(() => {
    const deselected = selectedItems.get() || [];
    return !deselected.includes(itemKey);
  });

  return (
    <ct-checkbox $checked={isChecked} />  // BROKEN - tries to write on click
  );
})}
```

The `$` prefix passes the CellHandle directly to `ct-checkbox`. When clicked, it tries to call `isChecked.set(newValue)` - but computed cells don't have a working `.set()` method.

### Using checked (without $) - This actually works differently

```tsx
<ct-checkbox checked={isChecked} />
```

Without `$`, the HTML renderer subscribes to `isChecked` and passes the **resolved boolean** to the element. The checkbox receives a plain boolean, not a CellHandle. However, clicking still may cause issues because `ct-checkbox` expects to manage its own state.

## The Solution: Native HTML Checkbox

Native `<input type="checkbox">` works correctly with computed bindings:

```tsx
{items.map((item) => {
  const itemKey = item.key;
  const isChecked = computed(() => {
    const deselected = selectedItems.get() || [];
    return !deselected.includes(itemKey);
  });

  return (
    <input
      type="checkbox"
      checked={isChecked}
      onChange={toggleSelection({ item, selectedItems })}
      style={{
        width: "18px",
        height: "18px",
        cursor: "pointer",
      }}
    />
  );
})}
```

This works because:
1. The HTML renderer sees `checked={isChecked}` (a CellHandle) and sets up a subscription via `effect()`
2. When the computed changes, the renderer calls `element.checked = resolvedBoolean`
3. Native checkboxes don't have internal state management - they just reflect the DOM property
4. The `onChange` handler manages state updates through our own logic

## When ct-checkbox DOES Work

`ct-checkbox` works correctly when bound to a **Writable cell** (not a computed):

```tsx
// This works - item.done is a Writable cell
<ct-checkbox $checked={item.done}>{item.title}</ct-checkbox>
```

The `$checked` binding enables two-way sync: clicking the checkbox writes to `item.done`, and changes to `item.done` update the checkbox.

## Why This Is Confusing

The official docs say:
> "Native HTML inputs are one-way only. Always use `ct-*` components for form inputs."

This guidance is **incomplete**. The truth is:
- `ct-checkbox $checked` is for **two-way binding** with a **Writable cell**
- Native `<input checked={...}>` is correct for **one-way binding** with a **computed** (the renderer handles reactivity)

The docs don't explain when to use each approach, leading developers to assume `ct-*` is always preferred.

## Debugging Tips

If your checkbox visual isn't updating:

1. Check if your `checked` binding is a computed
2. Try switching to native `<input type="checkbox">`
3. Verify your handler is actually being called (add console.log)
4. Check if other derived values (like counts) ARE updating - if yes, the issue is specifically the checkbox visual binding

## Key Takeaway

**Use `ct-checkbox` for simple two-way binding with Writable cells. Use native `<input type="checkbox">` when the checked state is computed/derived.**

---

## Related

- [docs/common/components/COMPONENTS.md](../../../labs/docs/common/components/COMPONENTS.md) - Official ct-checkbox docs
- [2026-01-15: Reactive refs from map to handlers](./2026-01-15-reactive-refs-from-map-to-handlers.md) - Related OpaqueRef issues
