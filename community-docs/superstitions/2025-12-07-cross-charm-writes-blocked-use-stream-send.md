---
topic: handlers
discovered: 2025-12-07
confirmed_count: 1
last_confirmed: 2025-12-07
sessions: [gmail-auth-cross-charm-refresh]
related_labs_docs: ~/Code/labs/packages/runner/src/storage/transaction-implementation-guide.md
status: superstition
stars:
---

# Cross-Charm Writes in Handlers Fail - Use Stream.send() with onCommit

## Problem

When a handler in Charm A tries to write to a cell owned by Charm B, the write fails with `StorageTransactionWriteIsolationError`, even if the cell reference is valid and writable.

**Example that FAILS:**
```typescript
// In gmail-agentic-search.tsx handler
const startScan = handler(async (_, state) => {
  // Validate token, and if expired, refresh it
  const res = await fetch("/api/refresh", { ... });
  const newToken = await res.json();

  // ❌ FAILS with StorageTransactionWriteIsolationError
  // Even though auth is a valid Cell reference!
  state.auth.update(newToken);
});
```

**Error message:**
```
StorageTransactionWriteIsolationError: Can not open transaction writer for
did:key:z6Mk... because transaction has writer open for did:key:z6Mq...
```

**Symptoms:**
- Write appears to work but throws error
- Token refresh fails silently
- Works if auth is in the same charm (no cross-charm)

## Root Cause

The framework enforces **single-DID write isolation per transaction**:
- Each charm has its own DID (decentralized identifier)
- Handler transactions can only write to cells owned by one DID at a time
- If the auth cell belongs to `google-auth` but the handler runs in `gmail-agentic-search`, the transaction already has a writer open for the wrong DID

This is **intentional** framework behavior for data integrity, not a bug.

## Solution: Stream.send() with onCommit

Export a handler from the source charm as a `Stream`, then call it with `.send()` and wait for completion via `onCommit`:

### 1. Source charm exports a handler as Stream

```typescript
// In google-auth.tsx
const refreshTokenHandler = handler<
  Record<string, never>,
  { auth: Cell<Auth> }
>(async (_event, { auth }) => {
  const currentAuth = auth.get();
  const res = await fetch("/api/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: currentAuth.refreshToken }),
  });
  const json = await res.json();

  // ✅ This write succeeds - we're in google-auth's transaction context
  auth.update(json.tokenInfo);
});

// Export in Output interface and return
interface Output {
  auth: Auth;
  refreshToken: Stream<Record<string, never>>;  // NEW
}

return {
  auth,
  refreshToken: refreshTokenHandler({ auth }) as unknown as Stream<Record<string, never>>,
};
```

### 2. Consumer charm calls the stream with onCommit

```typescript
// In gmail-agentic-search.tsx
const startScan = handler(async (_, state) => {
  // Call the refresh stream and wait for completion
  await new Promise<void>((resolve, reject) => {
    state.authRefreshStream.send({}, (tx) => {
      // onCommit fires after the handler's transaction commits
      const status = tx?.status?.();
      if (status?.status === "done") {
        resolve();  // Success!
      } else if (status?.status === "error") {
        reject(status.error);
      } else {
        resolve();  // Unknown status, assume success
      }
    });
  });

  // ✅ Now read the updated auth cell
  const newAuth = state.auth.get();
  // Continue with the new token...
});
```

## Why This Works

- `Stream.send()` queues an event via `queueEvent()`
- Each queued event gets its **own fresh transaction**
- That transaction's writes use the **handler's charm's DID**
- The `onCommit` callback fires after the transaction commits
- You can then read the updated cell value

## Key Differences from "Derive Creates Readonly" Issue

| Issue | Cause | Solution |
|-------|-------|----------|
| Derive readonly | `derive()` creates read-only projection | Use property access |
| Cross-charm isolation | Transaction DID mismatch | Use `Stream.send()` with onCommit |

**Both can affect token refresh**, but they're different problems:
- If `auth.update()` silently does nothing → check if `auth` was derived
- If `auth.update()` throws `WriteIsolationError` → use Stream.send()

## Related

- **Folk wisdom:** `community-docs/folk_wisdom/handlers.md` - Full pattern documentation
- **Issue:** `patterns/jkomoros/issues/ISSUE-Token-Refresh-Blocked-By-Storage-Transaction.md`
- **Related:** `2025-12-03-derive-creates-readonly-cells-use-property-access.md` - Different issue, similar symptom
- **KeyLearnings:** `~/Code/labs/docs/common/wip/KeyLearnings.md` - "Exposing Actions via Handlers"

## Implementation Details (What We Did)

### Files Changed

1. **google-auth.tsx** - Added `refreshTokenHandler`:
   ```typescript
   const refreshTokenHandler = handler<
     Record<string, never>,
     { auth: Cell<Auth> }
   >(async (_event, { auth }) => {
     const currentAuth = auth.get();
     const refreshToken = currentAuth?.refreshToken;

     const res = await fetch(
       new URL("/api/integrations/google-oauth/refresh", env.apiUrl),
       {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ refreshToken }),
       },
     );

     const json = await res.json();
     auth.update({
       ...json.tokenInfo,
       user: currentAuth.user,  // Keep existing user info
     });
   });

   // Export in return:
   refreshToken: refreshTokenHandler({ auth }) as unknown as Stream<Record<string, never>>,
   ```

2. **util/gmail-client.ts** - Added `validateAndRefreshTokenCrossCharm()`:
   ```typescript
   export async function validateAndRefreshTokenCrossCharm(
     auth: Cell<Auth>,
     refreshStream: { send: (event: Record<string, never>, onCommit?: (tx: any) => void) => void } | null,
     debugMode: boolean = false,
   ): Promise<{ valid: boolean; refreshed?: boolean; error?: string }> {
     // ... validate token ...

     if (tokenExpired && refreshStream?.send) {
       await new Promise<void>((resolve, reject) => {
         refreshStream.send({}, (tx) => {
           const status = tx?.status?.();
           if (status?.status === "done") resolve();
           else if (status?.status === "error") reject(status.error);
           else resolve();
         });
       });

       // Re-read the updated auth
       const newAuth = auth.get();
       // ... validate new token ...
     }
   }
   ```

3. **gmail-agentic-search.tsx** - Pass refresh stream to handler:
   ```typescript
   // Access the refreshToken stream from wished auth charm
   type RefreshStreamType = { send: (event: Record<string, never>, onCommit?: (tx: any) => void) => void };
   const authRefreshStream = ifElse(
     hasDirectAuth,
     null as RefreshStreamType | null,
     wishedAuthCharm.refreshToken as unknown as RefreshStreamType | null
   );

   // Pass to startScan handler
   const boundStartScan = startScan({ ..., authRefreshStream });

   // In handler, cast and use:
   const refreshStream = state.authRefreshStream as RefreshStreamType | null;
   const validation = await validateAndRefreshTokenCrossCharm(state.auth, refreshStream, true);
   ```

### Type Casting Note

The framework's type inference doesn't fully preserve Stream function signatures through property accessors, so we need `as unknown as` casts. This is safe because the runtime types are correct.

## Context

Discovered while fixing Gmail OAuth token refresh in `gmail-agentic-search.tsx`:
- `google-auth.tsx` charm owns the auth cell
- `gmail-agentic-search.tsx` uses auth via `wish()`
- Token refresh called from handler failed with write isolation error
- Solution: Add `refreshToken` handler to google-auth, call via Stream.send()
