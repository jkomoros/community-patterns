# Sort Mutates Array In-Place - Spread First in derive()

**SUPERSTITION** - Single observation, unverified. Use with skepticism!

## Topic

Using `.sort()` on arrays inside `derive()` callbacks

## Problem

When you call `.sort()` on an array inside a `derive()` callback, you get:

```
TypeError: Cannot assign to read only property '0' of object '[object Array]'
```

This happens because:
1. Arrays passed to `derive()` callbacks are **read-only proxies**
2. JavaScript's `.sort()` method **mutates the array in-place**
3. Trying to mutate a read-only proxy throws an error

### What Didn't Work

```typescript
// ❌ BROKEN: .sort() tries to mutate the read-only proxy
const localQueriesUI = (
  <div>
    {derive(localQueries, (queries: LocalQuery[]) =>
      queries && queries.length > 0 ? (
        <div>
          {queries
            .sort((a, b) => (b.effectiveness || 0) - (a.effectiveness || 0))  // ERROR!
            .map((query) => (
              <div>{query.query}</div>
            ))}
        </div>
      ) : null
    )}
  </div>
);
```

**Error:** `TypeError: Cannot assign to read only property '0' of object '[object Array]'`

The error occurs at the `.sort()` call because `queries` inside the derive callback is a read-only proxy.

## Solution That Worked

**Spread the array first to create a mutable copy:**

```typescript
// ✅ CORRECT: Spread creates a mutable copy, then sort
const localQueriesUI = (
  <div>
    {derive(localQueries, (queries: LocalQuery[]) =>
      queries && queries.length > 0 ? (
        <div>
          {[...queries]  // Create mutable copy!
            .sort((a, b) => (b.effectiveness || 0) - (a.effectiveness || 0))
            .map((query) => (
              <div>{query.query}</div>
            ))}
        </div>
      ) : null
    )}
  </div>
);
```

**Key insight:** `[...queries]` creates a new array that you own and can mutate freely.

## Other Methods That Mutate Arrays

Be careful with these methods inside derive() - they all mutate in-place:

| Method | Mutates? | Safe Alternative |
|--------|----------|------------------|
| `.sort()` | Yes | `[...arr].sort()` |
| `.reverse()` | Yes | `[...arr].reverse()` |
| `.splice()` | Yes | `arr.toSpliced()` (ES2023) or spread + slice |
| `.fill()` | Yes | `[...arr].fill()` |
| `.copyWithin()` | Yes | Spread first |

**ES2023 safe alternatives:** `.toSorted()`, `.toReversed()`, `.toSpliced()` return new arrays.

## Detection

If you see this error during pattern execution:
```
TypeError: Cannot assign to read only property '0' of object '[object Array]'
    at Array.sort (<anonymous>)
```

Search your code for:
```bash
grep -n "\.sort(" your-pattern.tsx
```

Check if any `.sort()` calls are inside:
- `derive()` callbacks
- `computed()` callbacks
- Any reactive context where arrays might be proxied

## Context

- **Pattern:** gmail-agentic-search.tsx (localQueriesUI component)
- **Use case:** Sorting local queries by effectiveness rating for display
- **Problematic code:** `queries.sort((a, b) => ...)` inside derive callback
- **Result:** Runtime error during scan execution, no queries displayed

## Related

- **Folk Wisdom: reactivity.md** - Understanding derive read-only context
- **Superstition: handlers-inside-derive-cause-readonly-error.md** - Similar proxy issue with handlers

## Metadata

```yaml
topic: derive, sort, array-mutation, readonly-proxy, TypeError
discovered: 2025-12-06
confirmed_count: 1
last_confirmed: 2025-12-06
sessions: [gmail-shared-search-strings]
related_functions: derive, sort, Array methods
status: superstition
stars: ⭐⭐
```

## Guestbook

- 2025-12-06 - gmail-agentic-search.tsx localQueriesUI. Had `queries.sort((a, b) => ...)` inside derive callback to display queries sorted by effectiveness. Got "Cannot assign to read only property '0'" during scan execution. Fix: changed to `[...queries].sort(...)`. Pattern now works correctly without errors. (gmail-shared-search-strings)

---

**Remember: This is a SUPERSTITION - just one observation. Test thoroughly in your own context!**
