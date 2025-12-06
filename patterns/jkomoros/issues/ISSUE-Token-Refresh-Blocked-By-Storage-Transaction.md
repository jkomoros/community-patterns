# Issue: Token Refresh Blocked by Storage Transaction Isolation

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

**This appears to be a framework limitation around cross-charm cell writes during transactions. Would appreciate guidance on the recommended pattern for this use case.**
