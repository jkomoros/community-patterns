# Checkbox Toggle Inside computed().map() - Use derive() to Pass Cell References

**Status:** Folk Wisdom (verified through implementation)

> **See also:** `2025-12-14-checked-binding-cell-vs-computed.md` for WHY `$checked` doesn't work on computed results (read-only data URIs) and when to use this pattern vs direct `$checked`.

## Summary

When you need to toggle checkboxes inside a `.map()` on a `computed()` result, you cannot:
1. Use `$checked` bidirectional binding (throws `ReadOnlyAddressError` - computed results are read-only)
2. Directly reference input Cells in the `onClick` handler (throws "opaque ref via closure" error)

**The solution:** Use a separate `Cell<Record<string, boolean>>` for selection state, merge it in computed for display, and wrap the `.map()` in `derive()` to pass the Cell for mutation.

## The Problem

```typescript
// Input schema
interface MyInput {
  items: Cell<Item[]>;
  selections: Cell<Record<string, boolean>>;  // Tracks which items are selected
}

// Computed filtering
const filteredItems = computed(() => items.get().filter(i => i.active));

// BAD - This causes "opaque ref via closure" error
{filteredItems.map((item) => (
  <ct-checkbox
    checked={selections.get()[item.id] ?? false}
    onClick={() => {
      // ERROR: selections is accessed via closure inside .map()
      const current = selections.get();
      selections.set({ ...current, [item.id]: !current[item.id] });
    }}
  />
))}
```

The error occurs because:
1. `filteredItems` is a `computed()` output
2. When you call `.map()` on a computed, the callback runs in a different reactive context
3. Referencing `selections` (an input Cell) inside this callback is "closure capture"
4. The framework doesn't support opaque refs captured via closure in this context

## The Solution: Wrap with derive()

Use `derive()` to explicitly pass both the computed list AND the Cell as inputs:

```typescript
// GOOD - derive() explicitly passes the Cell reference
{derive(
  { filteredItems, selections },
  ({ filteredItems: items, selections: selectionsCell }) =>
    items.map((item) => (
      <ct-checkbox
        checked={item.selected}
        onClick={() => {
          // selectionsCell is now an explicit parameter, not a closure capture
          const current = selectionsCell.get();
          selectionsCell.set({ ...current, [item.id]: !current[item.id] });
        }}
      />
    ))
)}
```

## Key Points

1. **derive() makes closure captures explicit** - Variables passed through derive's input object are properly tracked by the reactive system

2. **The callback parameter is writable** - Unlike direct closure capture, the Cell passed through derive() maintains its write capability

3. **This pattern works for any Cell mutation in .map()** - Not just checkboxes; any onClick/onChange that needs to write to a Cell

4. **Rename to avoid shadowing** - Use destructuring rename (`{ items: itemsList }`) to avoid variable shadowing confusion

## Alternative Approaches That DON'T Work

### Inline Arrow Function (Fails)
```typescript
// Still fails - stagedClassSelections is still captured via closure
{computedList.map((item) => (
  <ct-checkbox onClick={() => {
    stagedClassSelections.set(...);  // ERROR
  }} />
))}
```

### Pre-defined Handler with Cell Parameter (Fails)
```typescript
// The handler is fine, but passing the Cell in .map() still fails
const toggle = handler<{}, { sel: Cell<...> }>((_, { sel }) => { ... });

// ERROR: stagedClassSelections is captured via closure when passed
{computedList.map((item) => (
  <ct-checkbox onClick={toggle({ sel: stagedClassSelections })} />
))}
```

### Using Cell<> without Default<> (Fails)
```typescript
// Changing the type doesn't help - it's about context, not type
selections: Cell<Record<string, boolean>>;  // Still fails in .map()
```

## When This Applies

- Mapping over `computed()` results (not direct input Cells)
- Needing to mutate an input Cell in the onClick/onChange handler
- Any pattern where you're iterating over derived data and writing to shared state

## When This Does NOT Apply

- Mapping directly over an input Cell (e.g., `items.map(...)` where items is `Cell<Item[]>`)
- The todo-list.tsx example works because `items.map()` is on a direct input Cell
- Using `$checked` bidirectional binding on items that were added via `.push()` to a `Cell<T[]>`

## Related Documentation

- `2025-12-14-checked-binding-cell-vs-computed.md` - Why $checked fails on computed (data URIs are read-only)
- `2025-12-14-opaque-ref-closure-frame-limitation.md` - Understanding frame/scope limitations
- `2025-12-04-default-inputs-readonly-use-local-cell.md` - Related read-only input issues
- `patterns/jkomoros/issues/ISSUE-checked-binding-computed-arrays.md` - Full technical analysis

## Metadata

```yaml
topic: computed, map, derive, checkbox, closure, Cell, onClick, $checked
discovered: 2025-12-14
verified_by: extracurricular-selector pattern implementation
status: folk_wisdom
pattern: extracurricular-selector
related:
  - 2025-12-14-checked-binding-cell-vs-computed.md
  - 2025-12-14-opaque-ref-closure-frame-limitation.md
```

## Guestbook

- 2025-12-14 - Discovered while implementing checkbox toggles in extracurricular-selector triage UI. Mapping over computed filtered lists and trying to mutate `stagedClassSelections` Cell caused "opaque ref via closure" error. Solved by wrapping the .map() in derive() that passes both the computed list and the Cell as explicit inputs. (extracurricular-selector / jkomoros)
