# Use .push() and .key() Not Spread for Array Cell Mutations

**Date:** 2025-12-08
**Status:** Superstition (single observation, needs verification)
**Symptom:** `StorageTransactionInconsistent: Transaction consistency violated` error when mutating arrays

## The Problem

Using the spread pattern to mutate array cells can cause transaction consistency errors, especially when:
- Arrays grow large (40+ items observed)
- Multiple operations happen in quick succession
- The pattern runs in an async handler context

Example error:
```
StorageTransactionInconsistent: Transaction consistency violated:
The "application/json" of "of:..." at "value.argument.debugLog.40"
in space "did:key:..." hash changed. Previously it used to be:
{"/":{"link@1":...}} and currently it is: undefined
```

## Wrong Patterns

```typescript
// ❌ WRONG - Read-modify-write with spread for APPENDING
const addItem = (items: Cell<Item[]>, newItem: Item) => {
  const current = items.get() || [];
  items.set([...current, newItem]);
};

// ❌ WRONG - Slice/spread for UPDATING item at index
const updateItem = (items: Cell<Item[]>, index: number, newStatus: string) => {
  const current = items.get();
  const updated = { ...current[index], status: newStatus };
  items.set([
    ...current.slice(0, index),
    updated,
    ...current.slice(index + 1),
  ]);
};
```

## Correct Patterns

### Appending Items: Use `.push()`

```typescript
// ✅ CORRECT - Use .push() for appending
items.push(newItem);

// ✅ CORRECT - .push() in a handler
const addItemHandler = handler<
  { title: string },
  { items: Cell<Item[]> }
>((input, state) => {
  state.items.push({ title: input.title });
});
```

### Updating Items at Index: Use `.key(index)`

```typescript
// ✅ CORRECT - Use .key(index).key(property).set() for single property
items.key(index).key("status").set("completed");

// ✅ CORRECT - Use .key(index).key(property).set() for multiple properties
// NOTE: .update() is NOT available on .key() results (OpaqueCell)
const itemCell = items.key(index);
itemCell.key("status").set("completed");
itemCell.key("updatedAt").set(Date.now());

// ✅ CORRECT - In a handler
const updateItemHandler = handler<
  { index: number; status: string },
  { items: Cell<Item[]> }
>((input, state) => {
  state.items.key(input.index).key("status").set(input.status);
});
```

**Important:** Unlike React, the CT framework can detect changes deep within objects. You don't need to spread/clone objects to trigger re-renders. Just use `.key().set()` to update the specific property.

### Finding Index Then Updating

```typescript
// ✅ CORRECT - Find index, then use .key()
const queries = state.localQueries.get() || [];
const idx = queries.findIndex((q) => q.id === targetId);
if (idx >= 0) {
  state.localQueries.key(idx).key("shareStatus").set("pending_review");
}
```

## Why This Works

- `.push()` handles append operations atomically within the framework's transaction system
- `.key(index)` navigates to a specific array element and allows atomic updates
- The spread pattern does a read-modify-write which can race with other operations

## Summary of Array Cell Methods

| Operation | Method |
|-----------|--------|
| Append item | `.push(item)` |
| Update property at index | `.key(idx).key("prop").set(value)` |
| Update multiple properties | Chain `.key(idx).key("prop").set()` calls |
| Remove item at index | `.set(arr.toSpliced(idx, 1))` |
| Filter/remove items | `.set(arr.filter(...))` |
| Clear array | `.set([])` |

**Note:** `.update()` is only available on top-level cells, not on `.key()` results (OpaqueCell).

## Confirmed In

- `gmail-agentic-search.tsx` - debugLog array causing transaction errors at 40+ items
- Fixed by changing ~15 occurrences from slice/spread to `.push()` and `.key()` patterns

## Related Documentation

- `/Users/alex/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` - Shows `.push()` as the standard pattern
- `/Users/alex/Code/labs/docs/common/TYPES_AND_SCHEMAS.md` - Lists `.push(item)` as array cell method
- `/Users/alex/Code/labs/.claude/skills/lit-component/references/cell-integration.md` - Shows `.key(index)` pattern
