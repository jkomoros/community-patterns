# Patterns Cannot Access Favorites State (isFavorite)

**Related to**: QA-BUGS-google-auth-1219.md (Bug #3)
**Severity**: Low (UX Polish)
**Component**: Framework runtime exposure
**Affects**: Any pattern wanting to conditionally render based on favorite status

---

## Summary

Patterns cannot determine if the current charm is favorited because the `isFavorite()` function requires a `Runtime` object which patterns don't have access to.

This prevents patterns from implementing conditional UI like:
- Hiding "Favorite this charm" reminder when already favorited
- Showing different UI based on favorite status
- Providing feedback about sharing status

---

## Use Case

In `google-auth.tsx`, after authentication, we show a green reminder box:

> **Favorite this charm** to share your Google auth across all your patterns!

This reminder should **hide** when the user has already favorited the charm. Currently it always shows because the pattern cannot check favorite status.

---

## Why It Doesn't Work

### The Function Exists

In `packages/charm/src/favorites.ts` (lines 99-115):

```typescript
export function isFavorite(runtime: Runtime, charm: Cell<unknown>): boolean {
  const favorites = getHomeFavorites(runtime);
  const current = favorites.get() || [];
  const resolved = charm.resolveAsCell();
  return current.some((entry) =>
    entry.cell.resolveAsCell().equals(resolved)
  );
}
```

### But Patterns Can't Call It

Patterns only have access to `getRecipeEnvironment()` which returns:
```typescript
{ apiUrl: string }
```

There's no `runtime` exposed to pattern code. The runtime is an internal framework object used by:
- Charm manager
- Storage system
- Transaction handling
- Favorites management

---

## Attempted Workarounds

### 1. Read favorites directly via cell

```typescript
// Cannot do - no access to home space cell from pattern
const favorites = homeSpaceCell.key("favorites");
```

### 2. Use a builtin

```typescript
// No such builtin exists
const isFavorited = isFavorited();  // Doesn't exist
```

### 3. Pass from framework

```typescript
// getRecipeEnvironment doesn't provide this
const { isFavorited } = getRecipeEnvironment();  // Not available
```

---

## Proposed Solution

Add a new builtin that patterns can call:

```typescript
// Option 1: Builtin function
import { isFavoritedCharm } from "commontools";

const isFavorited = isFavoritedCharm(); // Returns boolean for current charm

// Option 2: Add to getRecipeEnvironment
const env = getRecipeEnvironment();
const isFavorited = env.isFavoritedCharm?.() ?? false;
```

Implementation would involve the runtime checking favorites during pattern execution and exposing the result.

---

## Pattern-Level Workaround

None available. The pattern must always show the reminder, even when redundant.

A possible UX compromise is to make the reminder less prominent or add "(if not already)" text:

```tsx
{auth?.user?.email && (
  <div style={{ ... }}>
    <strong>Tip:</strong> Favorite this charm (if you haven't already)
    to share your Google auth across patterns.
  </div>
)}
```

---

## Related

- `FavoriteButton` component in shell already handles this (it has runtime access)
- The star button correctly toggles between ☆ and ⭐
- Only pattern-level code is affected

---

## Impact

- **Severity**: Low - core functionality works, just a UX polish issue
- **Patterns affected**: Any pattern wanting to show conditional content based on favorite status
- **Current workaround**: Show reminder unconditionally with softer language

---

## Notes

Discovered during QA testing 2025-12-19. Filed as local issue per user preference.
