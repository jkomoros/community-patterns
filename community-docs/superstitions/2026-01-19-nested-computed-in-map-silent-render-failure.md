# Nested computed() in .map() Can Cause Silent Rendering Failures

**Date:** 2026-01-19
**Status:** superstition (needs more verification)
**Confidence:** medium
**Stars:** 3

## TL;DR - The Rule

**Using `computed()` inside a `.map()` callback can cause the entire map output to silently fail to render.** The pattern appears to work (no errors), but the mapped content simply doesn't appear in the DOM.

```tsx
// BROKEN - Nested computed() inside .map() may cause silent render failure
{bills.map((bill) => {
  const isPaid = computed(() => paidKeys.get().includes(bill.key));
  return (
    <div>
      {ifElse(isPaid, "Paid", bill.amount)}  // This may not render at all
    </div>
  );
})}

// CORRECT - Use direct property access or ifElse() without nested computed()
{bills.map((bill) => (
  <div>
    {ifElse(
      computed(() => paidKeys.get().includes(bill.key)),
      "Paid",
      bill.amount
    )}
  </div>
))}

// OR - Pre-compute the derived values outside the map
const billsWithStatus = computed(() => {
  const paid = paidKeys.get();
  return bills.map(b => ({
    ...b,
    isPaid: paid.includes(b.key)
  }));
});

{billsWithStatus.map((bill) => (
  <div>{bill.isPaid ? "Paid" : bill.amount}</div>
))}
```

---

## Summary

When iterating over a reactive array with `.map()` and creating `computed()` values inside the callback, the entire map output can silently fail to render. This is distinct from:

1. **Infinite loops** (covered in `2026-01-08-computed-inside-map-callback-infinite-loop.md`) - those cause CPU spikes and hangs
2. **JSX wrapped in computed()** (covered in `2026-01-19-jsx-inside-computed-breaks-reactivity.md`) - that causes stale UI updates

This issue causes **no errors and no infinite loops** - the mapped content simply doesn't appear.

## Symptoms

- **Mapped content doesn't render** - No elements appear from the `.map()`
- **No console errors** - Pattern loads without any visible errors
- **No infinite loops** - CPU usage is normal
- **Other parts of the UI work** - It's specifically the mapped section that fails
- **Works initially sometimes** - May work on first render, fail on updates

## Why This May Happen

The interaction between:
1. Reactive array iteration (`.map()` on a Cell)
2. Nested `computed()` creation inside the callback
3. Reading from other Cells inside that computed

...can create a situation where the reactive context gets confused about:
- Which dependencies belong to which computation
- When to re-run which parts of the render

This is speculative - more investigation is needed to understand the exact mechanism.

## Correct Patterns

### Option 1: Inline computed() directly in ifElse()

```tsx
{bills.map((bill) => (
  <div>
    {ifElse(
      computed(() => paidKeys.get().includes(bill.key)),
      <span>Paid</span>,
      <span>{bill.amount}</span>
    )}
  </div>
))}
```

### Option 2: Pre-compute derived state

```tsx
const billsWithPaidStatus = computed(() => {
  const paidKeySet = new Set(paidKeys.get());
  return bills.map(bill => ({
    key: bill.key,
    amount: bill.amount,
    isPaid: paidKeySet.has(bill.key)
  }));
});

// In render - just use plain values
{billsWithPaidStatus.map((bill) => (
  <div>{bill.isPaid ? "Paid" : bill.amount}</div>
))}
```

### Option 3: Direct property access without intermediate computed()

```tsx
{bills.map((bill) => (
  <div>
    <span>{bill.amount}</span>
    <span>{bill.dueDate}</span>
  </div>
))}
```

## Real-World Example

**Pattern:** Chase Bill Tracker
**Bug:** List of bills wasn't rendering at all - empty section where bills should appear

### Before (Silent Failure)

```tsx
{unpaidBills.map((bill) => {
  const isPaid = computed(() => manuallyPaid.get().includes(bill.key));
  return (
    <div>
      <span>{bill.payee}</span>
      <span>{bill.amount}</span>
      <button onClick={markAsPaid({ paidKeys: manuallyPaid, billKey: bill.key })}>
        {ifElse(isPaid, "Undo", "Mark Paid")}
      </button>
    </div>
  );
})}
```

**Result:** Bills section was completely empty. No errors in console.

### After (Works)

```tsx
{unpaidBills.map((bill) => (
  <div>
    <span>{bill.payee}</span>
    <span>{bill.amount}</span>
    <button onClick={markAsPaid({ paidKeys: manuallyPaid, bill })}>
      Mark Paid
    </button>
  </div>
))}
```

**Result:** Bills render correctly.

## Differentiating from Related Issues

| Issue | Symptom | Root Cause |
|-------|---------|------------|
| **This issue** | Silent render failure, no errors | Nested computed in map callback breaks render |
| computed() inside map + async | Infinite loop, CPU spike | Feedback loop with volatile identity |
| JSX wrapped in computed() | UI doesn't update | JSX transformer skips reactive wrapping |
| Reactive refs to handlers | Error message | Context boundary crossing |

## Investigation Needed

This superstition needs more verification:

1. **Is this consistently reproducible?** Or was it a combination of factors?
2. **What's the exact mechanism?** Why does this cause silent failure vs errors?
3. **Does it depend on what's read inside computed()?** (e.g., reading from other Cells vs local values)
4. **Is it related to the `2025-12-14-inline-computed-in-map-is-fine.md` guidance?** That says inline computed() IS fine...

## Key Rules (Tentative)

1. **Avoid assigning computed() to a variable inside .map() callbacks** - inline it or pre-compute
2. **If you need per-item reactive state, use ifElse() with inline computed()**
3. **For complex derived state, pre-compute outside .map()** and iterate over plain values
4. **If mapped content doesn't render, suspect nested computed()** as a potential cause

## Related Superstitions

- `2025-12-14-inline-computed-in-map-is-fine.md` - Says inline computed IS fine (may need reconciliation)
- `2026-01-08-computed-inside-map-callback-infinite-loop.md` - Different symptom (infinite loops)
- `2026-01-19-jsx-inside-computed-breaks-reactivity.md` - Different symptom (stale updates)

## Metadata

```yaml
topic: reactivity, computed, map, rendering, silent-failure
discovered: 2026-01-19
confirmed_count: 1
last_confirmed: 2026-01-19
sessions: [chase-bill-tracker-fix]
related_functions: computed, map, ifElse
pattern: packages/patterns/chase-bill-tracker.tsx
status: superstition
confidence: medium
stars: 3
applies_to: [CommonTools]
```

## Guestbook

- 2026-01-19 - Chase Bill Tracker pattern. Bills list wasn't rendering at all when using `computed()` inside `.map()` callback to track paid status. No errors, no infinite loops - just empty content. Fixed by removing the intermediate computed variable and using direct property access. This needs more investigation to understand the exact mechanism. (chase-bill-tracker-fix)

---

**Remember:** This is a superstition - the exact mechanism is not fully understood. If you encounter this, try removing nested computed() inside .map() callbacks.
