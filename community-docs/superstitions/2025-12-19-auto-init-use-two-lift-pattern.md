# Auto-Initialization: Use Two-Lift Pattern for Creating Charms

**Status**: superstition (single observation, needs confirmation)
**Date**: 2025-12-19
**Author**: Claude + jkomoros

## Problem

When trying to auto-initialize a sub-charm (like notes module) when a pattern is first created, multiple approaches fail:

### Approach 1: `computed()` - Fails

```typescript
computed(() => {
  const current = subCharms.get() || [];  // ERROR: .get() is not a function
  if (current.length === 0) {
    subCharms.set([...]);
  }
});
```

**Why it fails:** Inside `computed()`, pattern inputs are automatically **unwrapped** to their values, not Cells. You can't call `.get()` or `.set()` on them.

### Approach 2: Single `lift()` with `Cell<T>` types - Fails

```typescript
const initializeNotes = lift(
  toSchema<{
    subCharms: Cell<SubCharmEntry[]>;
    isInitialized: Cell<boolean>;
  }>(),
  undefined,
  ({ subCharms, isInitialized }) => {
    const notesCharm = createSubCharm("notes");  // Create charm
    subCharms.set([{ type: "notes", charm: notesCharm }]);  // ERROR!
  }
);
```

**Error:** `Cannot create cell link: not in a handler context and no cause was provided.`

**Why it fails:** When you create a charm inside a lift and try to store it in a Cell in the same context, the framework can't establish the proper "cause" link. Handlers have `inHandler: true` which provides automatic cause context, but lifts don't.

## Solution: Two-Lift Pattern

Based on `chatbot-list-view.tsx` in labs, the working pattern is to use **nested lift calls**:

1. **Outer lift**: Creates the charm and passes it to inner lift
2. **Inner lift**: Receives the charm as input and stores it

```typescript
// Inner lift: stores the notes charm (receives charm as input)
const storeNotesCharm = lift(
  toSchema<{
    notesCharm: unknown;
    subCharms: Cell<SubCharmEntry[]>;
    isInitialized: Cell<boolean>;
  }>(),
  undefined,
  ({ notesCharm, subCharms, isInitialized }) => {
    if (!isInitialized.get()) {
      subCharms.set([{ type: "notes", pinned: true, charm: notesCharm }]);
      isInitialized.set(true);
      return notesCharm; // Return charm to match reference pattern
    }
  }
);

// Outer lift: checks if empty, creates charm, calls inner lift
const initializeNotes = lift(
  toSchema<{
    currentCharms: SubCharmEntry[];  // Unwrapped value, not Cell
    subCharms: Cell<SubCharmEntry[]>;
    isInitialized: Cell<boolean>;
  }>(),
  undefined,
  ({ currentCharms, subCharms, isInitialized }) => {
    if ((currentCharms || []).length === 0) {
      const notesCharm = createSubCharm("notes");
      return storeNotesCharm({ notesCharm, subCharms, isInitialized });  // Return nested call!
    }
  }
);

// In pattern body:
const isInitialized = Cell.of(false);
initializeNotes({ currentCharms: subCharms, subCharms, isInitialized });
```

## Why It Works

The nested lift call (`return storeNotesCharm({...})`) provides proper cause context for the cell link. The inner lift receives the charm as an **input parameter**, not as something created in-place, which allows proper linking.

## Key Takeaways

1. **`computed()` unwraps inputs** - Can't call `.get()`/`.set()` on pattern inputs inside computed
2. **`lift()` with `Cell<T>` preserves Cell access** - But creating AND storing charms in same lift fails
3. **Two-lift pattern works** - Create in outer lift, store via nested lift call
4. **Handlers always work** - They have `inHandler: true` which provides automatic cause context

## Related

- `labs/packages/patterns/chatbot-list-view.tsx` - Working example of this pattern
- `patterns/jkomoros/record/record.tsx` - Where this pattern is now used
- `patterns/jkomoros/issues/ISSUE-Automatic-Side-Effects.md` - Related framework limitation discussion
