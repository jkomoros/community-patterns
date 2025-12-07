# Handlers - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/PATTERNS.md`

---

## Cross-Charm Writes Require Stream.send() with onCommit

**Status:** Verified through framework code analysis (December 2024)

**Problem:** When a handler in Charm A tries to write to a cell owned by Charm B, it fails with `StorageTransactionWriteIsolationError`. This is because the framework enforces single-DID write isolation per transaction.

**Root Cause:**
- Each charm has its own DID (decentralized identifier)
- Handler transactions can only write to cells owned by one DID at a time
- Cross-charm writes violate this isolation constraint

**Solution:** Use `Stream.send()` with `onCommit` callback:

1. **Charm B exports a handler as a Stream:**
```typescript
// In google-auth.tsx
const refreshTokenHandler = handler<
  Record<string, never>,
  { auth: Cell<Auth> }
>(async (_event, { auth }) => {
  // Fetch new token from server
  const res = await fetch("/api/refresh", { method: "POST", ... });
  const newAuth = await res.json();

  // This write succeeds because we're in google-auth's transaction context
  auth.update(newAuth.tokenInfo);
});

// Export in output
return {
  refreshToken: refreshTokenHandler({ auth }) as unknown as Stream<Record<string, never>>,
};
```

2. **Charm A calls the stream and waits for completion:**
```typescript
// In gmail-agentic-search.tsx
await new Promise<void>((resolve, reject) => {
  authCharm.refreshToken.send({}, (tx) => {
    // onCommit is called after handler's transaction commits
    const status = tx?.status?.();
    if (status?.status === "done") {
      resolve();  // Success!
    } else if (status?.status === "error") {
      reject(status.error);  // Failed
    } else {
      resolve();  // Unknown status, assume success
    }
  });
});

// Now read the updated auth cell
const newAuth = auth.get();
```

**Why this works:**
- `Stream.send()` queues an event via `queueEvent()`
- Each queued event gets its own fresh transaction
- That transaction's writes use the **handler's charm's DID**
- The `onCommit` callback fires after the transaction commits (success or failure)

**Use cases:**
- Token refresh across charms (google-auth -> gmail-agentic-search)
- Any cross-charm state mutation from a handler

**Related:**
- Issue: `patterns/jkomoros/issues/ISSUE-Token-Refresh-Blocked-By-Storage-Transaction.md`
- KeyLearnings: `~/Code/labs/docs/common/wip/KeyLearnings.md` (Exposing Actions via Handlers)
- Transaction Guide: `~/Code/labs/packages/runner/src/storage/transaction-implementation-guide.md`
