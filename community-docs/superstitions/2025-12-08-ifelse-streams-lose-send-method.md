# ifElse with Streams Loses .send() Method

**Date:** 2025-12-08
**Status:** Folk Wisdom (confirmed fix)
**Symptom:** When using `ifElse` to conditionally select a Stream from a wished charm, `.send()` is not accessible

## The Problem

When you have a Stream in a wished charm and try to access it conditionally with `ifElse`, the resulting cell wrapper doesn't expose the `.send()` method:

```typescript
// wishedAuthCharm has a refreshToken: Stream<Record<string, never>>
const authRefreshStream = ifElse(
  hasDirectAuth,
  null,
  wishedAuthCharm.refreshToken  // This is a Stream
);

// Later in a handler:
const stream = state.authRefreshStream.get();
console.log(stream);        // {Symbol(toCell): }
console.log(stream?.send);  // undefined - .send() is NOT available!
```

**What we expected:** `stream.send({})` to call the Stream's handler
**What we got:** `stream` is a Cell wrapper object without `.send()` method

## Why This Happens

1. `ifElse` creates a new Cell that holds a **reference** to the chosen value
2. When you call `.get()` on this cell, you get the referenced value wrapped in an OpaqueRef proxy
3. The OpaqueRef proxy shows `{Symbol(toCell): }` - it has a `toCell` symbol to get back to the underlying cell
4. The `.send()` method IS defined on the Cell/OpaqueRef, but it's the Cell's `.send()`, not the Stream's

**The key insight:** `ifElse` doesn't "pass through" the stream - it creates a new cell that references it.

## The Fix: Use .key() to Access Streams

**Don't wrap Streams with `ifElse()`.** Instead, pass the charm cell to handlers and use `.key()` to access the Stream:

```typescript
// WRONG - Don't do this:
const authRefreshStream = ifElse(hasDirectAuth, null, wishedAuthCharm.refreshToken);
// Later: state.authRefreshStream.get()?.send() // FAILS - .send() is undefined

// CORRECT - Do this instead:
// Pass wishedAuthCharm and hasDirectAuth directly to handler state
// Then inside the handler:
if (!hasDirectAuthValue && wishedCharm) {
  const refreshTokenCell = state.wishedAuthCharm.key("refreshToken");
  (refreshTokenCell as any).send({}, onCommit);  // WORKS!
}
```

### Why .key() Works

The `.key("refreshToken")` method returns a Cell that properly forwards to the underlying Stream's methods, including `.send()`. This is because `.key()` returns a direct reference to the nested property's cell, not a wrapped value.

## Implementation Example

From gmail-agentic-search.tsx:

```typescript
// In handler definition - receive the charm cell directly
const searchGmailHandler = handler<
  { query: string },
  {
    auth: Cell<Auth>;
    wishedAuthCharm: Cell<GoogleAuthCharm | null>;
    hasDirectAuth: Cell<boolean>;
    // ...
  }
>(async (input, state) => {
  const hasDirectAuthValue = state.hasDirectAuth.get();
  const wishedCharm = state.wishedAuthCharm.get();

  let onRefresh: (() => Promise<void>) | undefined = undefined;

  if (!hasDirectAuthValue && wishedCharm) {
    const refreshTokenCell = state.wishedAuthCharm.key("refreshToken");
    onRefresh = async () => {
      await new Promise<void>((resolve, reject) => {
        (refreshTokenCell as any).send({}, (tx: any) => {
          const status = tx?.status?.();
          if (status?.status === "done") resolve();
          else if (status?.status === "error") reject(new Error(status.error));
          else resolve();
        });
      });
    };
  }
  // Use onRefresh callback...
});
```

## Related

- `2025-12-03-derive-creates-readonly-cells-use-property-access.md` - Similar issue with derive
- `2025-12-07-cross-charm-writes-blocked-use-stream-send.md` - The Stream.send() pattern we're trying to use
- KeyLearnings.md - Shows `counter.increment.send()` works inline

## Context

Discovered while investigating gmail-agentic-search token refresh. The pattern uses `wish()` to find a google-auth charm, then tries to call `refreshToken.send()` to trigger token refresh in the auth charm's transaction context.

## Metadata

```yaml
topic: streams, ifElse, reactivity, cells
discovered: 2025-12-08
confirmed_count: 2
last_confirmed: 2025-12-08
sessions: [gmail-agentic-search-reliability]
related_labs_docs: ~/Code/labs/docs/common/wip/KeyLearnings.md
status: folk_wisdom
stars:
```

## Guestbook

- 2025-12-08 - Investigating token refresh in gmail-agentic-search. ifElse with wishedAuthCharm.refreshToken creates a cell that doesn't expose .send(). Debug logs show `{Symbol(toCell): }` when calling `.get()`. Trying `.key("refreshToken").send()` as alternative approach. (gmail-agentic-search-reliability)
- 2025-12-08 - **CONFIRMED FIX**: Removed `authRefreshStream` cell entirely. Now passing `wishedAuthCharm` and `hasDirectAuth` directly to handlers and using `.key("refreshToken").send()` pattern. This works because `.key()` returns a proper Cell reference that preserves the Stream's `.send()` method. (gmail-agentic-search-reliability)
