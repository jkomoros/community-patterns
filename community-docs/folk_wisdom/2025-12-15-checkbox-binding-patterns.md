# Checkbox Binding Patterns in Lists

> **FOLK WISDOM (confirmed)**
>
> This documents best practices for checkbox binding in mapped lists.
> Based on framework documentation and multiple pattern implementations.

---

**Date:** 2025-12-15
**Status:** folk_wisdom
**Stars:** N/A (best practice documentation)

## The Golden Path: State ON Objects

When you have a `Cell<Item[]>` with state directly on the items, use direct property binding:

```typescript
interface TodoItem {
  title: string;
  done: Default<boolean, false>;  // State lives ON the object
}

interface Input {
  items: Cell<TodoItem[]>;
}

// In JSX - direct binding, no .key() needed
{items.map((item) => (
  <ct-checkbox $checked={item.done}>
    {item.title}
  </ct-checkbox>
))}
```

**This is the most idiomatic pattern.** The framework handles two-way binding automatically.

## ⚠️ CRITICAL: Cell.map() Cannot Close Over External Cells

When you call `.map()` on a `Cell<T[]>`, the framework uses **Cell.map()** which creates a recipe scope. Inside this scope, you **CANNOT** access external cells.

```typescript
// ❌ FAILS - "Cannot create cell link: space is required"
{items.map((item) => {
  const grade = child.get();  // ERROR: Closing over external cell
  return <div>{triageClass(item, grade)}</div>;
})}

// ❌ FAILS - derive() inside map has severe performance issues (8x+ calls)
{items.map((item) => {
  const triage = derive({ item, child }, ...);  // Never stabilizes!
  return <div>{triage.status}</div>;
})}

// ✅ CORRECT - Only access properties of 'item' parameter
{items.map((item) => (
  <div>
    <ct-checkbox $checked={item.selected} />
    {item.triageStatus}  // Pre-computed and stored on object
  </div>
))}
```

**Solution**: Pre-compute any external data and store it ON the objects BEFORE mapping:

```typescript
// Populate items with pre-computed data (where external cell access IS allowed)
computed(() => {
  const response = extractionResponse;
  const childGrade = child.get()?.grade || "K";  // ✅ OK here, not in map

  const newItems = response.classes.map(cls => {
    const triage = triageClass(cls, childGrade);
    return {
      ...cls,
      selected: triage.status !== "auto_discarded",
      triageStatus: triage.status,    // Pre-computed
      triageReason: triage.reason,    // Pre-computed
    };
  });

  items.set(newItems);
});
```

## Decision Tree

```
Need checkboxes in a mapped list?
│
├─ Is the list a direct Cell<T[]>?
│   └─ YES → Put state ON objects, use $checked={item.property} ✅
│
├─ Is the list computed/derived?
│   ├─ Can you restructure to use a Cell<T[]> instead?
│   │   └─ YES → Do that (preferred) ✅
│   └─ NO → See "Workaround Pattern" below
│
└─ Is it a one-off selection state?
    └─ Consider separate Cell<Record<string, boolean>> (see workaround)
```

## When Computed Is Involved

If your list comes from a `computed()` or `derive()`, you have two options:

### Option 1: Restructure (Preferred)

Store the data in a `Cell<T[]>` directly, compute display-only properties at render time:

```typescript
// ❌ BEFORE: Computed list with selection derived elsewhere
const filteredItems = computed(() => {
  return allItems.get().filter(i => i.active).map(i => ({
    ...i,
    selected: overrides.get()[i.id] ?? true,
  }));
});

// ✅ AFTER: Cell with state on objects, filter at render
const items = cell<Item[]>([]);  // State lives here

// In JSX - filter and compute display-only info inline
{items.map((item) => {
  if (!item.active) return null;  // Filter inline
  const displayInfo = computeDisplayInfo(item);  // Display-only
  return (
    <ct-checkbox $checked={item.selected}>  // Direct binding
      {item.name} - {displayInfo}
    </ct-checkbox>
  );
})}
```

