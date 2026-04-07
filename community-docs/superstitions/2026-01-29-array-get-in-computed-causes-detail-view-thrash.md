# array.get() in computed() Creates Overly Broad Dependency That Destroys Detail Views

**Date:** 2026-01-29
**Status:** confirmed
**Confidence:** high
**Stars:** 5

## TL;DR - The Rule

**Never call `array.get()` inside a `computed()` that returns UI elements (like `<cf-render>`).** The `.get()` subscribes to the ENTIRE array, so any change to any item -- even a deep nested property like a charm's `[NAME]` -- re-fires the computed, destroying and recreating the UI element. This causes input focus loss, cursor resets, scroll position loss, and general thrashing.

Use `array.key(idx)` instead, which creates a targeted dependency on a single element.

```tsx
// BROKEN - detail panel thrashes on every keystroke in any input
{computed(() => {
  const idx = selectedIndex.get();
  if (idx < 0 || idx >= (contacts.get() || []).length) {  // <-- contacts.get()!
    return <placeholder />;
  }
  const charm = contacts.key(idx);
  return <cf-render $cell={charm} />;
})}

// CORRECT - detail panel only re-renders when selection changes
{computed(() => {
  const idx = selectedIndex.get();
  if (idx < 0) {
    return <placeholder />;
  }
  const charm = contacts.key(idx);
  return <cf-render $cell={charm} />;
})}
```

---

## Summary

In a master-detail UI (e.g., a contacts list with a detail panel), the detail panel's `computed()` block may call `array.get()` for a seemingly innocent reason like bounds-checking. This creates a reactive dependency on the **entire array**. When the user types into a text input inside the detail view, the reactive chain propagates through the array and back to the detail panel's computed, which re-runs -- destroying the `<cf-render>` element and recreating it from scratch. The input loses focus mid-keystroke.

The reactive chain that causes the thrash:

1. User types in a `<cf-input>` bound via `$value={person.key("firstName")}`
2. The person charm's `[NAME]` computed updates (it depends on firstName)
3. The charm object stored in the `contacts` array reflects the change
4. `contacts.get()` dependency in the detail panel computed fires
5. The entire detail computed re-runs, destroying and recreating `<cf-render $cell={charm} />`
6. The person form is rebuilt from scratch -- input loses focus, cursor resets

## Symptoms

- **Text inputs lose focus on every keystroke** -- you can only type one character at a time
- **Form thrashes/flickers** -- the entire detail view rebuilds visibly
- **Scroll position resets** -- long forms jump back to top
- **Cursor position resets** -- even if focus is restored, cursor goes to end
- **No errors in console** -- everything "works" except the UX is broken
- **Only happens when editing** -- viewing (read-only) appears fine because no changes propagate back

## Why This Happens

The Common Tools reactive system tracks dependencies at the granularity of `.get()` calls. When you call `array.get()`, you subscribe to the **entire array value**. The array is a collection of charm references, and when any charm's computed properties (like `[NAME]`) update, the array itself is considered changed because it contains that charm reference.

In contrast, `array.key(idx)` creates a dependency on just the **single element at that index**. The `<cf-render $cell={charm} />` element then manages its own internal reactive updates -- it does not need to be destroyed and recreated when the charm's data changes.

### The Critical Distinction

| Method | Dependency Scope | Re-fires when... |
|--------|-----------------|-------------------|
| `array.get()` | Entire array | ANY item changes (even deep nested properties) |
| `array.key(idx)` | Single element | Only when that specific slot changes (item added/removed/replaced) |

## The Problematic Pattern

This commonly appears in master-detail layouts where the detail panel uses the array for validation:

```tsx
// Master panel - list of items
{contacts.map((charm) => {
  const name = computed(() => charm[NAME] || "Unnamed");
  return <button onClick={selectItem({ idx: charm.index })}>{name}</button>;
})}

// Detail panel - BROKEN, reads contacts.get() for bounds check
{computed(() => {
  const idx = selectedIndex.get();
  const allContacts = contacts.get();  // DEPENDENCY ON ENTIRE ARRAY!
  if (idx < 0 || idx >= allContacts.length) {
    return <div>Select a contact</div>;
  }
  const charm = contacts.key(idx);
  return <cf-render $cell={charm} />;
})}
```

The temptation to use `contacts.get()` for bounds-checking is strong -- it seems like a safety check. But it creates a dependency that causes the detail view to thrash whenever any contact's data changes.

## Correct Pattern

Remove the `array.get()` dependency entirely. Only depend on `selectedIndex`:

```tsx
// Detail panel - CORRECT, no array.get() dependency
{computed(() => {
  const idx = selectedIndex.get();
  if (idx < 0) {
    return <div>Select a contact</div>;
  }
  const charm = contacts.key(idx);
  return <cf-render $cell={charm} />;
})}
```

If you need bounds-checking, handle it at the selection point (e.g., in the handler that sets `selectedIndex`) rather than in the detail panel computed.

### Alternative: Bounds-check in the handler

```tsx
const selectContact = handler<{ idx: number }>((_, { idx }) => {
  const list = contacts.get();
  if (idx >= 0 && idx < list.length) {
    selectedIndex.set(idx);
  }
});

// Now the detail panel can trust the index is valid
{computed(() => {
  const idx = selectedIndex.get();
  if (idx < 0) return <div>Select a contact</div>;
  return <cf-render $cell={contacts.key(idx)} />;
})}
```

