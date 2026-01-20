# Calling new Date() Inside computed() Causes Oscillation

**Date:** 2026-01-19
**Status:** superstition
**Confidence:** high
**Stars:** 4

## TL;DR - The Rule

**Never call `new Date()` (or any time-dependent function) multiple times inside a `computed()` block.** Each evaluation creates a different timestamp, causing calculations to vary between evaluations. This can change sort order or threshold comparisons, triggering re-computation and UI oscillation.

**Fix:** Create a SINGLE reference date at the TOP of the computed block and pass it through all calculations.

```tsx
// BROKEN - new Date() called multiple times, varies between evaluations
const bills = computed(() => {
  return items.map(item => {
    const today = new Date();  // Different timestamp each evaluation!
    const daysUntilDue = Math.ceil((dueDate - today) / MS_PER_DAY);
    return { ...item, daysUntilDue };
  });
});

// CORRECT - Single reference date, deterministic
const bills = computed(() => {
  // Create ONE reference date at the TOP
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return items.map(item => {
    // Pass the same reference through all calculations
    const daysUntilDue = Math.ceil((dueDate - today) / MS_PER_DAY);
    return { ...item, daysUntilDue };
  });
});
```

---

## Summary

When you call `new Date()` inside a `computed()` block, each reactive re-evaluation gets a **different timestamp**. Even millisecond differences can cause:

1. **Sort order changes** - Items with similar dates may swap positions
2. **Threshold crossings** - A value near a boundary (e.g., 45 days) may flip between states
3. **Different calculation results** - Any time-based math produces different values

Since the computed's output differs from the previous evaluation, the reactive system triggers another re-evaluation, which gets yet another timestamp, causing an infinite oscillation loop.

## Why This Happens

The CommonTools reactive system re-evaluates `computed()` nodes when their dependencies change. If the computed's return value differs from the previous evaluation, it triggers updates to any subscribers.

```tsx
// Evaluation 1: new Date() returns 2024-01-15T10:30:00.123Z
// Evaluation 2: new Date() returns 2024-01-15T10:30:00.456Z (333ms later)
// Result: Different timestamps → different calculations → different output → re-evaluate
```

Even if the millisecond difference seems negligible, it can cause:
- `Math.ceil()` to round differently near day boundaries
- Sort comparisons to produce different orders
- Threshold checks to flip between true/false

## Symptoms

- **UI flickering/thrashing** - Values rapidly alternating between states
- **High CPU usage** - Constant re-evaluation loop
- **Console warnings** - "get >Xms" warnings from cell system detecting slow operations
- **Inconsistent display** - Same data shows different values on each render

## The Fix: Single Reference Date

Create ONE reference date at the **top** of your computed block, then pass it through all calculations:

```tsx
const bills = computed(() => {
  // CRITICAL: Create a single reference date for ALL calculations
  // This ensures deterministic results across re-evaluations
  const today = new Date();
  today.setHours(0, 0, 0, 0);  // Normalize to midnight for day comparisons

  const paidKeys = manuallyPaid.get() || [];
  const payments = paymentConfirmations || {};

  return items.map(item => {
    // Pass 'today' to all date calculations
    const daysUntilDue = calculateDaysUntilDue(item.dueDate, today);
    const isOverdue = daysUntilDue < 0;
    // ... rest of logic using 'today'
  });
});

// Helper function accepts reference date as parameter
function calculateDaysUntilDue(dueDate: string, referenceDate: Date): number {
  const due = parseDate(dueDate);
  return Math.ceil((due.getTime() - referenceDate.getTime()) / MS_PER_DAY);
}
```

## Related Time-Dependent Functions

This issue applies to ANY function that returns different values on each call:

- `new Date()` - Current timestamp
- `Date.now()` - Current timestamp in milliseconds
- `Math.random()` - Random number
- `performance.now()` - High-resolution timestamp
- `crypto.randomUUID()` - Random UUID

**Rule:** If a function's return value varies between calls, don't call it multiple times in a computed.

## Real-World Example

**Pattern:** Chase Bill Tracker - calculating days until bill due dates
**Bug:** Bills oscillated between "paid" and "unpaid" states

### Before (Oscillation)

```tsx
// calculateDaysUntilDue called new Date() internally
function calculateDaysUntilDue(dueDate: string): number {
  const today = new Date();  // PROBLEM: Different each call
  today.setHours(0, 0, 0, 0);
  const due = parseDate(dueDate);
  return Math.ceil((due.getTime() - today.getTime()) / MS_PER_DAY);
}

const bills = computed(() => {
  return items.map(item => {
    // Each call to calculateDaysUntilDue gets different 'today'
    const daysUntilDue = calculateDaysUntilDue(item.dueDate);
    const isLikelyPaid = daysUntilDue < -45;  // Threshold check varies!
    // ...
  });
});
```

**Result:** Bills near the -45 day threshold would flip between "likely paid" and "unpaid" on each evaluation, causing the sort order to change, triggering more evaluations.

### After (Stable)

```tsx
function calculateDaysUntilDue(dueDate: string, referenceDate: Date): number {
  const due = parseDate(dueDate);
  return Math.ceil((due.getTime() - referenceDate.getTime()) / MS_PER_DAY);
}

const bills = computed(() => {
  // CRITICAL: Single reference date for ALL calculations
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return items.map(item => {
    // Pass the SAME 'today' to all calculations
    const daysUntilDue = calculateDaysUntilDue(item.dueDate, today);
    const isLikelyPaid = daysUntilDue < -45;  // Deterministic!
    // ...
  });
});
```

**Result:** All calculations use the same reference date, producing deterministic results. No more oscillation.

## Key Rules

1. **Create time references at the TOP** of computed blocks
2. **Pass reference dates as parameters** to helper functions
3. **Never call `new Date()` in loops** inside computed
4. **Normalize dates** (e.g., `setHours(0,0,0,0)`) for day-level comparisons
5. **Avoid ALL time-dependent functions** being called multiple times in computed

## Differentiating from Related Issues

| Issue | Root Cause | Symptom |
|-------|-----------|---------|
| **This issue** | `new Date()` varies between evaluations | Oscillation, threshold flipping |
| Best-match algorithm | Iteration order varies on ties | Selection flipping between items |
| computed() inside .map() | New reactive nodes each evaluation | Infinite loop, high CPU |

## Metadata

```yaml
topic: reactivity, computed, Date, time, oscillation, non-determinism
discovered: 2026-01-19
confirmed_count: 1
last_confirmed: 2026-01-19
sessions: [chase-bill-tracker-oscillation-fix]
related_functions: computed, Date, Date.now, calculateDaysUntilDue
pattern: packages/patterns/google/chase-bill-tracker.tsx
commits: [2bda0c53c]
status: superstition
confidence: high
stars: 4
applies_to: [CommonTools, general-reactive-programming]
```

## Guestbook

- 2026-01-19 - Chase Bill Tracker. The `calculateDaysUntilDue()` function called `new Date()` internally, and was called multiple times in a loop inside the `bills` computed. Each call got a different timestamp, causing `daysUntilDue` values to vary slightly between evaluations. Bills near the -45 day "likely paid" threshold would flip states, changing sort order and triggering infinite re-evaluation. Fixed by creating a single reference date at the top of the computed and passing it to all calculations. (chase-bill-tracker-oscillation-fix)

---

**Remember:** This is a high-confidence superstition based on a clear cause-and-effect relationship. The principle (time-dependent functions cause non-determinism in reactive contexts) is well-established in reactive programming.
