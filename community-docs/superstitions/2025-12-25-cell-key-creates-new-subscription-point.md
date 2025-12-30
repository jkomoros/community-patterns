---
topic: cells, reactivity, subscriptions, pattern-composition, key-navigation
discovered: 2025-12-25
sessions: [labs-4/notes-module-auto-populate]
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
status: superstition
stars: ⭐⭐⭐
---

# Cell.key() Creates New Cell Reference with Separate Subscription Point

## ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

---

## Problem

When you navigate to a nested field using `.key("fieldName")`, you get a **new Cell reference** that shares the underlying data but has **SEPARATE subscription points**. This means:

1. Data updates via `.key().set()` **DO update the shared data**
2. BUT UI components subscribed to the **original Cell won't re-render**
3. This is **not** about data persistence - the data IS persisted, but the UI doesn't see it

**Critical symptom:** The data changes (verified in console/debugger), but the UI doesn't update.

### Example That FAILS

```typescript
// Parent pattern with sub-charm
const NotesModule = pattern<NotesModuleInput, NotesModuleOutput>(
  ({ content, label }) => {
    // Internal handlers return Cell refs for UI subscription
    const editContent = streamHandler<{ value: string }, { content: Cell<string> }>(
      (event, state) => {
        state.content.set(event.detail.value);  // UI subscribed HERE
      }
    );

    return {
      editContent,  // Exposed for external calls
      [UI]: <ct-text-area value={content} />  // Subscribed to original content Cell
    };
  }
);

// Calling pattern - trying to update sub-charm state from parent
const ParentPattern = pattern<ParentInput, ParentOutput>(
  ({ subCharms }) => {
    const notesCharm = subCharms[0].charm;  // Get sub-charm instance

    const autoPopulateFromParent = handler<unknown, { charm: any }>(
      (_event, { charm }) => {
        // ❌ WRONG - Creates NEW Cell reference via .key()
        const contentCell = charm.key("content");
        contentCell.set("Auto-populated content");

        // Data IS updated in shared storage
        // BUT NotesModule UI won't re-render because it's subscribed
        // to the ORIGINAL content Cell, not this .key() reference
      }
    );

    return {
      autoPopulate: autoPopulateFromParent({ charm: notesCharm })
    };
  }
);
```

**What happens:**
- `contentCell.set()` updates the shared data storage
- Console logging shows the new value
- But the NotesModule's `<ct-text-area>` doesn't update
- The UI is subscribed to a different Cell reference

## Solution: Use Pattern's Exposed Stream Handlers

Instead of navigating via Cell keys and calling `.set()`, use the sub-charm's exposed stream handlers:

```typescript
const ParentPattern = pattern<ParentInput, ParentOutput>(
  ({ subCharms }) => {
    const notesCharm = subCharms[0].charm;  // Get sub-charm instance

    const autoPopulateFromParent = handler<unknown, { charm: any }>(
      (_event, { charm }) => {
        // ✅ CORRECT - Use the pattern's stream handler
        charm.editContent.send({ detail: { value: "Auto-populated content" } });

        // This calls .set() on the Cell reference that the UI is subscribed to
        // So the UI re-renders correctly
      }
    );

    return {
      autoPopulate: autoPopulateFromParent({ charm: notesCharm })
    };
  }
);
```

**Why this works:**
- The stream handler (`editContent`) receives the event
- It calls `.set()` on the **same Cell reference** the UI is subscribed to
- Reactivity triggers correctly
- UI updates as expected

## Key Mental Model

Think of Cells as having **identity** - each Cell reference is a distinct subscription point:

```typescript
const originalCell = inputs.content;  // Cell reference A
const navigatedCell = charmRef.key("content");  // Cell reference B

// These share underlying DATA but have SEPARATE subscriptions:
// - Reference A: UI components, computed(), derives
// - Reference B: New subscription point

navigatedCell.set("new value");
// ✅ Data is updated in shared storage
// ❌ Components subscribed to originalCell won't re-render
```

This is **different from**:
- **Data not persisting** - the data DOES persist
- **Proxy dereferencing** - this is about Cell identity, not proxies
- **Read-only Cells** - both Cells are writable

## Pattern for Cross-Pattern Communication

When a parent pattern needs to update a sub-pattern's state:

**❌ Don't:** Navigate via `.key()` and call `.set()`
```typescript
const subCell = subCharm.key("field");
subCell.set(value);  // Data updates but UI won't
```

**✅ Do:** Use the sub-pattern's exposed stream handlers
```typescript
subCharm.streamHandler.send({ detail: { value } });  // Triggers correct reactivity
```

**Pattern guidelines:**
1. **Sub-patterns** should expose stream handlers for external state updates
2. **Parent patterns** should call those handlers instead of direct `.set()`
3. **Internal handlers** maintain the Cell references that UI subscribes to

