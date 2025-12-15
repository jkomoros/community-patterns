# Box Selected/Active State to Avoid Cell<Cell<...>>

**Status:** Blessed (framework author confirmed 2025-12-15)
**Source:** PR #170 review by seefeldb

## The Rule

When tracking a selected or active item, box the selection in an object instead of using `Cell<Cell<T>>`.

## Correct Pattern

```typescript
// ✅ Better - box the selection in an object
interface Selection {
  selected: Cell<Class | null>;
}
const active = cell<Selection>({ selected: null });

// Access the selected item:
active.selected  // Cell<Class | null>

// Set selection:
active.selected.set(someClass);
active.selected.set(null);  // Clear selection
```

## Wrong Pattern

```typescript
// ❌ Avoid Cell<Cell<...>> - it's brittle
const selected = cell<Cell<Class> | null>(null);
```

## Why This Matters

The framework author explicitly warns against `Cell<Cell<...>>`:

> "Let's make sure to add guidance to box active/selected/etc selections. So write into something of type `Cell<{ selected: Cell<...> }>`. Then this will be `active.selected` or so. This avoids the `Cell<Cell<...>>` stuff that is brittle."

## Use Cases

### Single Selection
```typescript
interface ActiveSelection {
  selected: Cell<Class | null>;
}
const active = cell<ActiveSelection>({ selected: null });

// In UI
const handleSelect = (cls: Class) => {
  active.selected.set(cls);
};
```

### Multiple Named Selections
```typescript
interface Selections {
  hovered: Cell<Class | null>;
  selected: Cell<Class | null>;
  editing: Cell<Class | null>;
}
const ui = cell<Selections>({
  hovered: null,
  selected: null,
  editing: null,
});

// Access:
ui.hovered
ui.selected
ui.editing
```

### Selection for "What Becomes Incompatible" Feature
```typescript
// Track which class user clicked to see conflicts
interface ConflictPreview {
  previewClass: Cell<Class | null>;
}
const preview = cell<ConflictPreview>({ previewClass: null });

// When user clicks a class:
preview.previewClass.set(clickedClass);

// Compute what conflicts with the preview class:
const wouldConflict = computed(() => {
  const target = preview.previewClass;
  if (!target) return [];
  return classes.filter(c => hasConflict(c, target));
});
```

## Related Docs

- `blessed/2025-12-15-use-object-references-not-ids.md` - Use object refs, not IDs
- `folk_wisdom/2025-12-08-use-cell-equals-for-identity.md` - Cell.equals() usage

## Metadata

```yaml
topic: cell, selection, active, box, pattern
status: blessed
source: framework-author
date: 2025-12-15
pr: 170
```
