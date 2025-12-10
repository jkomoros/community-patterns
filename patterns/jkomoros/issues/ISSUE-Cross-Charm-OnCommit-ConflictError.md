# Cross-Charm stream.send() onCommit Callback Causes ConflictError

## Summary

When using `stream.send(value, onCommit)` for cross-charm communication (e.g., triggering token refresh from a consumer charm), the `onCommit` callback causes a massive ConflictError (~363KB). The callback receives the wrong transaction context.

## Error

```
ConflictError: The application/json of of:baedreibzlm3ismrftfef5lvmmzbmt43liinhfbz3rvu3nol7i7xbkxiv6e
in did:key:z6Mkr1hFJfbF9mzyb7fC2q5QEvYHrqMFPAAVDq1y82997rNM already exists as
ba4jcbruc26dz5badeexe2gauh6qvxqrddxudn2pujy2qhoentbsbbepa
```

The error is ~363KB because it serializes the full cell content, which includes ~60 `$alias` properties each embedding the complete `rootSchema`.

## Reproduction

1. Consumer charm (gmail-agentic-search) uses `wish()` to locate provider charm (google-auth)
2. Consumer extracts refresh stream via `derive()`
3. Consumer calls `refreshStream.send({}, onCommit)` with a callback
4. Provider's handler runs and commits successfully
5. `onCommit` callback fires → **ConflictError**

```typescript
// In consumer charm's handler
await new Promise<void>((resolve, reject) => {
  (refreshStream.send as any)({}, (tx: any) => {
    const status = tx?.status?.();
    if (status?.status === "error") reject(...);
    else resolve();
  });
});
```

Note: Without the `onCommit` callback, `refreshStream.send({})` works fine.

## Root Cause Analysis

**Location:** `~/Code/labs/packages/runner/src/scheduler.ts` lines 552-557

The `onCommit` callback receives the **handler's transaction**, not the **caller's transaction**.

### Transaction Flow

1. **gmail-agentic-search** (consumer) runs a handler that calls `refreshStream.send({}, onCommit)`
2. Framework queues the event with the callback (scheduler.ts ~line 349-353)
3. In `execute()` (line 526), the event is dequeued
4. A **NEW transaction** is created at line 569: `const tx = this.runtime.edit();`
5. This `tx` is created in **google-auth's space**, not the caller's space
6. The google-auth handler runs with this tx
7. When commit completes, `onCommit(tx)` is called — but `tx` is **google-auth's transaction**
8. The callback in gmail-agentic-search runs with wrong transaction context
9. **ConflictError** because the CAS base state doesn't match gmail-agentic-search's expected state

### Relevant Code

**scheduler.ts execute():**
```typescript
// Line 569 - transaction created INSIDE execute(), bound to handler's space
const tx = this.runtime.edit();

// Line 573-584 - handler runs with this tx
this.runningPromise = Promise.resolve(
  this.runtime.harness.invoke(() => action(tx)),  // action is google-auth handler
).then(() => {
  finalize();
}).catch((error) => finalize(error));

// Line 533-567 - finalize calls onCommit with SAME tx
const finalize = (error?: unknown) => {
  // ...
  tx.commit().then(({ error }) => {
    // ...
    } else if (onCommit) {
      onCommit(tx);  // tx is google-auth's tx, not gmail-agentic-search's!
    }
  });
};
```

### Why `conflict.expected == null`

From `error.ts` lines 72-77, this specific error format means:
- The transaction tried to create a new fact (first assertion for an entity)
- But the entity already exists with a different fact reference

This happens because:
1. The transaction context (`tx`) belongs to google-auth's space
2. The callback may be creating references in an unexpected space
3. The CAS fails because entity IDs already exist from a different causal chain

## Proposed Fix

**Option 1: Status-Only Callback (Recommended)**

Change the `onCommit` callback to NOT receive a transaction. Cross-charm callbacks should be for notification, not transaction continuation.

**File:** `~/Code/labs/packages/runner/src/cell.ts` (lines 104-108)

