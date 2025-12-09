---
topic: reactivity, jsx, derive
discovered: 2025-12-09
confirmed_count: 1
last_confirmed: 2025-12-09
sessions: [fix-gmail-agentic-search-auth-ui-nested-derive]
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
status: superstition
stars: ⭐
---

# Returning derive() From Inside derive() Returns a Cell, Not JSX

## Problem

When you return `derive()` from inside another `derive()` callback in JSX, it returns a **Cell object**, not the unwrapped JSX content. The UI simply doesn't render.

**This is different from the onClick-inside-derive issue** - there's no error, no hang, the content just silently doesn't appear.

### What Doesn't Work

```typescript
// ❌ BROKEN: Nested derive returns Cell, not JSX
{derive([isAuthenticated, hasError], ([authenticated, error]) => {
  if (authenticated) {
    return <div>Authenticated!</div>;
  }

  // BUG: This returns a Cell object, not the JSX inside!
  return derive(wishedAuthState, (state) => {
    if (state === "found") {
      return <div>Found auth charm</div>;
    }
    return <button>Connect</button>;  // NEVER RENDERS
  });
})}
```

**Symptom:** The "Connect" button never appears. No error, no hang - just nothing renders when `authenticated` is false.

### Why This Happens

1. The outer `derive()` expects its callback to return JSX (or a primitive)
2. When you `return derive(...)`, you're returning the Cell wrapper object itself
3. The framework doesn't automatically unwrap nested derives in JSX context
4. The Cell object gets passed to the DOM, which ignores it

## Solution

**Include all dependencies in a single derive:**

```typescript
// ✅ CORRECT: Single derive with all dependencies
{derive(
  [isAuthenticated, hasError, wishedAuthState],
  ([authenticated, error, authState]) => {
    if (authenticated) {
      return <div>Authenticated!</div>;
    }

    // Use authState directly (already unwrapped)
    if (authState === "found") {
      return <div>Found auth charm</div>;
    }
    return <button>Connect</button>;  // RENDERS!
  }
)}
```

**Why this works:**
- All reactive dependencies are in the outer derive's dependency array
- All values are unwrapped before the callback runs
- The callback returns plain JSX, not Cell objects

## Alternative: Use ifElse for Simple Conditionals

If you have a two-way branch based on a single cell:

```typescript
// ✅ ALSO WORKS: ifElse for simple conditionals
{ifElse(
  isAuthenticated,
  <div>Authenticated!</div>,
  <button>Connect</button>
)}
```

## Key Insight

| Pattern | Returns | Renders? |
|---------|---------|----------|
| `derive(deps, () => <jsx/>)` | JSX | ✅ Yes |
| `derive(deps, () => derive(...))` | Cell | ❌ No |
| `derive([a, b], ([a, b]) => ...)` | JSX | ✅ Yes |
| `ifElse(cond, jsx1, jsx2)` | JSX | ✅ Yes |

**Rule of thumb:** Never return `derive()` from inside another `derive()` callback. Flatten all dependencies into a single derive.

## Real-World Example

**File:** `patterns/jkomoros/gmail-agentic-search.tsx`

**Bug location:** Auth UI section around line 1308

**Before (broken):**
```typescript
{derive(
  [isAuthenticated, hasAuthError, tokenMayBeExpired],
  ([authenticated, authError, mayBeExpired]) => {
    if (authenticated) { /* ... */ }

    // BUG: Returns Cell, not JSX
    return derive(wishedAuthState, (state) => {
      if (state === "found-not-authenticated") { /* ... */ }
      return <ct-button>Connect Gmail</ct-button>;
    });
  }
)}
```

**After (fixed):**
```typescript
{derive(
  [isAuthenticated, hasAuthError, tokenMayBeExpired, wishedAuthState],
  ([authenticated, authError, mayBeExpired, authState]) => {
    if (authenticated) { /* ... */ }

    // authState already unwrapped, use directly
    if (authState === "found-not-authenticated") { /* ... */ }
    return <ct-button>Connect Gmail</ct-button>;
  }
)}
```

## Notes

- This bug can exist for a long time without being noticed if the outer conditions are usually true
- In gmail-agentic-search, the bug existed since the pattern was created but wasn't caught because testing usually had an existing auth charm
- After clearing all spaces (removing auth charms), the bug became apparent

## Related

- **Folk Wisdom:** `onclick-handlers-conditional-rendering.md` - Different issue (handlers inside derive)
- **Folk Wisdom:** `derive-creates-readonly-cells-use-property-access.md` - Different issue (writability)
- **Blessed:** `reactivity.md` - ifElse runs both branches

## Confirmation History

- [x] 2025-12-09: Fixed in `gmail-agentic-search.tsx` - "Connect Gmail" button now renders when no auth charm exists

---

**If you see content that should render but doesn't (no error, no hang), check for nested derives returning from inside other derives!**
