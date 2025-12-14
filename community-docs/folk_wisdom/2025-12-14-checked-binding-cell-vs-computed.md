# $checked Binding Only Works on Direct Cell Maps (Not Computed Results)

**Status:** Folk Wisdom (verified through code analysis)

## Summary

The `$checked` bidirectional binding for checkboxes **only works when mapping over a direct input Cell**. It does NOT work on items from `computed()` results, which throw `ReadOnlyAddressError`.

This is **intentional by design** - computed results are read-only because they use data URIs with no backing storage.

## The Rule

| Source | `$checked` Works? | Why |
|--------|-------------------|-----|
| `items.map(...)` where items is `Cell<T[]>` | ✅ Yes | Items have writable entity IDs |
| `computed(() => ...).map(...)` | ❌ No | Items have read-only data URIs |
| `derive(...).map(...)` | ❌ No | Same as computed - read-only |

## Quick Decision Tree

```
Need checkboxes in a list?
    │
    ├─ Is the list a direct input Cell<T[]>?
    │   └─ YES → Use $checked directly ✅
    │
    └─ Is the list computed/filtered/derived?
        └─ YES → Use separate selection Cell + handlers
                 (see "The Correct Pattern" below)
```

## Why Computed Results Are Read-Only

Computed values use **data URIs** (`data:application/json,...`) instead of entity IDs. This is intentional:

1. **Computed = derived, not stored** - There's no backing entity to persist writes
2. **Immutability is a feature** - Prevents accidental mutation of derived state
3. **Efficiency** - Data URIs are lightweight, no storage overhead

When you try to write to a computed item, the framework correctly rejects it:

```typescript
// In chronicle.ts - the read-only check
if (Address.isInline(address)) {  // true for data: URIs
  return { error: new ReadOnlyAddressError(address) };
}
```

## Example: What Fails

```typescript
// items is Cell<{done: Default<boolean, false>, active: boolean}[]>
const activeItems = computed(() => items.get().filter(i => i.active));

// ❌ FAILS with ReadOnlyAddressError
{activeItems.map((item) => (
  <ct-checkbox $checked={item.done} />
))}
```

Even though `item.done` was writable in the original Cell, once it passes through `computed()`, it becomes read-only.

## The Correct Pattern: Separate Selection State

When you need checkboxes on filtered/computed lists, separate your concerns:

1. **Selection state** → Lives in a writable `Cell<Record<string, boolean>>`
2. **Display data** → Computed from source + selection state (read-only view)
3. **Mutation** → Write to the selection Cell via handlers

```typescript
// 1. Writable cell for selection state (SOURCE OF TRUTH)
const selections = cell<Record<string, boolean>>({});

// 2. Computed merges selection state with filtered data (READ-ONLY VIEW)
const activeItemsWithSelection = computed(() => {
  const sel = selections.get();
  return items
    .get()
    .filter((i) => i.active)
    .map((i) => ({ ...i, selected: sel[i.id] ?? false }));
});

// 3. JSX with derive() to pass Cell reference for mutation
{derive(
  { activeItemsWithSelection, selections },
  ({ activeItemsWithSelection: list, selections: sel }) =>
    list.map((item) => (
      <ct-checkbox
        checked={item.selected}
        onClick={() => {
          const current = sel.get();
          sel.set({ ...current, [item.id]: !current[item.id] });
        }}
      />
    ))
)}
```

### Why This Pattern Is Correct

- **Clear separation**: computed = display, Cell = state
- **Explicit dependencies**: derive() makes the Cell accessible
- **Proper writability**: Selection Cell is always writable
- **Framework-aligned**: This IS how the framework expects you to handle filtered + mutable state

## When $checked DOES Work

`$checked` works great when mapping directly over input Cells:

```typescript
// items is Cell<{done: Default<boolean, false>}[]>
// No filtering, no computed - direct Cell map

{items.map((item) => (
  <ct-checkbox $checked={item.done} />  // ✅ Works perfectly
))}
```

**Use cases where $checked is fine:**
- Todo lists with no filtering
- Simple item lists where you show everything
- Any case where you map directly over an input Cell

## Common Mistakes

### Mistake 1: Thinking the filter is the problem

```typescript
// "Maybe I should filter differently?"
const activeItems = items.filter(i => i.active);  // Still computed!

{activeItems.map((item) => (
  <ct-checkbox $checked={item.done} />  // ❌ Still fails
))}
```

**The issue isn't HOW you filter, it's THAT you filter.** Any transformation creates a computed result.

### Mistake 2: Trying to make computed items writable

```typescript
// "Maybe I can use cell() to make it writable?"
const activeItems = computed(() =>
  items.get().filter(i => i.active).map(i => ({
    ...i,
    done: cell(i.done.get())  // ❌ Creates NEW cells, disconnected from source
  }))
);
```

This creates new cells that aren't connected to the original items.

### Mistake 3: Using $checked with computed and expecting it to work

```typescript
// "The todo-list example uses $checked, why doesn't mine work?"
// Because todo-list maps over items directly, not a computed result!
```

## Summary Table

| Pattern | Code | Result |
|---------|------|--------|
| Direct Cell map | `items.map(i => <ct-checkbox $checked={i.done} />)` | ✅ Works |
| Computed map | `computed(() => items.get()).map(...)` | ❌ ReadOnlyAddressError |
| Filtered map | `computed(() => items.get().filter(...)).map(...)` | ❌ ReadOnlyAddressError |
| Derived map | `derive(items, list => list.filter(...)).map(...)` | ❌ ReadOnlyAddressError |
| Separate selection Cell | See "Correct Pattern" above | ✅ Works |

## Related Documentation

- `folk_wisdom/2025-12-14-checkbox-toggle-in-computed-map.md` - Detailed workaround with derive()
- `folk_wisdom/2025-12-14-opaque-ref-closure-frame-limitation.md` - Why you need derive() for mutations
- `superstitions/2025-12-04-default-inputs-readonly-use-local-cell.md` - Related read-only issues
- `patterns/jkomoros/issues/ISSUE-checked-binding-computed-arrays.md` - Full technical analysis

## Metadata

```yaml
topic: $checked, checkbox, computed, Cell, readonly, bidirectional-binding
discovered: 2025-12-14
verified_by: code analysis of runtime.ts, chronicle.ts, address.ts
status: folk_wisdom
pattern: extracurricular-selector
root_cause: computed results use data: URIs which are inherently read-only
```

## Guestbook

- 2025-12-14 - Discovered while implementing triage UI in extracurricular-selector. Wanted $checked on filtered class list, got ReadOnlyAddressError. Deep code analysis revealed computed() uses data URIs which are read-only by design. The "separate selection Cell" pattern is the framework-intended approach. (extracurricular-selector / jkomoros)
