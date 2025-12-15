# Superstition: Handler with Computed State Causes CPU Loop

> ⚠️ **WARNING: SUPERSTITION (⭐)**
>
> This is a SINGLE OBSERVATION that may be:
> - Completely wrong
> - Only applicable in specific contexts
> - Based on misunderstanding of the root cause
> - Superseded by better information
>
> **Do NOT trust blindly.** Verify against official docs and test thoroughly.
> Always check `~/Code/labs/docs/common/` for authoritative guidance.

---

**Date:** 2025-12-15
**Status:** superstition
**Stars:** ⭐

## Symptom

- Chrome CPU pegged at 100% for about a minute
- UI becomes unresponsive (checkboxes don't respond to clicks)
- No errors in console
- Pattern renders but interactions don't work

## The Problem: Circular Dependency via Handler State

When a **handler** receives a **computed value** as a state parameter, and that computed depends on cells the handler writes to, it creates a circular dependency that causes infinite re-evaluation.

```typescript
// ❌ BROKEN - Circular dependency
const computedList = computed(() => {
  const overrides = selectionOverrides.get();  // Dependency on overrides
  return items.map((item, idx) => ({
    ...item,
    selected: idx in overrides ? overrides[idx] : true,
  }));
});

const toggleSelection = handler<
  unknown,
  { overrides: Cell<Record<number, boolean>>; list: any; idx: number }
>((_, { overrides, list, idx }) => {
  const items = list as Item[];  // Reads from computed
  const current = overrides.get();
  const currentSelected = items[idx].selected;
  overrides.set({ ...current, [idx]: !currentSelected });  // Writes to dependency
});

// In UI:
{computedList.map((item, idx) => (
  <span onClick={toggleSelection({
    overrides: selectionOverrides,
    list: computedList,  // ❌ Passing computed to handler
    idx,
  })}>
    {item.selected ? "☑" : "☐"}
  </span>
))}
```

**Why it loops:**
1. Handler is called on click
2. Handler reads `list` (which is `computedList`)
3. Handler writes to `overrides` (which is `selectionOverrides`)
4. `computedList` depends on `selectionOverrides`, so it recomputes
5. The UI re-renders with new computed values
6. Something in the handler binding/state causes re-evaluation to cascade

## Solution: Pass Rendered Values at Click Time

Instead of passing the computed to the handler, pass the **current value** at render time:

```typescript
// ✅ FIXED - No circular dependency
const toggleSelection = handler<
  unknown,
  { overrides: Cell<Record<number, boolean>>; idx: number; currentlySelected: boolean }
>((_, { overrides, idx, currentlySelected }) => {
  const current = overrides.get();
  // Toggle based on value passed at render time, not read from computed
  overrides.set({ ...current, [idx]: !currentlySelected });
});

// In UI:
{computedList.map((item, idx) => (
  <span onClick={toggleSelection({
    overrides: selectionOverrides,
    idx,
    currentlySelected: item.selected,  // ✅ Pass value, not computed
  })}>
    {item.selected ? "☑" : "☐"}
  </span>
))}
```

**Why this works:**
- Handler doesn't read from the computed during execution
- The selection state is captured at render time
- No circular dependency: handler writes to cell, computed updates, UI re-renders with new values
- Next click gets the new rendered value

## Real Example: extracurricular-v2.tsx

**Before (broken):**
```typescript
const toggleStagedSelection = handler<
  unknown,
  { overrides: Cell<Record<number, boolean>>; staged: any; idx: number }
>((_, { overrides, staged, idx }) => {
  const list = staged as StagedClass[];
  const currentSelected = list[idx].selected;  // Read from computed
  overrides.set({ ...current, [idx]: !currentSelected });
});

// Called with:
onClick={toggleStagedSelection({
  overrides: stagedSelectionOverrides,
  staged: computedStagedClasses,  // ❌ Computed passed to handler
  idx,
})}
```

**After (fixed):**
```typescript
const toggleStagedSelection = handler<
  unknown,
  { overrides: Cell<Record<number, boolean>>; idx: number; currentlySelected: boolean }
>((_, { overrides, idx, currentlySelected }) => {
  const current = overrides.get();
  overrides.set({ ...current, [idx]: !currentlySelected });  // Use passed value
});

// Called with:
onClick={toggleStagedSelection({
  overrides: stagedSelectionOverrides,
  idx,
  currentlySelected: s.selected,  // ✅ Value from render, not computed
})}
```

## Key Insight

The handler state object should contain:
- **Cells** (for reading/writing current values)
- **Primitive values** captured at render time
- **NOT computed values** that depend on cells the handler writes to

## Related

- `2025-12-14-computed-read-write-infinite-loop.md` - Similar issue in computed()
- `blessed/reactivity.md` - Idempotent side effects
- `folk_wisdom/onclick-handlers-conditional-rendering.md` - Handler patterns

---

## Metadata

```yaml
topic: handlers, reactivity, CPU, infinite-loop
discovered: 2025-12-15
confirmed_count: 1
last_confirmed: 2025-12-15
sessions: [extracurricular-selector-acceptance-testing]
related_labs_docs: none (handler state dependencies not documented)
status: superstition
stars: ⭐
```

## Guestbook

- 2025-12-15 - extracurricular-v2.tsx pattern. Checkboxes for toggling staged class selection caused 100% CPU. Handler was receiving `computedStagedClasses` as state and reading `.selected` from it, while also writing to `stagedSelectionOverrides` which the computed depended on. Fixed by passing `currentlySelected: s.selected` at render time instead. Immediate fix. (extracurricular-selector-acceptance-testing)