## Real-World Example

**Pattern:** Contacts (master-detail contact manager)
**Bug:** Typing into any text input in the person detail view caused the entire form to thrash -- input lost focus after every keystroke

### Before (Thrashing)

```tsx
// Detail panel in contacts.tsx
{computed(() => {
  const idx = selectedIndex.get();
  if (idx < 0 || idx >= (contacts.get() || []).length) {
    return (
      <cf-vstack style="align-items: center; justify-content: center; height: 100%; color: #888;">
        <div style="font-size: 48px;">address book icon</div>
        <div>Select a contact</div>
      </cf-vstack>
    );
  }
  const charm = contacts.key(idx);
  return <cf-render $cell={charm} />;
})}
```

**Result:** Every keystroke in firstName, lastName, email, or any bound input caused the entire `<cf-render>` element to be destroyed and recreated. The person form rebuilt from scratch, losing focus, cursor position, and scroll state.

### After (Fixed)

```tsx
{computed(() => {
  const idx = selectedIndex.get();
  if (idx < 0) {
    return (
      <cf-vstack style="align-items: center; justify-content: center; height: 100%; color: #888;">
        <div style="font-size: 48px;">address book icon</div>
        <div>Select a contact</div>
      </cf-vstack>
    );
  }
  const charm = contacts.key(idx);
  return <cf-render $cell={charm} />;
})}
```

**Result:** Detail panel is stable. Inputs retain focus. The `<cf-render>` element manages internal updates reactively without being destroyed.

## Differentiating from Related Issues

| Issue | Symptom | Root Cause |
|-------|---------|------------|
| **This issue** | Detail view thrashes, inputs lose focus | `array.get()` creates dependency on entire array |
| JSX inside computed breaks reactivity | UI doesn't update at all | JSX transformer skips wrapping in computed context |
| computed() in .map() infinite loop | 100% CPU, hang | Feedback loop with volatile node identity |
| Cell.equals() in lift() | Infinite loop | Hidden subscriptions from value comparison |
| Multiple computed siblings blank | All children vanish | Reactive sibling slot conflict |

## Key Rules

1. **Never call `.get()` on an array cell inside a computed that returns UI elements** -- it subscribes to the entire array
2. **Use `.key(idx)` for targeted element access** -- it only subscribes to that slot
3. **Move bounds-checking to handlers** -- validate the index when setting it, not when reading it
4. **`<cf-render $cell={...}>` manages its own reactivity** -- it does not need the parent to rebuild it when data changes
5. **Be suspicious of `.get()` calls used "just for safety"** -- every `.get()` in a computed is a reactive dependency

## Detection

If you see input focus loss or form thrashing in a master-detail layout, search for:

```bash
# Look for array.get() inside computed blocks near cf-render
grep -n "\.get()" your-pattern.tsx | grep -v "handler\|Handler"
```

Check each `.get()` call inside `computed()` blocks: is it reading more data than necessary? Could `.key()` be used instead?

## Related Superstitions

- `2026-01-19-jsx-inside-computed-breaks-reactivity.md` -- Different: JSX transformer behavior in computed context
- `2026-01-08-computed-inside-map-callback-infinite-loop.md` -- Different: node identity instability with async ops
- `2026-01-05-cell-equals-in-lift-creates-subscriptions.md` -- Related concept: hidden/broad subscriptions cause cascading re-evaluation
- `2025-12-14-inline-computed-in-map-is-fine.md` -- Compatible: this is about which `.get()` calls are inside computed, not about computed placement

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/concepts/reactivity.md` -- Cell system and dependency tracking
- **Official docs:** `~/Code/labs/docs/common/INTRODUCTION.md` -- Pattern system overview
- **Related patterns:** `packages/patterns/base/contacts.tsx` -- Master-detail contact manager

## Metadata

```yaml
topic: reactivity, computed, array, dependency-tracking, master-detail, focus-loss, thrashing
discovered: 2026-01-29
confirmed_count: 1
last_confirmed: 2026-01-29
sessions: [contacts-detail-view-thrash-fix]
related_functions: computed, Cell.get, Cell.key, cf-render
pattern: packages/patterns/base/contacts.tsx
commits: [3af13931a]
status: confirmed
confidence: high
stars: 5
applies_to: [CommonTools, general-reactive-programming]
```

## Guestbook

- 2026-01-29 - Contacts pattern master-detail view. Typing into any text input in the person detail panel caused the entire form to thrash -- inputs lost focus on every keystroke. Root cause: the detail panel's `computed()` called `contacts.get()` for bounds-checking, which created a dependency on the entire contacts array. When typing changed a person's firstName, the charm's `[NAME]` computed updated, which propagated through the array, which re-fired the detail computed, which destroyed and recreated `<cf-render $cell={charm} />`. Fix: removed `contacts.get()` from the detail computed, only depending on `selectedIndex.get()` and `contacts.key(idx)`. The `<cf-render>` element handles its own internal reactive updates without needing to be recreated. (contacts-detail-view-thrash-fix)

---

**Remember:** Every `.get()` call inside a `computed()` is a reactive dependency. Use the narrowest possible accessor -- `.key(idx)` instead of `.get()` -- to avoid subscribing to more data than you need. This is especially critical when the computed returns UI elements that hold DOM state like focus and scroll position.
