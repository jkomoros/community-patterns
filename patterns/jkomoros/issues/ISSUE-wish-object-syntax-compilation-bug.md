# Framework Bug: wish({ query: }) Object Syntax Compiles to Empty Object

## Summary

The object-based `wish()` API introduced in commit `749c16acc` (PR #2163) doesn't work when patterns are compiled and deployed. The `{ query: "#favorites" }` parameter is compiled to an empty object `{}`.

## Problem

When using the new object syntax:
```typescript
const wishResult = wish<Array<Favorite>>({ query: "#favorites" });
```

The pattern fails at runtime with:
```
Wish target "{}" is not recognized.
```

The legacy string syntax still works:
```typescript
const wishResult = wish<Favorite>("#favorites");
```

## Root Cause

In `packages/runner/src/builder/built-in.ts`, the `wish` function creates a NodeFactory with:

```typescript
return createNodeFactory({
  type: "ref",
  implementation: "wish",
  argumentSchema: {
    type: "string",    // <-- BUG: Only accepts string!
    default: "",
  } as const satisfies JSONSchema,
  resultSchema,
})(param);
```

This `argumentSchema: { type: "string" }` causes the framework to coerce the object input to a string before it reaches the `wish` builtin.

Meanwhile, in `packages/runner/src/builtins/wish.ts`, the actual implementation uses:

```typescript
const TARGET_SCHEMA = {
  anyOf: [{
    type: "string",
    default: "",
  }, {
    type: "object",
    properties: {
      query: { type: "string" },
      path: { type: "array", items: { type: "string" } },
      context: { type: "object", additionalProperties: { asCell: true } },
      scope: { type: "array", items: { type: "string" } },
    },
  }],
} as const satisfies JSONSchema;
```

The `argumentSchema` in `built-in.ts` was never updated when the object-based API was added.

## Why Tests Pass But Deployment Fails

The unit tests in `packages/runner/test/wish.test.ts` call `runtime.run()` directly, which doesn't go through the full compilation pipeline. The tests work because they bypass the `argumentSchema` coercion that happens during pattern compilation.

## Affected Code

- **Bug location**: `packages/runner/src/builder/built-in.ts` lines 157-165
- **Related**: `packages/runner/src/builtins/wish.ts` - has correct schema
- **Commit that introduced object syntax**: `749c16acc` (PR #2163)
- **Commit that renamed tag to query**: `62e03294a` (PR #2168)

## Suggested Fix

Update `built-in.ts` to use the same schema as `wish.ts`:

```typescript
return createNodeFactory({
  type: "ref",
  implementation: "wish",
  argumentSchema: {
    anyOf: [{
      type: "string",
      default: "",
    }, {
      type: "object",
      properties: {
        query: { type: "string" },
        path: { type: "array", items: { type: "string" } },
        schema: { type: "object" },  // if supporting schema passthrough
        context: { type: "object", additionalProperties: { asCell: true } },
        scope: { type: "array", items: { type: "string" } },
      },
    }],
  } as const satisfies JSONSchema,
  resultSchema,
})(param);
```

## Reproduction Steps

1. Create a pattern using object syntax:
```typescript
import { pattern, wish, UI, NAME } from "commontools";

export default pattern<{}>(_ => {
  const wishResult = wish<any[]>({ query: "#favorites" });
  return {
    [NAME]: "Test Wish Bug",
    [UI]: <div>{wishResult?.result?.length ?? "loading..."}</div>
  };
});
```

2. Deploy with `deno task ct dev <pattern.tsx>`

3. Open in browser - see error in console:
```
Wish target "{}" is not recognized.
```

4. Change to legacy syntax `wish("#favorites")` - works correctly

## Affected Patterns

- `patterns/jkomoros/favorites-viewer.tsx` - was updating from `{ tag: }` to `{ query: }`
- `patterns/jkomoros/gmail-importer.tsx` - same
- `packages/patterns/favorites-manager.tsx` (labs official pattern) - also affected

## Workaround

Use the legacy string syntax until this is fixed:
```typescript
// Instead of:
const wishResult = wish<Array<Favorite>>({ query: "#favorites" });

// Use:
const wishResult = wish<Array<Favorite>>("#favorites");
```

Note: The legacy syntax returns the result directly, not wrapped in `{ result, error, [UI] }`.

---

**Discovered**: 2025-11-27
**Status**: Not filed (awaiting framework author review)
**Impact**: All patterns using wish() with object syntax
