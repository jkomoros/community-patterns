# ifElse with Streams Loses .send() Method

**Date:** 2025-12-08
**Status:** Superstition (investigating)
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

## Workarounds Attempted

### 1. Call .send() on the Cell directly (not .get())
```typescript
// Instead of:
const stream = state.authRefreshStream.get();
stream.send({});  // Fails - stream doesn't have .send()

// Try:
state.authRefreshStream.send({});  // Cell's .send() - might work?
```

**Status:** Needs testing. The Cell has `.send()` but with a different signature.

### 2. Use .key() to access nested properties
```typescript
const refreshTokenCell = state.wishedAuthCharm.key("refreshToken");
refreshTokenCell.send({}, onCommit);  // Call .send() on the nested cell
```

**Status:** Needs testing. TypeScript allows this but runtime behavior uncertain.

### 3. Don't use ifElse - access stream conditionally in handler
```typescript
// Instead of constructing authRefreshStream with ifElse,
// access wishedAuthCharm directly in the handler:
const wishedCharm = state.wishedAuthCharm.get();
if (wishedCharm && !hasDirectAuth) {
  // Access the stream directly via property path
  state.wishedAuthCharm.refreshToken.send({}, onCommit);
}
```

**Status:** Most promising. Property access on OpaqueRef should preserve Stream methods.

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
confirmed_count: 1
last_confirmed: 2025-12-08
sessions: [gmail-agentic-search-reliability]
related_labs_docs: ~/Code/labs/docs/common/wip/KeyLearnings.md
status: superstition
stars:
```

## Guestbook

- 2025-12-08 - Investigating token refresh in gmail-agentic-search. ifElse with wishedAuthCharm.refreshToken creates a cell that doesn't expose .send(). Debug logs show `{Symbol(toCell): }` when calling `.get()`. Trying `.key("refreshToken").send()` as alternative approach. (gmail-agentic-search-reliability)
