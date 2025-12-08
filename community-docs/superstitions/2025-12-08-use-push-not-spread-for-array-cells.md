# Use .push() Not Spread for Array Cell Mutations

**Date:** 2025-12-08
**Status:** Superstition (single observation, needs verification)
**Symptom:** `StorageTransactionInconsistent: Transaction consistency violated` error when appending to arrays

## The Problem

Using the spread pattern to append items to array cells can cause transaction consistency errors, especially when:
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

## Wrong Pattern

```typescript
// ❌ WRONG - Read-modify-write with spread
const addItem = (items: Cell<Item[]>, newItem: Item) => {
  const current = items.get() || [];
  items.set([...current, newItem]);
};

// ❌ WRONG - Same pattern in a handler
const addItemHandler = handler<
  { title: string },
  { items: Cell<Item[]> }
>((input, state) => {
  const current = state.items.get() || [];
  state.items.set([...current, { title: input.title }]);
});
```

## Correct Pattern

```typescript
// ✅ CORRECT - Use .push() for appending
const addItem = (items: Cell<Item[]>, newItem: Item) => {
  items.push(newItem);
};

// ✅ CORRECT - .push() in a handler
const addItemHandler = handler<
  { title: string },
  { items: Cell<Item[]> }
>((input, state) => {
  state.items.push({ title: input.title });
});
```

## Why This Works

The `.push()` method on array cells is designed to handle the append operation atomically within the framework's transaction system. The spread pattern does a read-modify-write which can race with other operations.

## What About Updating Existing Items?

For updating items in the middle of an array (not appending), you may still need the slice/spread pattern or indexed access. This superstition specifically covers **appending** new items.

```typescript
// Updating existing item at index - may still need this pattern
const updateItem = (items: Cell<Item[]>, index: number, updated: Item) => {
  const current = items.get();
  items.set([
    ...current.slice(0, index),
    updated,
    ...current.slice(index + 1),
  ]);
};
```

## Confirmed In

- `gmail-agentic-search.tsx` - debugLog array causing transaction errors at 40+ items
- Fixed by changing to `.push()` pattern

## Related Documentation

- `/Users/alex/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` - Shows `.push()` as the standard pattern
- `/Users/alex/Code/labs/docs/common/TYPES_AND_SCHEMAS.md` - Lists `.push(item)` as array cell method
