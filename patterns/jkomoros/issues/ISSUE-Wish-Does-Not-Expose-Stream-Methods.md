# Issue: wish() Does Not Expose Stream.send() on Wished Charms

## Summary

When using `wish()` to access a charm, Stream properties are returned as opaque objects without the `.send()` method. This prevents cross-charm stream invocation entirely, even in the **same space**.

## Reproduction

### Test Charms

Two test charms are provided in `patterns/jkomoros/WIP/`:

1. **google-auth-short-ttl.tsx** - Auth charm that exports a `refreshToken` stream
2. **test-auth-consumer.tsx** - Consumer that wishes for the auth charm and tests stream access

### Setup

```bash
# Deploy auth charm to auth-test space
deno task ct charm new patterns/jkomoros/WIP/google-auth-short-ttl.tsx \
  --api-url http://localhost:8000 \
  --identity claude.key \
  --space auth-test

# Deploy consumer to SAME space
deno task ct charm new patterns/jkomoros/WIP/test-auth-consumer.tsx \
  --api-url http://localhost:8000 \
  --identity claude.key \
  --space auth-test
```

### Steps to Reproduce

1. Deploy both charms to the same space
2. Navigate to the auth charm and authenticate with Google
3. Favorite the auth charm (click star icon)
4. Navigate to the consumer charm
5. Observe the "Refresh Stream Access" section

### Expected Behavior

The consumer should be able to call `.send()` on the wished charm's `refreshToken` stream to trigger a token refresh in the auth charm's transaction context.

### Actual Behavior

The "Refresh Stream Access" section shows:
- **Available: NO**
- **Reason: stream is object, no .send() or .get()**

Expanding "Raw Charm Data" reveals:
```json
{
  "keys": ["$NAME", "$UI", "auth", "scopes", "selectedScopes", "refreshToken", "timeRemaining", "isExpired", "backlinks"],
  "refreshTokenType": "object",
  "refreshTokenKeys": ["$stream"]
}
```

The `refreshToken` property has a `$stream` marker internally but **no callable `.send()` method**.

## Additional Issue: Handler Cell Access

When handlers try to access wished charm cells (e.g., to inspect the stream), they crash with:

```
Error: Cannot create cell link: space is required.
This can happen when closing over (opaque) cells in a lift or derive.
Instead pass those cells into the lift or derive directly as Cell<> inputs.
```

This happens in the test consumer when clicking "Test Stream Access" or "Attempt Refresh" buttons.

## Code Analysis

### Auth Charm (google-auth-short-ttl.tsx)

The auth charm exports the stream correctly:

```typescript
// Line 426
refreshToken: refreshTokenHandler({ auth }) as unknown as Stream<Record<string, never>>,
```

### Consumer Charm (test-auth-consumer.tsx)

The consumer accesses the wished charm:

```typescript
// Line 81
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuthShortTTL" });

// Line 113-128 - Checking stream access
const refreshStreamInfo = derive(wishedCharm, (charm: any) => {
  if (!charm) return { available: false, reason: "no charm" };
  const stream = charm.refreshToken;
  if (!stream) return { available: false, reason: "no refreshToken property" };
  if (typeof stream.send === "function") return { available: true, reason: "has .send()" };
  // ... more checks ...
  return { available: false, reason: `stream is ${typeof stream}, no .send() or .get()` };
});
```

The stream exists as a property but `typeof stream.send` is not `"function"`.

## Impact

This issue blocks the use case of **shared authentication via favorites**:

1. User authenticates once in a google-auth charm
2. User favorites it with a tag (e.g., `#googleAuth`)
3. Other patterns use `wish({ query: "#googleAuth" })` to access the auth
4. When the token expires, patterns need to trigger `authCharm.refreshToken.send()` to refresh
5. **This is currently impossible** because `.send()` is not exposed

### Workarounds

The only current workaround is **direct pattern composition** (importing and instantiating the auth pattern directly), which defeats the purpose of shared auth via favorites.

## Environment

- CommonTools framework (local dev from ~/Code/labs)
- Testing with local dev server (localhost:8000)
- Both charms in same space (`auth-test`)

## Insight from Berni (Framework Author)

Berni clarified that `$stream` is the expected marker for streams. The key insight:

> "It just needs to know on the handler type that it wants a stream to send to, analogous to how handlers declare Cell for what they want to write to"

**The pattern should be:**
1. Extract the stream from the wished charm via derive
2. Pass it directly to the handler
3. Declare `Stream<T>` in the handler's type signature

```typescript
// Extract stream from wished charm
const refreshTokenStream = derive(wishedCharm, (charm) => charm?.refreshToken || null);

// Handler declares Stream<T> in its signature
const attemptRefresh = handler<
  Record<string, never>,
  { refreshStream: Stream<Record<string, never>> }
>((_event, { refreshStream }) => {
  // Framework should provide callable stream here
  refreshStream.send({}, onCommit);
});

// Pass stream to handler
<button onClick={attemptRefresh({ refreshStream: refreshTokenStream })} />
```

## TEST RESULT: SUCCESS!

**Berni's approach works!** When declaring `Stream<T>` in the handler signature:

```
refreshStream type: object
refreshStream keys: runtime, tx, synced, listeners, _frame, _link, _causeContainer, _kind
typeof refreshStream.send: function
Found stream with .send() - calling it...
refreshStream.send({}) called successfully
```

The handler received a callable stream with `.send()` method, and the cross-charm refresh handler was triggered in the auth charm.

**Key insight:** The reactive derive check (`refreshStreamInfo`) still shows "NO" because it's checking at derive time when the object is still opaque. But when passed to a handler with `Stream<T>` in the signature, the framework "unwraps" it into a callable stream.

## Resolution

**This is NOT a bug.** The pattern is:

1. Extract the stream via derive (it will appear as opaque object with `$stream`)
2. Pass it to a handler that declares `Stream<T>` in its type signature
3. The framework will provide a callable stream inside the handler

The confusion arose because:
- Reactive derives see the opaque `$stream` marker
- Handlers with proper type signatures get the unwrapped callable stream

## Questions for Framework Authors

1. ~~Is this the expected behavior of wish()? Should streams be callable on wished charms?~~
   **Answered:** Yes, when passed to handlers with `Stream<T>` type declaration.

2. ~~If the handler signature approach doesn't work, what's the recommended pattern?~~
   **Answered:** It works! This IS the recommended pattern.

3. Should there be documentation about this pattern? It's not obvious that streams from wished charms need to be passed through handler signatures to become callable.

## Related

- `ISSUE-Token-Refresh-Blocked-By-Storage-Transaction.md` - Original issue that led to this discovery
- `patterns/jkomoros/design/todo/berni-session-12-9.md` - Berni's suggested approach (which can't work due to this limitation)
