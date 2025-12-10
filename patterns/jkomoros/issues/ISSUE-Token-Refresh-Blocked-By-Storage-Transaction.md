# Issue: Token Refresh Blocked by Storage Transaction Isolation

**Linear Issue:** [CT-1105](https://linear.app/common-tools/issue/CT-1105/token-refresh-blocked-by-storage-transaction-isolation-cross-charm)

## Summary

When trying to refresh an expired Gmail OAuth token within a handler, the framework's storage transaction isolation prevents the cell write, causing the refresh to fail with `StorageTransactionWriteIsolationError`.

## Use Case

**Pattern:** gmail-agentic-search.tsx

**What you're trying to accomplish:**
- Automatically refresh expired Gmail OAuth tokens when the user clicks "Scan"
- The `validateAndRefreshToken()` function detects an expired token and calls the refresh endpoint
- On successful refresh, it tries to update the auth cell with the new token via `auth.update(newAuthData)`

**Why you need this behavior:**
- OAuth access tokens expire after ~1 hour
- Users shouldn't have to manually re-authenticate every hour
- The refresh token allows getting new access tokens automatically

## Current Behavior

1. User clicks "Scan"
2. `startScan` handler is called
3. `validateAndRefreshToken()` detects token is expired (401 response)
4. Refresh endpoint is called successfully and returns new token
5. Attempting to write new token to auth cell fails with:

```
StorageTransactionWriteIsolationError: Can not open transaction writer for
did:key:z6MkjEpHcFe5qQ7aBrZMpWxPZCrWo8JmUK83sU5Lt4ikP5tJ beacuse transaction
has writer open for did:key:z6MkqZdD5YNSvfe9q5nTCN7jrAyCCn42p91neFQePxpSBJE5
```

6. Refresh fails, user sees "Token refresh error" message

## Code That Triggers the Issue

```typescript
// In util/gmail-client.ts validateAndRefreshToken()
const res = await fetch(
  new URL("/api/integrations/google-oauth/refresh", env.apiUrl),
  {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  },
);

const json = await res.json();
const newAuthData = json.tokenInfo as Auth;

// THIS LINE FAILS due to transaction isolation
auth.update(newAuthData);
```

The `auth.update()` call happens inside a handler, and the storage system blocks writes to cells from different DID keys during an active transaction.

## Analysis

The error message indicates two different DID keys are involved:
- The handler's transaction is using: `did:key:z6MkqZdD5YNSvfe9q5nTCN7jrAyCCn42p91neFQePxpSBJE5`
- The auth cell belongs to: `did:key:z6MkjEpHcFe5qQ7aBrZMpWxPZCrWo8JmUK83sU5Lt4ikP5tJ`

This suggests the auth cell was created by a different charm (google-auth charm) and the storage transaction isolation prevents cross-charm writes during a transaction.

## Questions

1. **Is there a way to update cells from different charms within a handler?**

2. **Should token refresh happen outside the handler transaction?** Perhaps using a separate mechanism like `setTimeout(() => auth.update(...), 0)` to defer the write?

3. **Is this a bug or intended isolation behavior?** If intended, what's the recommended pattern for refreshing tokens that live in a shared auth charm?

4. **Would using `wish()` to get the auth charm and calling a refresh handler on it work?** Instead of directly updating the cell, call a handler on the google-auth charm that handles its own refresh?

## Potential Workarounds

1. **Move auth cell into pattern** - Don't use shared google-auth charm, embed auth directly in the gmail pattern. Loses the benefit of shared auth.

2. **Queue refresh for later** - Detect expired token, fail this scan, but trigger a refresh that completes after the handler. User would need to click Scan again.

3. **Use setTimeout to defer write** - `setTimeout(() => auth.update(newAuthData), 0)` might escape the transaction context? (Untested)

4. **Add refresh handler to google-auth** - Call a handler on the google-auth charm that performs the refresh, so the write happens in that charm's transaction context.

## Environment

- CommonTools framework (latest from ~/Code/labs)
- Testing with local dev server (localhost:8000)
- Pattern: patterns/jkomoros/gmail-agentic-search.tsx
- Auth from: google-auth.tsx charm via wish()

## Related

- **Superstition:** `community-docs/superstitions/2025-12-03-derive-creates-readonly-cells-use-property-access.md` - Related cell write issues
- **Pattern:** gmail-agentic-search.tsx
- **Utility:** util/gmail-client.ts - Contains validateAndRefreshToken()

---

## Resolution (December 2024)

**Workaround #4 was implemented and verified:**

The solution uses `Stream.send()` with `onCommit` callback to execute the refresh in the google-auth charm's transaction context.

### Changes Made:

1. **google-auth.tsx**: Added `refreshTokenHandler` that fetches new token and updates the auth cell. Exported as `refreshToken: Stream<Record<string, never>>`.

2. **util/gmail-client.ts**: Added `validateAndRefreshTokenCrossCharm()` function that uses `Stream.send()` with `onCommit` callback to wait for the refresh handler to complete.

3. **gmail-agentic-search.tsx**: Updated to pass `authRefreshStream` from the wished auth charm to the validation function.

### How It Works:

- When token is expired, instead of calling `auth.update()` directly (which fails)
- We call `authCharm.refreshToken.send({}, onCommit)`
- This queues an event that runs in google-auth's transaction context
- The `onCommit` callback fires after that transaction commits
- We then re-read the auth cell to get the new token

### Key Insight:

`Stream.send()` queues an event via `queueEvent()`. Each event gets its **own fresh transaction**. That transaction's writes use the **handler's charm's DID**, not the caller's DID. This bypasses the cross-charm write isolation.

See: `community-docs/folk_wisdom/handlers.md` for the complete pattern.

---

## Re-Testing Results (December 10, 2024)

The "Resolution" section above claimed workaround #4 worked, but testing shows **it does NOT work** when using `wish()` to access the auth charm.

### Test Setup

Created two test charms in the same space (`auth-test`):
1. `google-auth-short-ttl.tsx` - Auth charm with 60-second TTL for testing
2. `test-auth-consumer.tsx` - Consumer that wishes for `#googleAuthShortTTL`

### Test 1: Same-Space Wish + Stream.send()

**Result: FAILED**

**Findings:**

1. **wish() successfully finds the charm** - The favorited auth charm is discovered
2. **Data is readable** - `auth`, `email`, token status all accessible via derived cells
3. **Stream is NOT accessible** - `refreshToken` appears as object with `$stream` key but **no `.send()` method**
4. **Handlers can't access wished cells** - When handlers try to call `.get()` on wished charm derived cells:
   ```
   Error: Cannot create cell link: space is required.
   This can happen when closing over (opaque) cells in a lift or derive.
   ```

**Raw charm data from wish:**
```json
{
  "keys": ["$NAME", "$UI", "auth", "scopes", "selectedScopes", "refreshToken", "timeRemaining", "isExpired", "backlinks"],
  "refreshTokenType": "object",
  "refreshTokenKeys": ["$stream"]
}
```

The `refreshToken` property has a `$stream` marker but **no callable `.send()` method**.

### Key Insight

The original "Resolution" was tested with **direct property access** (where the consumer pattern directly composes the auth pattern), NOT via `wish()`.

When using `wish()`:
- The wish API returns stream properties as **opaque objects**
- These objects contain `$stream` markers internally but don't expose the `.send()` method
- Even in the **SAME SPACE**, streams from wished charms are not callable

### Implications

### UPDATE: SOLVED (December 10, 2024)

**The original analysis was wrong!** Cross-charm stream invocation via wish() DOES work when using the correct pattern.

Berni clarified:
> "It just needs to know on the handler type that it wants a stream to send to, analogous to how handlers declare Cell for what they want to write to"

**The working pattern:**
1. Extract stream from wished charm via derive (appears as opaque `$stream` object)
2. Pass it to a handler that declares `Stream<T>` in its type signature
3. Framework provides callable stream inside the handler

```typescript
// Extract stream (will be opaque at derive time)
const refreshTokenStream = derive(wishedCharm, (charm) => charm?.refreshToken || null);

// Handler declares Stream<T> - framework unwraps it
const attemptRefresh = handler<
  Record<string, never>,
  { refreshStream: Stream<Record<string, never>> }
>((_event, { refreshStream }) => {
  refreshStream.send({});  // This works!
});

// Pass stream to handler
<button onClick={attemptRefresh({ refreshStream: refreshTokenStream })} />
```

**Test confirmed** - the refresh handler in the auth charm was triggered via cross-charm stream.send().

### Test Charms Location

- `patterns/jkomoros/WIP/google-auth-short-ttl.tsx`
- `patterns/jkomoros/WIP/test-auth-consumer.tsx`

See `patterns/jkomoros/issues/ISSUE-Wish-Does-Not-Expose-Stream-Methods.md` for full test documentation.

---

**RESOLVED: Cross-charm stream invocation works when handler declares Stream<T> in its type signature.**