```typescript
// Before
interface IStreamable<T> {
  send(
    value: AnyCellWrapping<T> | T,
    onCommit?: (tx: IExtendedStorageTransaction) => void,
  ): void;
}

// After
interface IStreamable<T> {
  send(
    value: AnyCellWrapping<T> | T,
    onCommit?: (result: { success: boolean; error?: Error }) => void,
  ): void;
}
```

**File:** `~/Code/labs/packages/runner/src/scheduler.ts` (lines 552-564)

```typescript
// Before
} else if (onCommit) {
  try {
    onCommit(tx);
  } catch (callbackError) {
    // ...
  }
}

// After
} else if (onCommit) {
  try {
    onCommit({
      success: !error,
      error: error as Error | undefined
    });
  } catch (callbackError) {
    // ...
  }
}
```

**Rationale:** Any continuation work should create its own transaction in its own context.

## Workaround (Not Implemented)

Until the framework is fixed, patterns can use polling instead of `onCommit`:

```typescript
// Fire and forget - NO onCommit callback
refreshStream.send({});

// Poll for token refresh completion
const maxWaitMs = 15000;
const pollIntervalMs = 500;
const originalExpiresAt = authData?.expiresAt || 0;
let elapsed = 0;

while (elapsed < maxWaitMs) {
  await sleep(pollIntervalMs);
  elapsed += pollIntervalMs;

  const currentAuth = auth.get();
  // Detect refresh via expiresAt change
  if (currentAuth?.expiresAt && currentAuth.expiresAt > originalExpiresAt) {
    // Token refreshed!
    break;
  }
}
```

This avoids the `onCommit` callback entirely by watching for cell changes.

## Concrete Pattern Files (For Debugging)

These patterns demonstrate the issue and can be used to reproduce/debug:

### Consumer Pattern (where ConflictError occurs)
**File:** `patterns/jkomoros/gmail-agentic-search.tsx`
- **Line 774:** The `refreshStream.send()` call with `onCommit` callback
- **Lines 771-790:** Full context of the token refresh attempt in `SearchGmail` tool

```typescript
// gmail-agentic-search.tsx:771-790
console.log("[SearchGmail Tool] Refreshing token via cross-charm stream...");
await new Promise<void>((resolve, reject) => {
  // Cast to bypass TS types - runtime supports onCommit (verified in cell.ts:105-108)
  (refreshStream.send as (event: Record<string, never>, onCommit?: (tx: any) => void) => void)(
    {},
    (tx: any) => {
      // onCommit fires after the handler's transaction commits
      const status = tx?.status?.();
      if (status?.status === "error") {
        reject(new Error(`Token refresh failed: ${status.error}`));
      } else {
        resolve();
      }
    }
  );
});
```

### Provider Pattern (handler that gets invoked)
**File:** `patterns/jkomoros/google-auth.tsx`
- **Line 161:** The `refreshTokenHandler` definition
- **Line 434:** Where `refreshTokenHandler` is exported as `refreshToken` Stream

```typescript
// google-auth.tsx:161-166
const refreshTokenHandler = handler<
  Record<string, never>,
  { auth: Cell<Auth> }
>(async (_event, { auth }) => {
  console.log('[DEBUG-AUTH] refreshTokenHandler called');
  // ... refreshes token via OAuth endpoint and updates auth cell
});

// google-auth.tsx:434
refreshToken: refreshTokenHandler({ auth }) as unknown as Stream<Record<string, never>>,
```

### Utility Function
**File:** `patterns/jkomoros/util/gmail-client.ts`
- **Line 701:** Alternative location where `refreshStream.send({}, onCommit)` is called

### Test Harness
**File:** `patterns/jkomoros/WIP/test-auth-consumer.tsx`
- A minimal test pattern for cross-charm stream communication
- Uses `Stream<T>` handler signature pattern that works WITHOUT onCommit

### Full Error Output
**File:** `~/Downloads/auth-token-conflict.txt` (363KB)
- Complete serialized ConflictError with the massive schema dump

## Impact

This blocks the "elegant" approach to cross-charm token refresh where the consumer knows exactly when the refresh completed. Current workaround is a hardcoded delay or the polling approach above.
