# Superstition: Conditional fetchData Requires Computed URL (ifElse Doesn't Work)

**Date:** 2025-12-01
**Author:** jkomoros
**Pattern:** github-auth
**Status:** superstition

## Summary

`ifElse()` wrapping `fetchData()` does NOT prevent the fetch from executing. JavaScript evaluates all function arguments before calling the function. The correct approach is to use a computed URL that returns empty string when the condition is false.

## Observed Behavior

### Doesn't Work (ifElse wrapper)
```typescript
const hasToken = computed(() => !!token && token.length > 0);

// BUG: fetchData() is called BEFORE ifElse runs!
// JavaScript evaluates all arguments first, then calls the function.
const userResponse = ifElse(
  hasToken,
  fetchData<GitHubUser>({
    url: "https://api.github.com/user",  // Fetch happens immediately!
    // ...
  }),
  null
);
```

This causes 401 errors on initial load when `token` is empty because the fetch runs before `ifElse` can decide which branch to use.

### Works (Computed URL)
```typescript
const hasToken = computed(() => !!token && token.length > 0);

// URL is empty when no token, so fetchData skips the fetch entirely
const userUrl = computed(() => hasToken ? "https://api.github.com/user" : "");

const userResponse = fetchData<GitHubUser>({
  url: userUrl,  // Empty string = no fetch
  // ...
});
```

## Technical Details

Looking at `labs/packages/runner/src/builtins/fetch-data.ts` (lines 127-149):

```typescript
const { url } = inputsCell.getAsQueryResult([], tx);

if (!url) {
  // When URL is falsy, fetchData returns early without making the fetch
  if (currentPending !== false) pending.withTx(tx).set(false);
  if (currentResult !== undefined) result.withTx(tx).set(undefined);
  if (currentError !== undefined) error.withTx(tx).set(undefined);
  return;  // <-- Early exit, no fetch!
}
```

When the URL is falsy (empty string, null, undefined), `fetchData()` skips the HTTP request entirely and returns with `pending: false`, `result: undefined`, `error: undefined`.

## Pattern Used

From `patterns/jkomoros/github-auth.tsx`:
```typescript
// Computed URLs that are empty when no token (fetchData skips fetch when URL is empty)
const userUrl = computed(() => hasToken ? "https://api.github.com/user" : "");
const rateLimitUrl = computed(() => hasToken ? "https://api.github.com/rate_limit" : "");

// Fetch user info to validate token (skipped when URL is empty)
const userResponse = fetchData<GitHubUser>({
  url: userUrl,
  mode: "json",
  options: {
    method: "GET",
    headers: computed(() => ({
      "Authorization": `Bearer ${token}`,
      // ...
    })),
  },
});
```

## Impact

This bug caused 401 Unauthorized errors on initial page load when the GitHub auth pattern was created without a token. The API was being called with an empty/invalid Authorization header before the user had a chance to enter their token.

## Rule of Thumb

- **For conditional fetching:** Use a computed URL that returns empty string when condition is false
- **ifElse() is for UI:** Use `ifElse()` for conditional rendering in JSX, not for preventing side effects
- **JavaScript execution order:** All function arguments are evaluated before the function is called
- **fetchData behavior:** Empty/falsy URL = no fetch (early return)

## Related Patterns

- github-auth.tsx: Token validation (conditional GitHub API calls)
- Any pattern that needs to conditionally fetch based on some prerequisite
- Relates to "Cell is never falsy" superstition - ifElse(cellValue, ...) has same issue

## Testing

- Before fix: Network shows 401 errors to api.github.com/user and api.github.com/rate_limit on initial load
- After fix: No GitHub API requests until token is entered
- Verified with Playwright network inspection
