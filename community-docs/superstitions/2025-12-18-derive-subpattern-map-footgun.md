# Sub-Pattern Output Property .map() Causes Runtime Error

**Date:** 2025-12-18
**Author:** jkomoros
**Pattern:** food-recipe.tsx
**Status:** Framework Bug (workaround documented)

## Problem

When calling `.map()` on an array nested inside a **sub-pattern's computed output property**, the transformer incorrectly converts `.map()` to `.mapWithPattern()`, causing a runtime error.

**Runtime Error:** `dc.compatible.mapWithPattern is not a function`

## Root Cause (CONFIRMED)

This is a **framework bug** in the TypeScript transformer, NOT a usage error.

**The issue:** Sub-pattern output properties are **NOT registered in TypeRegistry**, while `derive()` and `computed()` results ARE registered. The transformer decides whether to convert `.map()` to `.mapWithPattern()` based on TypeRegistry lookup:

1. **First**: Check TypeRegistry (for synthetic/transformed nodes)
2. **Fallback**: Use TypeChecker (loses Cell brand for sub-pattern properties)

| Source | TypeRegistry Registration | Cell Brand Preserved? |
|--------|---------------------------|----------------------|
| `computed()` result | Registered (derive.ts:257-265) | Yes |
| `derive()` result | Registered (same code) | Yes |
| Sub-pattern property access | **NOT registered** | **LOST** |

**Location of bug:** `schema-injection.ts` around line 569-570. After building the call expression for pattern/recipe outputs, `typeRegistry.set(updated, resultType)` is never called (unlike derive.ts which does register its result types).

## Failing Pattern

```typescript
// analyzer is a sub-pattern call
const analyzer = RecipeAnalyzer({ ... });

// FAILS - regardless of whether using derive() or computed()
{computed(() => {
  const dc = analyzer.dietaryCompatibility;  // Sub-pattern output
  return dc.compatible.map((tag: string) => <span>{tag}</span>);  // RUNTIME ERROR
})}

// Even this FAILS - the transformer sees the source expression at compile-time
{computed(() => {
  const dc = analyzer.dietaryCompatibility;
  const tags = Array.from(dc.compatible);  // Array.from doesn't help!
  return tags.map((tag: string) => <span>{tag}</span>);  // Still transformed incorrectly
})}
```

## Working Workarounds

### Workaround 1: Intermediate Computed (BEST)

Extract arrays into separate `computed()` values BEFORE mapping. The trick is the intermediate computed result IS registered in TypeRegistry.

```typescript
// Create intermediates BEFORE the JSX - these ARE registered in TypeRegistry
const compatibleTags = computed(() => analyzer.dietaryCompatibility?.compatible || []);
const warningsList = computed(() => analyzer.dietaryCompatibility?.warnings || []);

// Now map on the intermediates - works because they're plain arrays
{compatibleTags.map((tag: string) => <span>{tag}</span>)}  // WORKS
{warningsList.map((warning: string) => <li>{warning}</li>)}  // WORKS
```

**Why it works**: `computed()` results ARE registered in TypeRegistry. The result type is `string[]` (plain array), not `OpaqueRef<string[]>`.

### Workaround 2: Spread Operator

```typescript
{computed(() => {
  const dc = analyzer.dietaryCompatibility;
  const arr = [...dc.compatible];  // Spread creates new plain array
  return arr.map((tag: string) => <span>{tag}</span>);  // WORKS
})}
```

**Why it works**: Spread creates a new array with plain `string[]` type, breaking the type chain.

### Workaround 3: Use Sub-Pattern's UI

```typescript
// Just use the sub-pattern's built-in UI
{analyzer[UI]}  // WORKS - uses sub-pattern's internal rendering
```

**Why it works**: The sub-pattern's internal `.map()` calls work fine.

### Workaround 4: Use .join() for Simple Text

```typescript
{computed(() => {
  const dc = analyzer.dietaryCompatibility;
  return <div>{dc.compatible.join(", ")}</div>;  // WORKS
})}
```

**Why it works**: Only `.map()` is transformed, not `.join()`.

## What DOESN'T Work

- `computed()` with `.map()` INSIDE - the `.map()` source is still sub-pattern property
- `Array.from()` alone - transformer sees the source expression at compile-time
- Type assertions (`as string[]`) - don't affect AST analysis
- `derive()` with destructuring - same issue

## Why Same Code Works in Sub-Pattern

The exact same `.map()` call works inside the sub-pattern because:

1. Inside `recipe-analyzer.tsx`, the `dietaryCompatibility` is a direct `computed()` result
2. That `computed()` IS registered in TypeRegistry with correct type
3. When accessing `dc.compatible.map()`, the transformer sees correct types

| Context | Works? | Why |
|---------|--------|-----|
| Inside sub-pattern (recipe-analyzer.tsx) | Yes | computed() result is registered |
| Parent pattern (food-recipe.tsx) | **No** | Sub-pattern output NOT registered |

## Framework Issue

See `patterns/jkomoros/issues/ISSUE-subpattern-map-typeregistry.md` for the full bug report.

**TL;DR:** Missing `typeRegistry.set(updated, resultType)` in `schema-injection.ts` after line 569.

## Guestbook

- 2025-12-18 - Confirmed: `dc.compatible.mapWithPattern is not a function` in food-recipe.tsx
- 2025-12-18 - Confirmed: Same code works in recipe-analyzer.tsx (inside sub-pattern)
- 2025-12-18 - Failed fix: `computed()` instead of `derive()` - still fails
- 2025-12-18 - Failed fix: `Array.from()` inside computed - still fails
- 2025-12-18 - Root cause: TypeRegistry not registering sub-pattern output properties
- 2025-12-18 - Working fix: Intermediate computed values to extract arrays BEFORE mapping
- 2025-12-18 - Fixed food-recipe.tsx using intermediate computed pattern