## Real-World Example

From the session that discovered this:

**NotesModule pattern:**
```typescript
interface NotesModuleInput {
  content?: Default<string, "">;
  label?: Default<string, "Notes">;
}

const NotesModule = pattern<NotesModuleInput, NotesModuleOutput>(
  ({ content, label }) => {
    // Stream handler for external updates
    const editContent = streamHandler<
      { value: string },
      { content: Cell<Default<string, "">> }
    >((event, state) => {
      state.content.set(event.detail.value);  // UI subscribed to this Cell
    });

    return {
      editContent,  // Expose for parent to call
      content,      // Expose current value
      [UI]: <ct-text-area value={content} />  // Subscribed to original Cell
    };
  }
);
```

**Record pattern (parent):**
```typescript
const RecordPattern = pattern<RecordInput, RecordOutput>(
  ({ subCharms }) => {
    const autoPopulateNotes = handler<unknown, { charms: any[] }>(
      (_event, { charms }) => {
        const notesEntry = charms.find(e => e.type === "notes");
        if (!notesEntry) return;

        // ✅ Use the exposed handler
        notesEntry.charm.editContent.send({
          detail: { value: "Auto-populated from OCR" }
        });

        // ❌ This would NOT update UI:
        // notesEntry.charm.key("content").set("...");
      }
    );

    return { autoPopulate: autoPopulateNotes({ charms: subCharms.get() }) };
  }
);
```

## Debug Pattern

If UI isn't updating but data seems to be changing:

1. **Check Cell identity:**
   ```typescript
   console.log("Original cell:", content);
   console.log("Navigated cell:", charm.key("content"));
   console.log("Are they equal?", content === charm.key("content"));  // false!
   ```

2. **Verify data vs UI:**
   ```typescript
   charm.key("content").set("test");
   console.log("Data updated:", charm.key("content").get());  // "test"
   console.log("UI shows:", /* check actual UI */);  // Still old value
   ```

3. **Solution:** Find and use the pattern's stream handler

## Related Patterns

This is **related but different from**:

- **`2025-12-23-reactive-proxy-no-key-method.md`** - About reactive proxies not having `.key()` at all
  - That: Proxies from `.get()` don't have `.key()`
  - This: Cells from `.key()` create new subscription points

- **`2025-12-04-share-cells-between-composed-patterns.md`** - About sharing Cells between patterns
  - That: Pass same Cell to multiple patterns for coordination
  - This: `.key()` navigation creates NEW Cell, breaking subscription chain

- **`2025-01-24-pass-cells-as-handler-params-not-closure.md`** - About Cell closure capture
  - That: Cells in closures get unwrapped in reactive contexts
  - This: Cells from `.key()` have wrong subscription identity

## When Is This NOT an Issue?

`.key()` navigation works fine when:
1. **Reading data** - Navigation to read values is fine
2. **One-shot writes** - Writing once without caring about UI updates
3. **Same pattern scope** - Using `.key()` within the same pattern that created the Cell
4. **No UI subscriptions** - When no components depend on reactivity

The issue ONLY occurs when:
- Parent pattern tries to update sub-pattern state
- UI is subscribed to original Cell reference
- You use `.key()` instead of the pattern's handlers

## Context

Discovered while implementing auto-populate functionality in Record pattern:
- Record pattern wanted to populate NotesModule's content from OCR results
- Initial approach: `notesCharm.key("content").set(extractedText)`
- Data was updated (verified in console), but UI didn't re-render
- Console logging revealed the value was changing but textarea stayed empty
- Fix: Use `notesCharm.editContent.send({ detail: { value: extractedText } })`
- UI immediately started updating correctly

**Files involved:**
- `/Users/alex/Code/labs-4/packages/patterns/record/notes-module.tsx` - Sub-pattern with stream handler
- `/Users/alex/Code/labs-4/packages/patterns/record/index.tsx` - Parent pattern calling handler

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` - Cell subscription model
- **Related:** `2025-12-23-reactive-proxy-no-key-method.md` - Proxy vs Cell distinction
- **Related:** `2025-12-04-share-cells-between-composed-patterns.md` - Cell sharing patterns

## Open Questions

1. **Is `.key()` creating a new Cell or a view?** - Needs runtime investigation
2. **Are there cases where `.key().set()` DOES trigger UI updates?** - Within same pattern scope?
3. **Should patterns always expose handlers for cross-pattern updates?** - Design pattern question
4. **Is there a way to "re-subscribe" to a navigated Cell?** - Framework feature question

---

**Remember:** This is a hypothesis based on one observation. Test in your own context!

**TIP:** If data updates but UI doesn't, check if you're using `.key()` to navigate to the Cell instead of the pattern's exposed handlers.
