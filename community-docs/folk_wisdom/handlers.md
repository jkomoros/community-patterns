# Handlers - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/PATTERNS.md`

---

## Cross-Charm Writes Use Stream.send() (Fire-and-Forget)

**Status:** Updated December 2024 - onCommit callback deprecated

**Problem:** When a handler in Charm A tries to write to a cell owned by Charm B, it fails with `StorageTransactionWriteIsolationError`. This is because the framework enforces single-DID write isolation per transaction.

**Root Cause:**
- Each charm has its own DID (decentralized identifier)
- Handler transactions can only write to cells owned by one DID at a time
- Cross-charm writes violate this isolation constraint

**Solution:** Charm B exports a handler as Stream, Charm A calls it **fire-and-forget**:

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

2. **Charm A calls the stream (fire-and-forget) and relies on reactivity:**
```typescript
// In gmail-agentic-search.tsx handler

// Fire-and-forget - the auth charm will update its cell
authCharm.refreshToken.send({});

// DO NOT use onCommit callbacks - that's an internal runtime feature
// The framework automatically propagates cell updates to dependents
// Your derives will re-run when the auth cell changes
```

**DEPRECATED: onCommit callback**

The `onCommit` callback is an **internal runtime feature** and should NOT be used in patterns:
- Causes ConflictError in cross-charm scenarios (wrong transaction context)
- The framework author has confirmed it's not intended for pattern use
- Use reactive gating instead - gate your agent/UI on auth validity conditions

**Reactive alternative:** Instead of waiting for refresh to complete, use reactive gating:
```typescript
// Gate agent prompt on token validity
const agentPrompt = derive(
  [isRunning, prompt, tokenValid],
  ([running, p, valid]) => {
    if (!running || !valid) return "";  // Pause when token invalid
    return p;  // Run when valid
  }
);

// When auth refreshes, tokenValid becomes true, agent resumes automatically!
```

**See also:** `blessed/reactive-thinking.md` - The core reactive principle

**Related:**
- Issue: `patterns/jkomoros/issues/ISSUE-Cross-Charm-OnCommit-ConflictError.md` (resolved - by design)
- KeyLearnings: `~/Code/labs/docs/common/wip/KeyLearnings.md` (Exposing Actions via Handlers)
