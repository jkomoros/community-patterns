# Inside computed(): Cells use .get(), Computed values don't

**Status:** Superstition (single observation)

## Problem

When accessing reactive values inside a `computed()` function, there's a distinction:
- **Cells** (input parameters with `Cell<>` type) need `.get()` to access their value
- **Other computed values** are accessed directly (no `.get()`) - they're already unwrapped

```typescript
// ❌ WRONG - effectiveToday is a computed, not a Cell
const todayHasStar = computed(() => {
  const todayStr = effectiveToday.get();  // ERROR: .get is not a function
  const allDays = days.get();
  return allDays.some((d) => d.date === todayStr);
});
```

```typescript
// ✅ CORRECT - Cells use .get(), computed values accessed directly
const effectiveToday = computed(() => {
  const override = debugDate.get();  // debugDate is a Cell, use .get()
  return override || getTodayString();
});

const todayHasStar = computed(() => {
  const todayStr = effectiveToday as unknown as string;  // computed value, no .get()
  const allDays = days.get();  // days is a Cell, use .get()
  return allDays.some((d) => d.date === todayStr && d.earned);
});
```

## Why This Happens

- **Cells** are reactive containers that wrap values. Inside `computed()`, they remain as Cell objects, so you call `.get()` to extract the current value.
- **Computed values** are the result of reactive computations. When you reference them inside another `computed()`, the framework automatically resolves them to their current value.

## TypeScript Consideration

TypeScript may not know the computed value is unwrapped. Use type casting:

```typescript
const todayStr = effectiveToday as unknown as string;
```

## General Rule

Inside `computed()`:
- `Cell<T>` → use `.get()` to get T
- `computed(() => T)` → access directly (is already T), cast if needed for TypeScript

## Symptoms

- Runtime error: `TypeError: xxx.get is not a function`
- The value being accessed is a computed, not a Cell

## Metadata

```yaml
topic: computed, cells, reactivity, get
discovered: 2025-11-30
session: star-chart-debug-refactoring
status: superstition
```

## Guestbook

- 2025-11-30 - Discovered while refactoring Star Chart debug approach. Had `effectiveToday` computed and tried to call `.get()` on it inside another `computed()`. Got "get is not a function" error. The fix was to access the computed value directly (with type cast) while using `.get()` only on actual Cells. (star-chart-debug-refactoring)
