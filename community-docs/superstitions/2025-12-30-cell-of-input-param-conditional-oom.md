# Never Use Recipe Input Parameters in Cell.of() Conditionals

## Summary

Using recipe input parameters in conditional expressions passed to `Cell.of()` causes TypeScript compilation OOM (4GB+). This was discovered during CT-1148 bisection.

## The Problem

When you use a recipe input parameter inside a conditional expression that is passed to `Cell.of()`, TypeScript's type inference explodes, consuming all available memory during compilation.

### Symptom

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

During `npm run build` or TypeScript compilation, with memory usage exceeding 4GB.

## What Doesn't Work

```typescript
// BAD - CAUSES OOM
export const MyModule = recipe<MyInput, MyOutput>(
  "MyModule",
  ({ inputValue }) => {
    // TypeScript infers deeply nested types from conditional + input param
    const items = Cell.of<string[]>(inputValue ? [inputValue] : []);
    // ...
  }
);
```

**Problem:** When TypeScript sees `inputParam ? [inputParam] : []` as the argument to `Cell.of<T>()`, it tries to deeply infer the relationship between:
1. The recipe input type
2. The conditional expression's branches
3. The generic type parameter T of Cell.of<T>

This creates a type inference explosion. Using `as string` type casts doesn't help because TypeScript still tracks the origin type.

## Solution That Works

Initialize Cell with an empty/static value, then handle input initialization through `lift()`:

```typescript
// CORRECT - No input parameter in Cell.of()
export const MyModule = recipe<MyInput, MyOutput>(
  "MyModule",
  ({ inputValue }) => {
    // Initialize with static value - no input param reference
    const items = Cell.of<string[]>([]);

    // Handle input initialization through lift() instead
    const syncedValue = lift(({ input, arr }) => {
      if (arr.length > 0) return arr[0];
      return input;  // Using input here is fine
    })({ input: inputValue, arr: items });
    // ...
  }
);
```

**Why this works:** The `lift()` function doesn't trigger the same deep type inference because:
1. `Cell.of([])` has a simple, static type
2. `lift()` handles the input parameter separately from Cell initialization
3. The type relationship is computed at a different point in TypeScript's analysis

## Root Cause Analysis

The type inference explosion happens because:

1. Recipe input parameters have complex types derived from the generic `recipe<TInput, TOutput>` signature
2. Conditional expressions (`a ? b : c`) create union types that TypeScript must reconcile
3. `Cell.of<T>()` has its own generic parameter that must be unified with the argument type
4. When all three interact (input param + conditional + Cell.of generic), TypeScript explores exponentially many type paths

The result is similar to other OOM issues caused by VDOM type inference (see `2025-12-24-vdom-type-explosion-oom.md`), but the trigger is different.

## Key Principle

Never reference recipe input parameters directly inside `Cell.of()` arguments, especially in conditional expressions. Initialize Cells with static/empty values, then use `lift()`, `derive()`, or handlers to populate them based on input values.

## Related Superstitions

- `2025-12-24-vdom-type-explosion-oom.md` - Similar OOM issue caused by VDOM type inference

## Metadata

```yaml
topic: typescript, Cell.of, type-inference, compilation, OOM
discovered: 2025-12-30
confirmed_count: 1
last_confirmed: 2025-12-30
issue: CT-1148
confidence: high
related_docs:
  - docs/common/CELLS_AND_REACTIVITY.md
stars: 3
status: superstition
severity: critical
```

## Guestbook

- 2025-12-30 - Discovered during CT-1148 bisection, Cell.of() with input param conditional caused 4GB+ OOM
