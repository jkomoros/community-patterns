# Issue: $checked Bidirectional Binding Fails on Computed Array Items

**Severity:** Medium - Requires non-obvious workaround

**Discovered:** 2025-12-14
**Pattern:** extracurricular-selector
**Related Community Doc:** `folk_wisdom/2025-12-14-checkbox-toggle-in-computed-map.md`

---

## Summary

The `$checked` bidirectional binding does not work on items obtained from a `computed()` array. It only works when mapping directly over an input `Cell<T[]>`. This forces developers to use separate selection state and manual click handlers instead of the cleaner `$checked` pattern.

---

## Classification: LIMITATION (Not Bug)

**After deep code analysis, this is an INTENTIONAL DESIGN CHOICE, not a bug.**

Computed values are represented as read-only data URIs by design. The framework deliberately prevents writes to computed results because:
1. Computed values are ephemeral/derived, not persisted entities
2. There's nowhere to store writes to a computed value
3. Immutability of computed results is a feature, not a limitation

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

## Deep Technical Analysis

### Root Cause: Data URIs for Computed Results

The framework uses **data URIs** to represent computed/immutable values. These are inherently read-only.

#### 1. How computed() Creates Immutable Cells

**File:** `/Users/alex/Code/labs/packages/runner/src/builder/module.ts` (Lines 227-228)

```typescript
export const computed: <T>(fn: () => T) => OpaqueRef<T> = <T>(fn: () => T) =>
  lift<any, T>(fn)(undefined);
```

`computed()` is syntactic sugar for `lift()` with no arguments, creating a module node that runs a pure function.

#### 2. Data URI Creation

**File:** `/Users/alex/Code/labs/packages/runner/src/runtime.ts` (Lines 448-464)

```typescript
getImmutableCell(
  space: MemorySpace,
  data: any,
  schema?: JSONSchema,
  tx?: IExtendedStorageTransaction,
): Cell<any> {
  const asDataURI = `data:application/json,${
    encodeURIComponent(JSON.stringify({ value: data }))
  }` as const as `${string}:${string}`;

  return createCell(this, {
    space,
    path: [],
    id: asDataURI,  // ← READ-ONLY DATA URI
    type: "application/json",
    schema,
  }, tx);
}
```

**Key:** The cell's `id` is set to a `data:` URI, not a normal entity ID.

#### 3. Child Cells Inherit the Data URI

**File:** `/Users/alex/Code/labs/packages/runner/src/cell.ts` (Lines 736-764)

When `.map()` creates individual item cells via `.key()`:

```typescript
key<K extends PropertyKey>(valueKey: K): KeyResultType<T, K, AsCell> {
  const childLink: NormalizedLink = {
    ...this._link,  // ← INHERITS PARENT'S LINK (including data: URI)
    path: [...this._link.path, valueKey.toString()],
    schema: childSchema,
  };
  // ...
}
```

All child cells share the parent's `_causeContainer`, inheriting the `data:` URI.

#### 4. The Read-Only Check

**File:** `/Users/alex/Code/labs/packages/runner/src/storage/transaction/chronicle.ts` (Lines 123-136)

```typescript
write(address: IMemoryAddress, value?: JSONValue): Result<IAttestation, ...> {
  // Check if address is inline (data: URI) - these are read-only
  if (Address.isInline(address)) {
    return { error: new ReadOnlyAddressError(address) };
  }
  // ... continue with write
}
```

**File:** `/Users/alex/Code/labs/packages/runner/src/storage/transaction/address.ts` (Lines 55-57)

```typescript
export const isInline = (address: IMemoryAddress): boolean => {
  return address.id.startsWith("data:");
};
```

### Code Flow Comparison

#### Working: Direct Cell Map

```
items: Cell<Item[]> with id="entity:123"
  ↓ .map()
item: Cell<Item> with id="entity:123", path=["0"]
  ↓ $checked binding tries to set
item.set(true)
  ↓
address = { id: "entity:123", path: ["0"], ... }
  ↓
isInline(address) = false  ✅ Allows write
  ↓
Write succeeds
```

#### Failing: Computed Array Map

```
computed(() => [...]) with id="data:application/json,..."
  ↓ .map()
item: Cell<Item> with id="data:application/json,...", path=["0"]
  ↓ $checked binding tries to set
item.set(true)
  ↓
address = { id: "data:application/json,...", path: ["0"], ... }
  ↓
isInline(address) = true  ❌ Blocks write
  ↓
ReadOnlyAddressError thrown
```

---

## Why This Is Intentional (Design Rationale)

The framework uses data URIs for computed results because:

1. **They represent computed/derived values** - Not stored in persistent storage
2. **They are ephemeral** - The data is embedded in the URI itself
3. **They have no backing entity** - There's nowhere to persist writes
4. **They enable lightweight immutable values** - No storage transaction overhead
5. **Prevents accidental mutation** - Computed = read-only by definition

This is consistent across all `getImmutableCell()` calls in the codebase.

---

## Why It Can't Be Easily Fixed

Making computed items writable would require:

1. **Resolving a logical contradiction** - Where would writes be persisted if the value is computed?
2. **Maintaining reactivity** - Changes to computed items would need to propagate back to the source
3. **Breaking immutability guarantees** - Computed values should be read-only by definition
4. **Bypassing storage transactions** - Data URIs can't participate in normal storage writes

### Potential Fix Approaches (All Complex)

| Approach | Description | Difficulty |
|----------|-------------|------------|
| **Maintain Link Lineage** | Track original Cell through computed transformations | Very High |
| **Write-Through Cells** | New `writableComputed()` that tracks source | High |
| **Accept Limitation** | Document clearly, improve workaround DX | Low |

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

## Workaround (The "Correct" Pattern)

The framework's design suggests this workaround IS the correct pattern when you need both filtering and mutation:

```typescript
// Separate cell for tracking selections (the SOURCE OF TRUTH for selection state)
const stagedClassSelections = cell<Record<string, boolean>>({});

// Computed that merges selection state with display data (READ-ONLY view)
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

**Why this is "correct":**
- Clear separation: computed = display, Cell = state
- Explicit dependencies via `derive()`
- Selection state lives in a proper writable Cell
- Computed just provides a merged view

---

## Questions for Framework Authors

1. **Confirm design intent:** Is the read-only nature of computed results a deliberate architectural choice?

2. **Documentation:** Should COMPONENTS.md explicitly state that `$checked` only works on direct Cell maps?

3. **DX improvement:** Could there be a clearer error message or warning when attempting `$checked` on computed items?

4. **Alternative primitive:** Would a `writableView()` or `filterWith()` primitive that maintains writability be feasible?

---

## Key Files Reference

| Component | File | Lines |
|-----------|------|-------|
| Data URI Creation | `runtime.ts` | 448-464 |
| Read-Only Check | `chronicle.ts` | 123-136 |
| Inline Detection | `address.ts` | 55-57 |
| Cell.key() | `cell.ts` | 736-764 |
| Computed Definition | `module.ts` | 227-228 |

---

## Related Issues

- `folk_wisdom/2025-12-14-checkbox-toggle-in-computed-map.md` - Full workaround documentation
- `folk_wisdom/2025-12-14-opaque-ref-closure-frame-limitation.md` - Related frame/scope issues
- `superstitions/2025-12-04-default-inputs-readonly-use-local-cell.md` - Related readonly issues

---

## Metadata

```yaml
type: limitation (intentional design)
severity: medium
component: reactivity, components, storage
workaround: yes (separate selection Cell)
documentation_needed: yes
root_cause: data URIs for computed results are inherently read-only
```
