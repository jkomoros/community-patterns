# Sub-Pattern Output Properties Not Registered in TypeRegistry

**Filed:** 2025-12-18
**Reporter:** jkomoros
**Severity:** Medium (has workaround, but non-obvious footgun)
**Component:** ts-transformers (schema-injection.ts)

## Summary

When accessing properties from a sub-pattern's output (pattern composition), the TypeRegistry does not have an entry for those property accesses. This causes the `.map()` transformer to fall back to TypeChecker, which loses the Cell brand information, resulting in incorrect `.map()` to `.mapWithPattern()` transformations and runtime errors.

## Error

```
TypeError: dc.compatible.mapWithPattern is not a function
```

## Minimal Reproduction

**Sub-pattern (recipe-analyzer.tsx):**
```typescript
interface RecipeAnalyzerOutput {
  dietaryCompatibility: {
    compatible: string[];
    warnings: string[];
  };
}

export default pattern<RecipeAnalyzerInput, RecipeAnalyzerOutput>(
  ({ ... }) => {
    const { result } = generateObject({ ... });

    const dietaryCompatibility = computed(() => result || { compatible: [], warnings: [] });

    return {
      [UI]: (
        <div>
          {computed(() => {
            const dc = dietaryCompatibility;
            // THIS WORKS - dc.compatible.map() transforms correctly
            return dc.compatible.map((tag: string) => <span>{tag}</span>);
          })}
        </div>
      ),
      dietaryCompatibility,
    };
  }
);
```

**Parent pattern (food-recipe.tsx):**
```typescript
const analyzer = RecipeAnalyzer({ ... });

// THIS FAILS at runtime
{computed(() => {
  const dc = analyzer.dietaryCompatibility;
  // dc.compatible.map() is incorrectly transformed to dc.compatible.mapWithPattern()
  return dc.compatible.map((tag: string) => <span>{tag}</span>);
})}
```

## Root Cause Analysis

### The Type Lookup Flow

1. `map-strategy.ts:shouldTransformMap()` decides if `.map()` should become `.mapWithPattern()`
2. It calls `getTypeAtLocationWithFallback()` to get the type of the array expression
3. `getTypeAtLocationWithFallback()`:
   - **First**: Checks TypeRegistry (WeakMap for synthetic/transformed nodes)
   - **Fallback**: Uses TypeChecker

### The Gap

| Expression | TypeRegistry Entry? | Correct Type Preserved? |
|------------|---------------------|------------------------|
| `computed(() => [...])` result | YES (derive.ts:257-265) | YES |
| `derive(x, fn)` result | YES (same code) | YES |
| `analyzer.dietaryCompatibility` | **NO** | **NO** - falls back to TypeChecker |
| `dc.compatible` (nested property) | **NO** | **NO** - loses Cell brand |

### Where Registration Happens (and Doesn't)

**derive.ts (lines 257-265) - WORKS:**
```typescript
if (context.options.typeRegistry && context.checker) {
  registerDeriveCallType(
    deriveCall,
    resultTypeNode,
    undefined,
    context.checker,
    context.options.typeRegistry,
  );
}
```

**schema-injection.ts (around line 569-570) - MISSING:**
```typescript
const resultSchemaCall = createToSchemaCall(context, resultTypeNode);
if (resultType && typeRegistry) {
  typeRegistry.set(resultSchemaCall, resultType);  // Only registers schema call
}
const updated = buildCallExpression(inputSchemaCall, resultSchemaCall);
// MISSING: typeRegistry.set(updated, resultType);  <-- Should be here!
return ts.visitEachChild(updated, visit, transformation);
```

The pattern/recipe call expression is built, but its result type is never registered in TypeRegistry.

## Proposed Fix

Add TypeRegistry registration for pattern call expressions in `schema-injection.ts`:

```typescript
const updated = buildCallExpression(inputSchemaCall, resultSchemaCall);
if (resultType && typeRegistry) {
  typeRegistry.set(updated, resultType);  // Register the pattern call result
}
return ts.visitEachChild(updated, visit, transformation);
```

This may also need to be done for:
- `when()` expressions
- `unless()` expressions
- `ifElse()` expressions
- Any other transformed call that returns a reactive value

## Why This Is Subtle

1. **Works inside the sub-pattern**: The `computed()` inside recipe-analyzer.tsx works fine because that computed IS registered
2. **Looks correct**: The TypeScript types appear correct to the IDE
3. **Only fails at runtime**: The transformer makes incorrect decisions at compile-time
4. **Non-obvious workarounds**: The fix requires understanding the compile-time/runtime distinction

## Current Workaround

Extract arrays into intermediate `computed()` values BEFORE mapping:

```typescript
// These ARE registered in TypeRegistry
const compatibleTags = computed(() => analyzer.dietaryCompatibility?.compatible || []);
const warningsList = computed(() => analyzer.dietaryCompatibility?.warnings || []);

// Now .map() works correctly
{compatibleTags.map((tag: string) => <span>{tag}</span>)}
```

See: `community-docs/superstitions/2025-12-18-derive-subpattern-map-footgun.md`

## Affected Code

- `packages/ts-transformers/src/transformers/opaque-ref/schema-injection.ts` (primary bug location)
- `packages/ts-transformers/src/closures/strategies/map-strategy.ts` (decision logic)
- `packages/ts-transformers/src/ast/utils.ts` (getTypeAtLocationWithFallback)
- `packages/ts-transformers/src/transformers/builtins/derive.ts` (shows correct pattern)

## Questions for Framework Authors

1. Is the proposed fix (registering pattern call results in TypeRegistry) the correct approach?
2. Are there other transformed expressions that should also be registered?
3. Should there be a general "register all transformed call expressions" pattern?
4. Is there a deeper architectural issue with how sub-pattern outputs are typed?
