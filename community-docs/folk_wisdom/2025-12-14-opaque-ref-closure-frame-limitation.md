# "Opaque Ref Via Closure" Error - Understanding Frame/Scope Limitations

**Status:** Folk Wisdom (verified through code analysis and implementation)

## Summary

The error "Accessing an opaque ref via closure is not supported" occurs when you reference an input Cell inside a `.map()` callback on a `computed()` result. This is **intentional framework behavior** to prevent reactivity bugs, but it's poorly documented. The solution is always to use `derive()` to explicitly pass the Cell.

## The Error

```
Error: Accessing an opaque ref via closure is not supported.
You might want to try wrapping this code in a derive() call.
```

## Why This Happens: Frame Tracking

The framework tracks which "frame" (reactive context) each Cell belongs to. When you call `.map()` on different types of reactive values, you enter different frames:

| Pattern | Frame Context | Cell Access | Result |
|---------|---------------|-------------|--------|
| `inputCell.map((item) => { otherCell.get(); })` | Same frame as pattern | Allowed | ✅ Works |
| `computed(() => ...).map((item) => { inputCell.get(); })` | Different frame | Blocked | ❌ Error |

**The key distinction:**
- `.map()` on an **input Cell** runs in the pattern's frame
- `.map()` on a **computed() result** runs in a different reactive frame
- Input Cells accessed inside that different frame are "closure captures" and trigger the error

## Root Cause (Code Analysis)

From `node-utils.ts` (lines 14-19):

```typescript
// If a cell is accessed from within a different frame from where it was
// initialized, fail with an informative message
if (currentFrame && frame !== currentFrame) {
  throw new Error(
    "Accessing an opaque ref via closure is not supported. " +
    "You might want to try wrapping this code in a derive() call."
  );
}
```

This is **intentional** - the framework prevents cross-frame access via closures to maintain correct reactivity tracking.

## The Solution: derive()

Use `derive()` to explicitly pass any Cells you need to access inside the callback:

```typescript
// BAD - inputCell is captured via closure
{computed(() => items.get().filter(x => x.active)).map((item) => (
  <button onClick={() => inputCell.set(...)}>  // ❌ Error
    Click
  </button>
))}

// GOOD - inputCell is passed explicitly through derive()
{derive(
  { filteredItems: computed(() => items.get().filter(x => x.active)), inputCell },
  ({ filteredItems, inputCell: cell }) =>
    filteredItems.map((item) => (
      <button onClick={() => cell.set(...)}>  // ✅ Works
        Click
      </button>
    ))
)}
```

## Common Scenarios That Trigger This Error

### 1. Checkbox/Toggle in Filtered List

```typescript
const filtered = computed(() => items.get().filter(i => i.active));

// ❌ Error - selections captured via closure
{filtered.map((item) => (
  <ct-checkbox onClick={() => selections.set(...)} />
))}

// ✅ Solution
{derive({ filtered, selections }, ({ filtered: list, selections: sel }) =>
  list.map((item) => <ct-checkbox onClick={() => sel.set(...)} />)
)}
```

### 2. Delete Button in Computed List

```typescript
const sortedItems = computed(() => items.get().sort((a, b) => a.name.localeCompare(b.name)));

// ❌ Error - items captured via closure
{sortedItems.map((item) => (
  <button onClick={() => items.set(items.get().filter(i => i.id !== item.id))}>
    Delete
  </button>
))}

// ✅ Solution
{derive({ sortedItems, items }, ({ sortedItems: list, items: itemsCell }) =>
  list.map((item) => (
    <button onClick={() => itemsCell.set(itemsCell.get().filter(i => i.id !== item.id))}>
      Delete
    </button>
  ))
)}
```

### 3. Form Input That Updates Shared State

```typescript
const visibleFields = computed(() => fields.get().filter(f => f.visible));

// ❌ Error - formData captured via closure
{visibleFields.map((field) => (
  <ct-text-input
    value={formData.get()[field.id]}
    onChange={(e) => formData.set({ ...formData.get(), [field.id]: e.target.value })}
  />
))}

// ✅ Solution
{derive({ visibleFields, formData }, ({ visibleFields: fields, formData: data }) =>
  fields.map((field) => (
    <ct-text-input
      value={data.get()[field.id]}
      onChange={(e) => data.set({ ...data.get(), [field.id]: e.target.value })}
    />
  ))
)}
```

## Why derive() Works

`derive()` does two things:
1. **Makes dependencies explicit** - The reactive system knows about all Cells involved
2. **Passes Cells as parameters** - Cells become function arguments, not closure captures

When a Cell is passed through derive's input object, it enters the callback as an explicit parameter in the correct frame context.

## Quick Reference

| Situation | Solution |
|-----------|----------|
| `.map()` on `Cell<T[]>` | Direct access works ✅ |
| `.map()` on `computed()` | Wrap in `derive()` |
| Need to read Cell in callback | Pass through `derive()` |
| Need to write Cell in callback | Pass through `derive()` |
| Multiple Cells needed | Pass all through `derive()` |

## This Is NOT a Bug

The error message is helpful - it suggests `derive()`. The frame tracking prevents subtle reactivity bugs where changes to Cells wouldn't trigger re-renders. This is a design decision for correctness.

However, **this limitation is not documented** in the official docs (CELLS_AND_REACTIVITY.md, DEBUGGING.md). That's why we document it here.

## Related Docs

- `2025-12-14-checkbox-toggle-in-computed-map.md` - Specific checkbox use case
- `2025-11-29-no-computed-inside-map.md` - Related: don't create computed() inside .map()

## Metadata

```yaml
topic: opaque-ref, closure, frame, derive, computed, map, error
discovered: 2025-12-14
verified_by: code analysis (node-utils.ts) and extracurricular-selector implementation
status: folk_wisdom
pattern: extracurricular-selector
```

## Guestbook

- 2025-12-14 - Analyzed the root cause in node-utils.ts and documented the frame tracking system. The error is intentional but undocumented in official docs. derive() is the correct solution. (extracurricular-selector / jkomoros)
