# Cells in Handlers Must Be Passed Through State Schema

**Date:** 2025-12-08
**Status:** Superstition (single observation, needs verification)
**Symptom:** `Cannot create cell link: space is required. This can happen when closing over (opaque) cells in a lift or derive.`

## The Problem

When you create a cell with `cell()` in the pattern body and then try to use it inside a handler via closure, you get:

```
Cannot create cell link: space is required. This can happen when closing
over (opaque) cells in a lift or derive. Instead pass those cells into
the lift or derive directly as Cell<> inputs.
```

This happens because handlers (like `derive` and `lift`) run in isolated contexts and cannot access cells through JavaScript closures.

## Wrong Pattern

```typescript
const pattern = pattern<Input, Output>(({ ... }) => {
  // Create a cell in the pattern body
  const myTrackingCell = cell<string | null>(null);

  // ❌ WRONG - Handler captures cell via closure
  const myHandler = handler<
    { data: string },
    { otherCell: Cell<string> }  // myTrackingCell NOT in state schema
  >((input, state) => {
    // This will fail!
    myTrackingCell.set(input.data);
  });

  return {
    doSomething: myHandler({ otherCell: someCell }),
  };
});
```

## Correct Pattern

```typescript
const pattern = pattern<Input, Output>(({ ... }) => {
  // Create a cell in the pattern body
  const myTrackingCell = cell<string | null>(null);

  // ✅ CORRECT - Cell is in handler's state schema
  const myHandler = handler<
    { data: string },
    {
      otherCell: Cell<string>;
      myTrackingCell: Cell<string | null>;  // Add to state schema
    }
  >((input, state) => {
    // Access through state, not closure
    state.myTrackingCell.set(input.data);
  });

  return {
    // Pass the cell when binding the handler
    doSomething: myHandler({
      otherCell: someCell,
      myTrackingCell,  // Pass the cell here
    }),
  };
});
```

## Key Points

1. **Handlers run in isolated contexts** - They can't access cells via JavaScript closures
2. **Add cells to the handler's state schema** - Define them in the state type
3. **Pass cells when binding** - Include them in the object passed to the handler function
4. **Access via `state.`** - Use `state.myCell.set()` not `myCell.set()`

## This Applies To

- `handler()` - The main tool for creating event handlers
- `derive()` - Reactive derivations (use array input instead)
- `lift()` - Lifting functions to work with cells

## Related

- For `derive()`, pass cells as array inputs: `derive([cell1, cell2], ([v1, v2]) => ...)`
- See also: community-docs about closure variables not persisting in derive callbacks