### Option 2: Workaround (Last Resort)

If you truly can't restructure, use a separate selection Cell:

```typescript
// Separate state cell - use ID-based keys, NOT index
const selections = cell<Record<string, boolean>>({});

// Computed for display
const displayItems = computed(() => {
  const sel = selections.get();
  return items.get().map(i => ({
    ...i,
    selected: sel[i.id] ?? true,
  }));
});

// In JSX - use .key() with stable IDs
{displayItems.map((item) => (
  <ct-checkbox $checked={selections.key(item.id)}>
    {item.name}
  </ct-checkbox>
))}
```

**Trade-offs of workaround:**
- ⚠️ More complex (two sources of truth)
- ⚠️ Must use stable IDs, not indices (indices are fragile)
- ⚠️ May need idempotent initialization in computed

## Why Index-Based Keys Are Fragile

```typescript
// ❌ BAD - Index-based keys break on reorder/filter
const overrides = cell<Record<number, boolean>>({});
{items.map((item, idx) => (
  <ct-checkbox $checked={overrides.key(idx)} />  // Fragile!
))}

// ✅ GOOD - ID-based keys are stable
const overrides = cell<Record<string, boolean>>({});
{items.map((item) => (
  <ct-checkbox $checked={overrides.key(item.id)} />  // Stable
))}
```

If item at index 0 gets deleted, all subsequent indices shift, but the selection states don't!

## Real Example: Idiomatic Refactor

**Before (workaround pattern):**
```typescript
const stagedSelectionOverrides = cell<Record<number, boolean>>({});

const computedStagedClasses = computed(() => {
  // ... idempotent initialization with .key(idx).set()
  // Selection state lives in separate cell
});

// In JSX
<ct-checkbox $checked={stagedSelectionOverrides.key(idx)} />
```

**After (idiomatic pattern):**
```typescript
const stagedClasses = cell<StagedClass[]>([]);  // State on objects

// In handler after extraction:
stagedClasses.set(extracted.map(cls => ({
  ...cls,
  selected: shouldBeSelected(cls),  // Initialize here
})));

// In JSX - direct binding
<ct-checkbox $checked={cls.selected} />
```

## Summary

| Pattern | When to Use | Complexity |
|---------|-------------|------------|
| `$checked={item.property}` | State on Cell<T[]> objects | Simple ✅ |
| `$checked={selections.key(item.id)}` | Can't restructure, need separate state | Medium ⚠️ |
| `$checked={overrides.key(idx)}` | **Avoid** - fragile indices | Complex ❌ |

**Always prefer putting state directly on the objects in your Cell array.**

---

## Metadata

```yaml
topic: checkbox, binding, lists, reactivity, Cell.map
discovered: 2025-12-15
confirmed_count: 3
sessions: [extracurricular-selector-acceptance-testing, extracurricular-checkbox-refactor]
related_labs_docs:
  - docs/common/COMPONENTS.md (bidirectional binding)
  - docs/common/CELLS_AND_REACTIVITY.md (.key() method)
  - packages/runner/src/cell.ts (Cell.map() implementation)
status: folk_wisdom
```

## Guestbook

- 2025-12-15 - extracurricular-v2.tsx pattern. Initially used .key(idx) workaround for staged class selection. Refactored to idiomatic "state on objects" pattern per framework best practices. (extracurricular-selector-acceptance-testing)
- 2025-12-15 - **CRITICAL DISCOVERY**: Cell.map() creates a recipe scope where external cells cannot be closed over. Attempted to compute triage at render time with `child.get()` inside map - caused "Cannot create cell link: space is required" error. Also discovered derive() inside map causes 8x+ performance issues. Solution: pre-compute external data and store ON objects before mapping. (extracurricular-checkbox-refactor)
