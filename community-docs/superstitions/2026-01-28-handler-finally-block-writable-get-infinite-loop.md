# Calling Writable.get() in Handler Finally Block Causes Infinite Loop

**Date:** 2026-01-28 **Status:** confirmed **Confidence:** high **Stars:** 4

## TL;DR - The Rule

**Never call `.get()` on a Writable inside a `finally` block if you also write
to that same Writable in the `try` block.** This creates a reactive dependency
that triggers "Too many iterations: 101" errors.

```tsx
// BROKEN - .get() in finally creates reactive loop
const myHandler = handler<...>(async (_event, { items }) => {
  const current = items.get();
  items.set([...current, newItem]);
  try {
    await doWork();
  } finally {
    items.set(items.get().filter(x => x !== newItem)); // BAD: .get() here
  }
});

// CORRECT - Capture value at start, use captured value in finally
const myHandler = handler<...>(async (_event, { items }) => {
  const current = items.get(); // Capture once at handler start
  items.set([...current, newItem]);
  try {
    await doWork();
  } finally {
    items.set(current.filter(x => x !== newItem)); // GOOD: use captured value
  }
});
```

---

## Summary

When you call `.get()` on a Writable inside a handler's `finally` block, the
reactive system registers this as a new dependency. If the same handler also
modifies that Writable (via `.set()`), this creates a feedback loop:

1. Handler runs, calls `.set()` on Writable
2. Finally block runs, calls `.get()` on same Writable
3. The `.get()` creates a subscription
4. The earlier `.set()` triggers the subscription
5. Handler re-runs
6. **Infinite loop**

The scheduler detects this and throws "Too many iterations: 101".

## Symptoms

- **"Too many iterations: 101"** error in console
- **Handler appears to do nothing** - error is thrown before visible effects
- **Error points to scheduler.ts** - not obviously related to your code
- **Only happens with async handlers** - sync handlers may not trigger it

## Why This Happens

The handler system in CommonTools tracks dependencies for reactivity. When you:

```tsx
finally {
  sendingThreads.set(sendingThreads.get().filter(...));
}
```

The `.get()` call registers a dependency on `sendingThreads`. But you're inside
a handler that was triggered by a change to `sendingThreads` (from the `.set()`
in the try block). This creates a cycle.

The key insight: **dependency tracking doesn't stop in finally blocks**. The
reactive system doesn't know you're "cleaning up" - it just sees a new read.

## The Fix

Capture all Writable values you'll need at the **start** of the handler:

```tsx
const myHandler = handler<...>(async (_event, { sendingThreads }) => {
  // Capture at start - this is the only .get() call
  const currentSending = sendingThreads.get();

  // Add item
  sendingThreads.set([...currentSending, threadId]);

  try {
    await sendEmail();
  } finally {
    // Use captured value, not a new .get()
    sendingThreads.set(currentSending.filter(id => id !== threadId));
  }
});
```

This works because:

1. Only one `.get()` call at handler start
2. Finally block uses plain JavaScript variable
3. No new reactive dependencies created in finally

## Real-World Example

**Pattern:** expect-response-followup.tsx - Email follow-up sender **Bug:** Send
button threw "Too many iterations" when clicked

### Before (Infinite Loop)

```tsx
const _confirmAndSend = handler<...>(
  async (_event, { sendingThreads, ... }) => {
    const currentSending = sendingThreads.get();
    sendingThreads.set([...currentSending, threadId]);

    try {
      await client.sendEmail({ ... });
    } finally {
      // PROBLEM: .get() inside finally
      sendingThreads.set(
        sendingThreads.get().filter((id) => id !== threadId),
      );
    }
  },
);
```

**Result:** Clicking "Send Follow-up" threw "Too many iterations: 101"

### After (Fixed)

```tsx
const sendFollowUp = handler<...>(
  async (_event, { sendingThreads, ... }) => {
    const currentSending = sendingThreads.get(); // Capture once
    sendingThreads.set([...currentSending, threadId]);

    try {
      await client.sendEmail({ ... });
    } finally {
      // FIXED: Use captured value
      sendingThreads.set(
        currentSending.filter((id) => id !== threadId),
      );
    }
  },
);
```

**Result:** Send works correctly, no errors.

## Key Rules

1. **Capture Writable values at handler start** - Single `.get()` call, store in
   variable
2. **Never call `.get()` in finally blocks** - Use the captured variable instead
3. **Applies to all Writables used in the handler** - Not just the "main" one
4. **Also applies to catch blocks** - Same reactive dependency issue

## Related Issues

- `2026-01-08-computed-inside-map-callback-infinite-loop.md` - Different cause
  (node identity)
- `2026-01-19-new-date-inside-computed-causes-oscillation.md` - Different cause
  (unstable values)

## Metadata

```yaml
topic: handlers, reactivity, writable, infinite-loop, finally-block
discovered: 2026-01-28
confirmed_count: 1
last_confirmed: 2026-01-28
sessions: [expect-response-followup-send-fix]
related_functions: handler, Writable, get, set
pattern: packages/patterns/google/extractors/expect-response-followup.tsx
commits: [dd1bb94b6]
status: confirmed
confidence: high
stars: 4
applies_to: [CommonTools]
```

## Guestbook

- 2026-01-28 - expect-response-followup.tsx send handler. Handler tracked
  "sending" state via `sendingThreads` Writable. Added threadId on start,
  removed in finally. The finally block called
  `sendingThreads.get().filter(...)` which created a new reactive dependency,
  causing infinite loop. Fixed by capturing `currentSending` at handler start
  and using it in finally. Simple fix, non-obvious cause.
  (expect-response-followup-send-fix)

---

**Remember:** The reactive system doesn't know you're "just cleaning up" in a
finally block. Every `.get()` creates a dependency.
