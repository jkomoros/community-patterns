# Cross-Charm Communication - Blessed

Framework author approved community knowledge about cross-charm communication in CommonTools.

**Official docs:** `~/Code/labs/docs/common/PATTERNS.md`

---

## Cross-Charm Stream Invocation via wish()

**Blessed by:** Berni (verbal guidance)
**Date:** 2024-12-10
**Framework version:** Current
**Verified:** Test patterns in `patterns/jkomoros/WIP/test-auth-consumer.tsx` and `google-auth-short-ttl.tsx`

---

### The Problem

When you use `wish()` to access another charm, Stream properties appear as **opaque objects** with a `$stream` marker, but no callable `.send()` method:

```typescript
// ❌ PROBLEM: Stream from wished charm is not directly callable
const wishedCharm = wish<MyCharm>({ query: "#myTag" });
const stream = derive(wishedCharm, (charm) => charm?.result?.refreshToken);

// At derive time, stream appears as:
// { $stream: true } - no .send() method!

// This will NOT work:
stream.send({});  // ERROR: stream.send is not a function
```

### The Solution: Declare Stream<T> in Handler Signature

**Pass the stream to a handler that declares `Stream<T>` in its type signature.** The framework will "unwrap" the opaque stream into a callable one:

```typescript
import { derive, handler, Stream, wish } from "commontools";

// 1. Extract the stream from the wished charm via derive
//    (It will appear as opaque object with $stream marker)
const refreshTokenStream = derive(wishedCharm, (charm) =>
  charm?.result?.refreshToken || null
);

// 2. Handler declares Stream<T> in its type signature
//    The framework provides a callable stream inside the handler!
const triggerRefresh = handler<
  Record<string, never>,  // Event type (empty for no-arg events)
  { refreshStream: Stream<Record<string, never>> }  // Props with Stream<T>
>((_event, { refreshStream }) => {
  // refreshStream now has a callable .send() method!
  refreshStream.send({});
});

// 3. Pass the stream to the handler in your UI
<button onClick={triggerRefresh({ refreshStream: refreshTokenStream })}>
  Refresh Token
</button>
```

### Why This Works

This is analogous to how handlers declare `Cell<T>` for cells they want to write to:

> "It just needs to know on the handler type that it wants a stream to send to, analogous to how handlers declare Cell for what they want to write to" - Berni

- At derive time, streams from wished charms appear as opaque `$stream` objects
- When passed to a handler with proper `Stream<T>` type signature, the framework unwraps them
- Inside the handler, the stream has a callable `.send()` method
- The event runs in the **source charm's transaction context** (not the caller's)

### Key Insight: Reactive Checks vs Handler Access

```typescript
// This reactive check will show "NO" because derive sees the opaque object:
const streamInfo = derive(wishedCharm, (charm) => {
  const stream = charm?.refreshToken;
  if (typeof stream?.send === "function") return "YES";  // Never true!
  return "NO";  // Always returns this
});

// BUT when passed to a handler with Stream<T> signature, it WORKS:
const attemptRefresh = handler<
  Record<string, never>,
  { stream: Stream<Record<string, never>> }
>((_event, { stream }) => {
  console.log(typeof stream.send);  // "function" - it works!
  stream.send({});
});
```

### Complete Example: Cross-Charm Token Refresh

```typescript
import { Cell, derive, handler, pattern, Stream, UI, wish } from "commontools";

type AuthCharm = {
  auth: { token: string; expiresAt: number };
  refreshToken: Stream<Record<string, never>>;
};

export default pattern(({ /* inputs */ }) => {
  // 1. Wish for the auth charm
  const wishResult = wish<AuthCharm>({ query: "#googleAuth" });
  const wishedCharm = derive(wishResult, (wr) => wr?.result || null);

  // 2. Extract the stream (will be opaque at derive time)
  const refreshStream = derive(wishedCharm, (charm) =>
    charm?.refreshToken || null
  );

  // 3. Handler with Stream<T> in signature gets callable stream
  const triggerRefresh = handler<
    Record<string, never>,
    { stream: Stream<Record<string, never>> }
  >((_event, { stream }) => {
    if (stream) {
      stream.send({});  // Works! Triggers handler in auth charm
    }
  });

  return {
    [UI]: (
      <div>
        <button onClick={triggerRefresh({ stream: refreshStream })}>
          Refresh Auth Token
        </button>
      </div>
    ),
  };
});
```

### Stream.send() Supports Optional onCommit Callback

**Updated:** 2024-12-10 - Verified in framework source code

`Stream.send()` supports an optional `onCommit` callback that fires after the transaction commits:

```typescript
// Basic usage - fire and forget
refreshStream.send({});

// With onCommit callback - wait for transaction to complete
await new Promise<void>((resolve, reject) => {
  refreshStream.send({}, (tx) => {
    const status = tx?.status?.();
    if (status?.status === "error") {
      reject(new Error(status.error));
    } else {
      resolve();
    }
  });
});
```

**Framework source:** `/packages/runner/src/cell.ts` lines 105-108:
```typescript
interface IStreamable<T> {
  send(
    value: AnyCellWrapping<T> | T,
    onCommit?: (tx: IExtendedStorageTransaction) => void,
  ): void;
```

This is useful when you need to wait for a cross-charm operation to complete before continuing.

---

## ct.render Forces Charm Execution

**Blessed by:** Berni (verbal guidance)
**Date:** 2024-12-09
**Framework version:** Current

---

### The Problem

When you "wish" for another charm (like an auth charm), it doesn't automatically execute:

```typescript
// ❌ PROBLEM: Just wishing for the charm doesn't make it run
const authCharm = wish("google-auth");

// The auth charm's handlers won't respond
// Token refresh won't work
// The charm is "imported" but not "running"
```

### The Solution

**Use `ct.render()` to force the charm to execute**, even if you don't need its UI:

```typescript
// ✅ CORRECT: ct.render forces the charm to execute
const authCharm = wish("google-auth");

return (
  <div>
    {/* Hidden div forces the auth charm to run */}
    <div style={{ display: "none" }}>
      {ct.render(authCharm)}
    </div>

    {/* Your actual UI */}
    <MainContent />
  </div>
);
```

### Why This Works

- `ct.render()` tells the framework "this charm needs to be active"
- The charm's reactive flows start running
- Handlers become responsive
- Token refresh and other background operations work

### Just Embedding UI vs ct.render

| Approach | Charm Executes? | Use When |
|----------|-----------------|----------|
| `wish()` alone | ❌ No | Just need to reference charm data |
| Embed charm's UI component | ? Maybe | Showing the charm's UI |
| `ct.render(charm)` | Yes | Need charm to be active (handlers, refresh, etc.) |

### Summary

**Rule of thumb:** If you need another charm's handlers to respond (like token refresh), use `ct.render()` to force it to execute - even in a hidden div.
