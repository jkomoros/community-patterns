# Use derive() When Accessing Properties of OpaqueRef Results

**Date:** 2025-12-17
**Status:** superstition
**Confidence:** high (verified through framework source investigation)

## Summary

When you need to access properties of a `computed()` result (which returns an `OpaqueRef<T>`), use `derive()` instead of nesting another `computed()`. The `derive()` function explicitly unwraps OpaqueRef parameters, while `computed()` cannot unwrap property access chains.

**Note for framework authors:** This documents a case where `derive()` is required and `computed()` cannot be used. The recommendation to "prefer computed() over derive()" does not cover this use case.

## The Problem

```typescript
// authInfo is a computed() result - it's an OpaqueRef<AuthInfo>
const authInfo = computed((): AuthInfo => {
  // ... aggregates multiple reactive sources into one AuthInfo object
  return {
    state: "ready",
    hasRequiredScopes: true,
    missingScopes: [],
    // ... more properties
  };
});

// Later, trying to derive display values from authInfo properties:

// FAILS with "opaque value" error:
const display = computed(() => authInfo.hasRequiredScopes ? "Yes" : "No");

// WORKS:
const display = derive(authInfo, (info) => info.hasRequiredScopes ? "Yes" : "No");
```

## Real-World Example

This pattern is common when building reusable utilities. For example, `useGoogleAuth()` returns an `authInfo` computed that aggregates auth state:

```typescript
// In google-auth-manager.tsx - returns OpaqueRef<AuthInfo>
const authInfo = computed((): AuthInfo => {
  const wr = wishResult;
  const authData = auth?.get?.() ?? null;
  // ... complex state derivation
  return { state, email, hasRequiredScopes, missingScopes, ... };
});

// In test-google-auth-manager.tsx - consuming the utility:
const { authInfo } = useGoogleAuth({ requiredScopes: ["gmail", "drive"] });

// FAILS - can't use computed() to access OpaqueRef properties:
const hasScopes = computed(() => authInfo.hasRequiredScopes ? "Yes" : "No");

// WORKS - derive() unwraps the OpaqueRef parameter:
const hasScopes = derive(authInfo, (info) => info.hasRequiredScopes ? "Yes" : "No");
```

## Why This Happens

1. **`computed()` returns an OpaqueRef**: When you call `computed(() => ...)`, the result is an `OpaqueRef<T>`, not a plain `T`.

2. **Property access on OpaqueRef returns another OpaqueRef**: OpaqueRefs are proxies. When you access `.property` on one, you get another OpaqueRef (not the unwrapped value).

3. **The transformer can only unwrap direct identifiers**: Inside `computed()`, the CTS transformer can unwrap direct OpaqueRef variables, but NOT property access chains like `authInfo.hasRequiredScopes`.

4. **`derive()` explicitly unwraps parameters**: The `preRegisterCaptureTypes()` function in `derive-strategy.ts` explicitly unwraps OpaqueRef parameters to their inner types.

## Framework Source Evidence

From `labs/packages/ts-transformers/src/closures/strategies/derive-strategy.ts`:

```typescript
function preRegisterCaptureTypes(...) {
  // Only unwrap if it's an OpaqueRef (kind === "opaque")
  if (kind === "opaque") {
    const unwrapped = unwrapOpaqueLikeType(exprType, checker);
    // Register unwrapped type in typeRegistry
  }
}
```

This means when you pass an OpaqueRef to `derive()`, the callback parameter receives the **unwrapped type**.

## Important: JSX vs computed() Context

**Property access on OpaqueRef works differently depending on context:**

| Context | Code | Works? | Why |
|---------|------|--------|-----|
| **JSX** | `{authInfo.hasRequiredScopes ? "Yes" : "No"}` | ✅ Yes | Runtime proxy handles reactivity automatically |
| **computed()** | `computed(() => authInfo.property)` | ❌ No | Transformer can't unwrap property chains at compile time |
| **derive()** | `derive(authInfo, info => info.property)` | ✅ Yes | Explicit parameter unwrapping |

This means you can always access OpaqueRef properties directly in JSX. The limitation only applies when you need the result inside another `computed()`.

## Rules

| Scenario | Correct Approach |
|----------|------------------|
| Simple closure with direct cells | `computed(() => cell.property)` |
| Accessing properties of another `computed()` result | `derive(computedResult, (val) => val.property)` |
| Mapping over nested array properties | `Array.from(val.array).map(...)` |
| Direct cell property access | `cell.property` (property access, not derive) |
| Property access in JSX | Direct access works: `{computedResult.property}` |

## Array.from() for Nested Arrays

Even inside `derive()`, nested array properties may still be proxied. Use `Array.from()` to force conversion to a plain array:

```typescript
// May fail - nested array still proxied
derive(info, (val) => val.items.map(x => transform(x)));

// Works - Array.from() breaks the proxy chain
derive(info, (val) => {
  const items = Array.from(val.items);
  return items.map(x => transform(x));
});
```

## Key Insight

The difference is about **what you're accessing properties on**:

- `cell.property` - Direct cell reference, works in `computed()`
- `computedResult.property` - OpaqueRef, needs `derive()` to unwrap

## Git History Investigation

**This behavior is intentional but explicitly marked as deferred:**

- **Author:** Gideon Wald (gideon@common.tools)
- **Commit:** `f188573e0` from December 11, 2025
- **PR:** #2233 "Fix/filter map inside derive"

The code in `derive-strategy.ts` (lines 250-254) says:
```typescript
} else if (ts.isPropertyAccessExpression(expr)) {
  // For property access like `state.items`, we want to register `items`
  // but the capture tree uses the full path
  // For now, skip these - they get handled separately
  continue;
}
```

**Key insight:** The phrase "For now" indicates this was a deliberate deferral, not an oversight. Property access IS handled via `captureTree`, but type registry pre-registration was deferred. This creates an edge case where nested transformations (like `.map()` → `.mapWithPattern()`) don't see the correct unwrapped types.

**Note:** This edge case was discovered within 6 days of the code being written. A framework issue has been filed as feedback.

## Related

- `labs/packages/ts-transformers/src/closures/strategies/derive-strategy.ts` - Type unwrapping logic
- `labs/packages/runner/src/cell.ts` - OpaqueRef proxy implementation
- Community doc: `2025-12-03-derive-creates-readonly-cells-use-property-access.md` - Related derive() guidance
- Framework issue: `patterns/jkomoros/issues/ISSUE-Property-Access-Type-Registry.md`
