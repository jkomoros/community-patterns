---
topic: reactivity
discovered: 2025-12-03
confirmed_count: 2
last_confirmed: 2025-12-05
sessions: [gmail-auth-expiration-investigation, gmail-agentic-search-401-fix]
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
status: folk_wisdom
stars: ⭐⭐
---

> **API DEPRECATION (2025-12-15):** `derive()` is deprecated in favor of `computed()`. The guidance in this document still applies - just use `computed()` instead. See `2025-12-15-derive-cell-deprecated-use-computed-cell-of.md` for migration details.

# ✅ FOLK WISDOM - CONFIRMED

**This pattern has been confirmed multiple times.**

Original fix applied to `gmail-importer.tsx` (2025-12-03).
Same bug found and fixed in `gmail-agentic-search.tsx` (2025-12-05).

---

# Use Property Access Instead of derive() When You Need Writable Cells

## Problem

When you use `derive()` to extract a property from a charm or cell, the result is a **read-only projection**. Any attempts to write to it (via `.set()`, `.update()`, `.push()`) will silently fail.

This is particularly insidious because:
1. No error is thrown
2. The code appears to work (values update in memory temporarily)
3. Changes don't persist after reload
4. Very difficult to debug

**Example that FAILS:**
```typescript
// Wish for an auth charm
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });
const wishedAuthCharm = derive(wishResult, (wr) => wr?.result || null);

// ❌ WRONG: derive() creates a read-only projection
const auth = derive(wishedAuthCharm, (charm) =>
  charm?.auth || { token: "", /* defaults */ });

// Later in a handler...
async function refreshAuth() {
  const newToken = await fetchNewToken();
  auth.update(newToken);  // ❌ SILENTLY FAILS - auth is read-only!
}
```

**Symptoms:**
- Token refresh appears to work but doesn't persist
- Auth expires after ~1 hour even with valid refresh token
- Changes work within a session but are lost on reload
- No errors in console

## Solutions That Work

### Option 1: Property Access

Access the property directly via property path instead of `derive()`:

```typescript
// Wish for an auth charm
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });
const effectiveAuthCharm = derive(
  { authCharm, wishedAuthCharm },
  ({ authCharm, wishedAuthCharm }) => authCharm || wishedAuthCharm || null
);

// ✅ CORRECT: Access .auth as a property path (NOT derived)
const auth = effectiveAuthCharm.auth;

// Later in a handler...
async function refreshAuth() {
  const newToken = await fetchNewToken();
  auth.update(newToken);  // ✅ WORKS - auth is a live Cell reference!
}
```

**Why this works:**
- Property access (`charm.auth`) maintains the live Cell reference
- The framework traces through the property path to the source cell
- Writes propagate back to the original cell in the source charm
- Changes persist properly

### Option 2: ifElse() for Conditional Sources (Preferred)

When you need to choose between two auth sources (e.g., direct input vs wished charm), use `ifElse()`:

```typescript
import { ifElse } from "commontools";

// Get auth from either direct input or wished charm
const hasDirectAuth = derive(inputAuth, (a) => !!a?.token);
const auth = ifElse(
  hasDirectAuth,        // condition
  inputAuth,            // if true: use direct auth
  wishedAuthCharm.auth  // if false: use wished auth
);

// ✅ auth is writable - token refresh will work!
```

**Why ifElse() is often better:**
- Explicitly handles the "use A or B" pattern
- Both branches maintain writability
- Clearer intent than nested derives
- Used in `gmail-agentic-search.tsx` fix (2025-12-05)

## Key Insight

The difference is subtle but critical:

| Approach | Result | Writable? |
|----------|--------|-----------|
| `derive(charm, c => c?.auth)` | Read-only projection | ❌ No |
| `charm.auth` | Live Cell reference | ✅ Yes |

**Rule of thumb:**
- Use `derive()` when you only need to READ and transform data
- Use property access when you need to WRITE back to the source

## Context

Discovered while debugging Gmail importer auth expiration issue:
- Google OAuth tokens expire after ~1 hour
- `refreshAuth()` successfully got new tokens from backend
- `auth.update(newToken)` appeared to work but didn't persist
- Next API call still used expired token
- Root cause: `auth` was derived, making it read-only

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md`
- **Folk wisdom:** `community-docs/folk_wisdom/reactivity.md` - "Derives Cannot Mutate Cells"
- **Related superstition:** `2025-01-24-pass-cells-as-handler-params-not-closure.md`
- **Related superstition:** `2025-12-05-bgupdater-background-charm-service.md` - Background sync and token refresh

## Shared Utility Pattern

To avoid duplicating token refresh logic across patterns, extract API clients to shared utilities:

```
patterns/jkomoros/
├── util/
│   └── gmail-client.ts    # Shared GmailClient with token refresh
├── gmail-importer.tsx     # Uses GmailClient
└── gmail-agentic-search.tsx  # Also uses GmailClient
```

**Benefits:**
- Single place to fix auth bugs
- Consistent token refresh behavior
- DRY code across patterns

**See:** `patterns/jkomoros/util/gmail-client.ts` for implementation

## Anti-Pattern to Avoid

**DON'T cache refreshed data in memory to work around this:**
```typescript
// ❌ ANTI-PATTERN: Don't do this!
class ApiClient {
  private cachedAuth: Auth | null = null;

  refreshAuth() {
    const newToken = await fetchNewToken();
    this.cachedAuth = newToken;  // Bypasses framework state system
  }
}
```

This bypasses the framework's state system and creates:
- Inconsistent state between components
- Data that doesn't persist
- Hard-to-debug issues

**Instead, fix the root cause** by using property access for writable cells.

## Confirmation History

- [x] 2025-12-03: Fixed in `gmail-importer.tsx` - token refresh now persists
- [x] 2025-12-05: Found same bug in `gmail-agentic-search.tsx` - fixed with ifElse pattern
- [x] 2025-12-05: Added warning comments to `Auth` type in both files
- [x] 2025-12-05: Promoted to folk_wisdom

---

**This is now confirmed folk wisdom.** The pattern has been verified across multiple patterns.
