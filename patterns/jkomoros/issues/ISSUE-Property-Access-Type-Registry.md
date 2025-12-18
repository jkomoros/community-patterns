# Property Access Type Registry Pre-Registration Edge Case

**Date:** 2025-12-17
**Status:** Feedback / Enhancement Request
**Linear:** [CT-1124](https://linear.app/common-tools/issue/CT-1124/property-access-type-registry-pre-registration-edge-case-pr-2233)
**Related PR:** #2233 "Fix/filter map inside derive"
**Discovered:** Within 6 days of PR #2233 being merged

## Summary

When accessing properties of a `computed()` result inside another `computed()`, the type registry doesn't see the correct unwrapped types. This causes nested transformations (like `.map()` on array properties) to fail with "opaque value" errors.

**Workaround exists:** Use `derive()` instead of nested `computed()` - derive explicitly unwraps OpaqueRef parameters.

## The Problem

```typescript
// authInfo is a computed() result - OpaqueRef<AuthInfo>
const authInfo = computed((): AuthInfo => {
  return { hasRequiredScopes: true, missingScopes: [], ... };
});

// FAILS with "opaque value" error:
const display = computed(() => authInfo.hasRequiredScopes ? "Yes" : "No");

// WORKS - derive() unwraps the parameter:
const display = derive(authInfo, (info) => info.hasRequiredScopes ? "Yes" : "No");
```

For arrays, even inside `derive()`, mapping may fail:
```typescript
// FAILS - .map() transformed to .mapWithPattern() incorrectly:
derive(authInfo, (info) => info.missingScopes.map(k => SCOPE_DESCRIPTIONS[k]));

// WORKS - Array.from() breaks the proxy chain:
derive(authInfo, (info) => {
  const scopes = Array.from(info.missingScopes);
  return scopes.map(k => SCOPE_DESCRIPTIONS[k]);
});
```

## Root Cause

In `derive-strategy.ts` (lines 250-254), property access expressions are explicitly skipped during type registry pre-registration:

```typescript
} else if (ts.isPropertyAccessExpression(expr)) {
  // For property access like `state.items`, we want to register `items`
  // but the capture tree uses the full path
  // For now, skip these - they get handled separately
  continue;
}
```

**Key phrase: "For now"** - This suggests the limitation was a deliberate deferral, not a permanent decision.

## Impact

1. **Confusing error messages:** Users get "opaque value" errors without understanding why `computed()` fails when `derive()` works
2. **Inconsistent guidance:** Framework recommends "prefer computed() over derive()" but this case requires derive()
3. **Extra boilerplate:** Users must use `Array.from()` to break proxy chains for array mapping

## Suggested Enhancement

Consider implementing property access type registry pre-registration so that:

```typescript
// This would work (currently fails):
computed(() => authInfo.hasRequiredScopes ? "Yes" : "No")
```

The `captureTree` already handles property access at runtime. The enhancement would be to also pre-register unwrapped types for nested transformations to see.

## Current Workarounds (Documented)

1. **Use `derive()` instead of nested `computed()`** for accessing OpaqueRef properties
2. **Use `Array.from()`** to break proxy chains before `.map()`
3. **Use direct JSX access** when possible - JSX property access works via runtime proxy

## Real-World Example

This was discovered in `google-auth-manager.tsx` - a utility that returns an `authInfo` computed aggregating auth state. Consumers needed `derive()` to access its properties for display.

See: `community-docs/superstitions/2025-12-17-derive-vs-computed-for-opaqueref-properties.md`

## Questions for Framework Authors

1. Is property access type registry pre-registration planned for a future PR?
2. Are there technical challenges that make this difficult?
3. Should the "prefer computed() over derive()" guidance be updated to note this exception?
