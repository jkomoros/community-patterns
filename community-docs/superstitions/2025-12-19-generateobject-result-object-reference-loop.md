# Reading generateObject Result Object Directly in Computed Causes Infinite Loop

**Date**: 2025-12-19
**Severity**: Critical
**Component**: Computed, generateObject, Reactivity

## Summary

Reading the `result` object from `generateObject` directly inside a `computed()` function causes an infinite reactive loop because object references change on every LLM update, even when the content is identical.

## Symptoms

1. Browser becomes unresponsive (100%+ CPU)
2. Pattern renders initially but then freezes
3. Network tab shows repeated LLM requests

## Root Cause

`generateObject` returns `{result, pending, error}` where `result` is an **object reference**:

1. LLM updates → new `result` object created (even if content is same)
2. Computed reads `result` → creates dependency on object reference
3. Object reference changes → computed re-evaluates
4. Re-evaluation reads `result` again → new object → LOOP

**Key insight**: Object references compare by identity (`obj1 === obj2` is false for different objects), not by value. Every LLM streaming update creates a new object.

## Failing Pattern

```typescript
const { result: extractionResult, pending } = generateObject({
  prompt: trigger,
  schema: mySchema,
});

const showEmptyState = computed(() => {
  const triggered = (trigger.get()?.trim() ?? "").length > 0;
  const hasItems = visibleItems.length > 0;

  // ❌ THIS CAUSES INFINITE LOOP
  const result = extractionResult;
  if (!result || typeof result !== "object") {
    return false;
  }

  return triggered && !pending && !hasItems;
});
```

**Why it loops:**
- Reading `extractionResult` creates a dependency on the object reference
- generateObject produces a new object on each update
- Computed re-runs → reads new object → dependency updated → re-runs...

## Working Pattern

```typescript
const { result: extractionResult, pending } = generateObject({
  prompt: trigger,
  schema: mySchema,
});

const showEmptyState = computed(() => {
  const triggered = (trigger.get()?.trim() ?? "").length > 0;
  const hasItems = visibleItems.length > 0;  // ✅ Primitive (number)
  const hasError = !!extractionError;        // ✅ Primitive (boolean)

  // ✅ Use primitives derived from result, NOT the result object itself
  return triggered && !pending && !hasItems && !hasError;
});
```

**Why it works:**
- `visibleItems.length` extracts a **primitive number** from the result
- Primitives compare by value (5 === 5)
- Even if the underlying object changes, `.length` stays the same
- No unnecessary re-evaluation

## Safe vs Dangerous Patterns

### Safe - Reading Primitives

```typescript
// ✅ Safe: .length returns a number (primitive)
const hasItems = visibleItems.length > 0;

// ✅ Safe: !! converts to boolean (primitive)
const hasError = !!extractionError;

// ✅ Safe: extracting a string field (primitive)
const name = result?.name;
```

### Dangerous - Reading Object References

```typescript
// ❌ Dangerous: raw object reference
const result = extractionResult;

// ❌ Dangerous: typeof check still reads the object
if (!result || typeof result !== "object") { ... }

// ❌ Dangerous: null check still reads the object
const hasResult = result !== undefined && result !== null;
```

## Test Evidence

CPU measurements:
- Without reading `extractionResult`: **2.4% CPU** ✅
- With reading `extractionResult` directly: **120% CPU** ❌ INFINITE LOOP

## Why This Differs From Other Loop Patterns

This is distinct from:
- **Read/write same cell**: Here there's no writing, just reading
- **Agent goal dependency**: Here the prompt doesn't change, just the result

The unique aspect: generateObject creates **new object references** on every update even when content is unchanged. The reactivity system sees "object changed" and re-evaluates.

## The Framework Wraps Computed Results

The framework wraps computed results in `OpaqueRef`. When you access `.length` on a wrapped array:
1. Framework extracts the primitive value
2. Returns the primitive, not the wrapped object
3. Dependency is on the primitive value, not object identity

This is why `fieldDiffs.length` is stable but `fieldDiffs` itself would not be.

## Related

- `2025-12-19-computed-set-get-same-cell-infinite-loop.md` - Different loop pattern (read/write same cell)
- `2025-12-08-generateObject-derive-goal-causes-infinite-loop.md` - Loop from agent goal dependency
- `2025-11-22-llm-generateObject-reactive-map-derive.md` - Safe patterns for using generateObject

## Tags

`computed` `infinite-loop` `generateObject` `object-reference` `reactivity` `CPU` `performance`
