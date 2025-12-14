# Issue: $checked Bidirectional Binding Fails on Computed Array Items

**Severity:** Medium - Requires non-obvious workaround

**Discovered:** 2025-12-14
**Pattern:** extracurricular-selector
**Related Community Doc:** `folk_wisdom/2025-12-14-checkbox-toggle-in-computed-map.md`

---

## Summary

The `$checked` bidirectional binding does not work on items obtained from a `computed()` array. It only works when mapping directly over an input `Cell<T[]>`. This forces developers to use separate selection state and manual click handlers instead of the cleaner `$checked` pattern.

---

## Expected Behavior

According to COMPONENTS.md, `$checked` should work for bidirectional checkbox binding:

```typescript
<ct-checkbox $checked={item.done} />
```

This should work whether `item` comes from:
- A direct input Cell map: `items.map(item => ...)`
- A computed result: `computed(() => items).map(item => ...)`

---

## Actual Behavior

`$checked` only works on direct Cell maps. When used on computed results, it throws:

```
ReadOnlyAddressError: Cannot write to a read-only address
```

---

## Reproduction

### Working Example (Direct Cell Map)

```typescript
export default recipe(ExampleRecipe, ({ items }) => {
  // items is Cell<{done: Default<boolean, false>}[]>
  return (
    <div>
      {items.map((item) => (
        <ct-checkbox $checked={item.done} />  // ✅ Works
      ))}
    </div>
  );
});
```

### Failing Example (Computed Map)

```typescript
export default recipe(ExampleRecipe, ({ items, filter }) => {
  const filtered = computed(() => {
    return items.get().filter((i) => i.active);
  });

  return (
    <div>
      {filtered.map((item) => (
        <ct-checkbox $checked={item.done} />  // ❌ ReadOnlyAddressError
      ))}
    </div>
  );
});
```

---

## Real-World Impact

In extracurricular-selector, I needed checkboxes in a triage UI that shows filtered/computed lists:

```typescript
// Auto-kept classes (filtered by eligibility)
const autoKeptClasses = computed(() =>
  stagedClasses.get().filter((c) => c.triageStatus === "auto_kept")
);

// Wanted to do this:
{autoKeptClasses.map((cls) => (
  <ct-checkbox $checked={cls.selected} />  // ❌ Doesn't work
))}
```

This is a common pattern: showing a filtered view of items while allowing selection.

---

## Workaround

The workaround requires:
1. Separate `Cell<Record<string, boolean>>` for selection state
2. A `computed()` that merges the selection state with the item list
3. Manual click handlers wrapped in `derive()` to avoid closure capture errors

```typescript
// Separate cell for tracking selections
const stagedClassSelections = cell<Record<string, boolean>>({});

// Computed that merges selection state
const autoKeptClasses = computed(() => {
  const selections = stagedClassSelections.get();
  return stagedClasses
    .get()
    .filter((c) => c.triageStatus === "auto_kept")
    .map((c) => ({ ...c, selected: selections[c.id] ?? true }));
});

// JSX with derive() to pass Cell reference
{derive(
  { autoKeptClasses, stagedClassSelections },
  ({ autoKeptClasses: classes, stagedClassSelections: selections }) =>
    classes.map((cls) => (
      <ct-checkbox
        checked={cls.selected}
        onClick={() => {
          const current = selections.get();
          selections.set({ ...current, [cls.id]: !current[cls.id] });
        }}
      />
    ))
)}
```

This is significantly more complex than the intended `$checked` pattern.

---

## Questions for Framework Authors

1. **Is this intended behavior?** Is there a fundamental reason why computed items can't support bidirectional binding?

2. **Could computed items be made writable?** If the original Cell item was writable, should the computed version maintain that writability?

3. **Should this be documented?** If it's intentional, COMPONENTS.md should clarify that `$checked` only works on direct Cell maps.

4. **Alternative approach?** Is there a simpler workaround I'm missing?

---

## Related Issues

- `folk_wisdom/2025-12-14-checkbox-toggle-in-computed-map.md` - Full workaround documentation
- `superstitions/2025-12-04-default-inputs-readonly-use-local-cell.md` - Related readonly issues

---

## Metadata

```yaml
type: bug
severity: medium
component: reactivity, components
workaround: yes
documentation_needed: yes
```
