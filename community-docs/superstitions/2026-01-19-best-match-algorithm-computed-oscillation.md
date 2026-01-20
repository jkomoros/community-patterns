# Avoid "Best Match" Algorithms in computed() - They Cause Oscillation

**Date:** 2026-01-19
**Status:** superstition
**Confidence:** medium
**Stars:** 3

## TL;DR - The Rule

**When matching/selecting items inside a `computed()`, avoid algorithms that find the "best match" by comparing all candidates.** If two candidates tie (equal score), which one wins depends on iteration order, causing **non-deterministic results and UI oscillation**.

Use **deterministic selection instead:** first match, last match, or explicit tie-breaker.

```tsx
// BROKEN - Non-deterministic when ties occur
const matchingPayment = computed(() => {
  let bestMatch = null;
  let bestDiff = Infinity;

  for (const payment of payments) {
    const diff = Math.abs(dueDate - payment.date);
    if (diff < bestDiff) {  // On tie, iteration order wins
      bestDiff = diff;
      bestMatch = payment;
    }
  }

  return bestMatch;
});

// CORRECT - Pre-sort ensures deterministic first match
const matchingPayment = computed(() => {
  const sorted = [...payments].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.find(p => isWithinWindow(p, dueDate));
});
```

---

## Summary

When you use a "best match" algorithm that iterates through all candidates and keeps the one with the smallest/largest/best score, **ties cause non-determinism**. If two items have the same score, which one wins depends on iteration order - and iteration order can vary between reactive evaluations.

In the CommonTools reactive system, `computed()` nodes re-evaluate frequently. If the selection logic produces different results on different evaluations (due to iteration order variance), the UI will oscillate between states.

## Why This Happens

JavaScript arrays may iterate in different orders between evaluations due to:
- Memory layout changes
- Object property enumeration order
- Garbage collection and reallocation
- Different code paths creating the array

When comparing with `<` (strict less-than), ties don't update the best match. But which item is seen first determines the winner:

```tsx
// Two payments both 2 days from due date
const payments = [
  { id: "A", daysDiff: 2 },
  { id: "B", daysDiff: 2 },
];

// Evaluation 1: Iterates A, B -> A wins (first seen)
// Evaluation 2: Iterates B, A -> B wins (first seen)
// Result: Bill flips between "paid by A" and "paid by B"
```

## Symptoms

- **UI flickers between two states** without any user action
- **Bill status flips** between paid/unpaid repeatedly
- **Selected item changes** on each render
- **Console shows repeated re-renders** of the same component

## Correct Patterns

### Option 1: Pre-Sort, Then First Match (Recommended)

```tsx
const matchingPayment = computed(() => {
  // Sort by the comparison criteria to ensure consistent order
  const sorted = [...payments].sort((a, b) => {
    const diffA = Math.abs(dueDate - a.date);
    const diffB = Math.abs(dueDate - b.date);
    if (diffA !== diffB) return diffA - diffB;
    // Tie-breaker: use ID for deterministic ordering
    return a.id.localeCompare(b.id);
  });

  // First match always wins - deterministic
  return sorted[0] || null;
});
```

### Option 2: Simple `.find()` With Pre-Sorted Data

```tsx
// Sort payments once when they're created/updated
const sortedPayments = computed(() =>
  [...payments].sort((a, b) => a.date.localeCompare(b.date))
);

// Then use .find() which is inherently deterministic
const matchingPayment = computed(() =>
  sortedPayments.find(p => isWithinWindow(p, dueDate))
);
```

### Option 3: Explicit Tie-Breaker in Loop

```tsx
const matchingPayment = computed(() => {
  let bestMatch = null;
  let bestDiff = Infinity;
  let bestId = "";  // Tie-breaker

  for (const payment of payments) {
    const diff = Math.abs(dueDate - payment.date);

    // Use ID as tie-breaker when diffs are equal
    if (diff < bestDiff || (diff === bestDiff && payment.id < bestId)) {
      bestDiff = diff;
      bestMatch = payment;
      bestId = payment.id;
    }
  }

  return bestMatch;
});
```

## Real-World Example

**Pattern:** Chase Bill Tracker - matching payments to bills
**Bug:** "Closest payment" algorithm caused bills to flip between paid/unpaid

### Before (Oscillation)

```tsx
// Find payment closest to bill due date
const matchingPayment = cardPayments.find((paymentDate) => {
  const daysDiff = (paymentMs - dueDateMs) / (1000 * 60 * 60 * 24);
  // Problem: if multiple payments are equally close, iteration order decides
  if (daysDiff >= -30 && daysDiff <= 60) {
    const absDiff = Math.abs(daysDiff);
    if (absDiff < bestDaysDiff) {
      bestDaysDiff = absDiff;
      matchingPayment = paymentDate;
    }
  }
});
```

**Result:** Bill status oscillated between "paid" and "unpaid" on each evaluation when two payments were equally close to the due date.

### After (Stable)

```tsx
// Sort payments chronologically first (deterministic order)
const sortedPayments = [...cardPayments].sort((a, b) => a.localeCompare(b));

// Use .find() - first valid match wins, deterministically
const matchingPayment = sortedPayments.find((paymentDate) => {
  const dueDateMs = new Date(billDueDate).getTime();
  const paymentMs = new Date(paymentDate).getTime();
  const daysDiff = (paymentMs - dueDateMs) / (1000 * 60 * 60 * 24);
  return daysDiff >= -30 && daysDiff <= 60;
});
```

**Result:** Consistent, deterministic bill matching. No more oscillation.

## Key Rules

1. **Avoid "best match" comparisons** - ties cause non-determinism
2. **Pre-sort data** before selecting to ensure consistent iteration order
3. **Use `.find()` over manual loops** - inherently picks first match
4. **Add explicit tie-breakers** if you must use comparison loops
5. **Test with duplicate values** - verify behavior when scores are equal

## Related Issues

- `2026-01-08-computed-inside-map-callback-infinite-loop.md` - Reactive node identity causing loops
- `2025-12-17-nested-computed-in-ifelse-causes-thrashing.md` - Similar oscillation symptom, different cause

## Metadata

```yaml
topic: reactivity, computed, matching, oscillation, non-determinism
discovered: 2026-01-19
confirmed_count: 1
last_confirmed: 2026-01-19
sessions: [chase-bill-tracker-payment-matching]
related_functions: computed, find, sort
pattern: packages/patterns/google/chase-bill-tracker.tsx
commits: [730b94dde]
status: superstition
confidence: medium
stars: 3
applies_to: [CommonTools, general-reactive-programming]
```

## Guestbook

- 2026-01-19 - Chase Bill Tracker payment matching. Used "closest payment to due date" algorithm with `Math.abs(daysDiff)` comparison. When two payments were equally close (same absolute day difference), which one matched depended on iteration order, causing the bill to oscillate between paid/unpaid states. Fixed by pre-sorting payments chronologically and using `.find()` for first valid match. (chase-bill-tracker-payment-matching)

---

**Remember:** This is a superstition based on a single observation. The core insight (non-deterministic selection causes oscillation) is likely sound, but verify in your specific context.
