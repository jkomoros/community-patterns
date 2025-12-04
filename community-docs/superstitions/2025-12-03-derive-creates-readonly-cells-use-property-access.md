---
topic: reactivity
discovered: 2025-12-03
confirmed_count: 1
last_confirmed: 2025-12-03
sessions: [gmail-auth-expiration-investigation]
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
status: superstition
stars: ⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this works for you,** update the metadata and consider promoting to folk_wisdom.

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

## Solution That Seemed To Work

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

## Next Steps

- [ ] Verify fix works in deployed gmail-importer pattern
- [ ] Check if other patterns have similar issues with derived auth
- [ ] Consider promoting to folk_wisdom after confirmation

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
