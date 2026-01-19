# Handler Binding in .map() - Use Direct Binding, Not Arrow Functions

**Date:** 2026-01-19
**Status:** verified (tested in Playwright)
**Confidence:** high
**Stars:** 5

## TL;DR - The Rule

**When binding handlers inside `.map()` callbacks, use direct binding - NOT arrow function wrappers.**

```typescript
// BROKEN - Arrow function wrapper causes error
{items.map((item) => (
  <button onClick={() => removeItem({ items, item }).send()}>
    Remove
  </button>
))}

// CORRECT - Direct binding works
{items.map((item) => (
  <button onClick={removeItem({ items, item })}>
    Remove
  </button>
))}
```

**Error message:** `Handler used as lift, because $stream: true was overwritten`

---

## Problem

When using handlers inside `.map()` callbacks over reactive arrays, wrapping the handler call in an arrow function causes a runtime error.

### Symptom

You have a handler that works fine elsewhere, but inside `.map()` you get:

```typescript
// This throws the error
{unpaidBills.map((bill) => (
  <button
    onClick={() => markAsPaid({
      paidKeys: manuallyPaid,
      billKey: bill.key,
    }).send()}
  >
    Mark Paid
  </button>
))}
```

**Error:** `Handler used as lift, because $stream: true was overwritten`

---

## Root Cause

When you use an arrow function wrapper:
1. The arrow function captures variables from the `.map()` closure
2. `bill.key` (and other reactive values) are captured as closure variables
3. The UI binding system sees `$event` in the handler inputs but doesn't find a proper stream value
4. Instead, it sees a reactive closure, treating the handler as a lift instead of an event handler
5. This violates the handler contract and throws the error

When you use direct binding:
1. `handler({ state })` returns a **Stream object** immediately
2. The Stream becomes the click handler directly
3. When clicked, the Stream automatically calls `.send()` with the event
4. The CTS transformer properly handles reactive values from `.map()` callbacks

---

## Solution: Use Direct Handler Binding

Remove the arrow function and `.send()` call:

```typescript
// Before (Error)
onClick={() => handler({ state }).send()}

// After (Works)
onClick={handler({ state })}
```

The handler binding automatically returns a callable Stream that handles `.send()` when invoked.

---

## Example

### Before (Error)

```typescript
const markAsPaid = handler<void, { paidKeys: Writable<string[]>; billKey: string }>(
  (_, { paidKeys, billKey }) => {
    const current = paidKeys.get() || [];
    if (!current.includes(billKey)) {
      paidKeys.set([...current, billKey]);
    }
  }
);

// In pattern, inside .map():
{unpaidBills.map((bill) => (
  <button
    onClick={() => markAsPaid({
      paidKeys: manuallyPaid,
      billKey: bill.key,
    }).send()}  // ❌ Arrow function + .send() causes error
  >
    Mark Paid
  </button>
))}
```

### After (Works)

```typescript
{unpaidBills.map((bill) => (
  <button
    onClick={markAsPaid({
      paidKeys: manuallyPaid,
      billKey: bill.key,
    })}  // ✅ Direct binding works
  >
    Mark Paid
  </button>
))}
```

---

## Why Direct Binding Works

From shopping-list.tsx (working pattern):

```typescript
// Line 512 - Direct binding inside .map()
{items.map((item) => (
  <ct-button onClick={removeItem({ items, item })}>
    ×
  </ct-button>
))}
```

The handler is defined at module scope and bound directly without arrow function wrappers. This is the idiomatic pattern.

---

## Related: Pass the Item Cell, Not Extracted Properties

**When passing data from a `.map()` callback to a handler, pass the entire item cell and read properties inside the handler body.**

This pattern matches shopping-list.tsx and avoids issues with stream markers being corrupted.

```typescript
// POTENTIALLY FRAGILE - Extracting property at binding site
{bills.map((bill) => (
  <button onClick={markAsPaid({
    paidKeys: manuallyPaid,
    billKey: bill.key,  // Extracting .key here
  })}>
    Mark Paid
  </button>
))}

// SAFER - Pass entire cell, read inside handler
{bills.map((bill) => (
  <button onClick={markAsPaid({
    paidKeys: manuallyPaid,
    bill,  // Pass entire cell
  })}>
    Mark Paid
  </button>
))}

// Handler reads .key inside its body
const markAsPaid = handler<void, { paidKeys: Writable<string[]>; bill: Bill }>(
  (_, { paidKeys, bill }) => {
    const key = bill.key;  // Read property inside handler
    const current = paidKeys.get() || [];
    if (!current.includes(key)) {
      paidKeys.set([...current, key]);
    }
  }
);
```

This follows the pattern in `shopping-list.tsx` where `{ items, item }` is passed rather than `{ items, itemId: item.id }`.

**Why this may matter:** Extracting reactive properties at the binding site (in JSX) may read from the wrong reactive context or corrupt stream markers. Passing the cell preserves the reactive reference integrity, and reading inside the handler body happens in the correct context.

---

## Related: Writable Types for Handler Write Access

If handlers need to call `.get()` and `.set()` on an input field, the input type should use `Writable<>`:

```typescript
interface Input {
  // For handlers that modify this field:
  items: Writable<Default<Item[], []>>;
}
```

However, the Writable type alone does NOT fix the "Handler used as lift" error. The arrow function pattern is the primary issue.

---

## Context

**Encountered during:** Chase bill tracker pattern development (mark-as-paid handler inside .map())

**Verified:** Tested in Playwright - direct binding works, arrow wrapper fails

**Reference patterns:**
- `packages/patterns/shopping-list.tsx` - Uses direct binding correctly, passes `item` cell not extracted properties
- `packages/patterns/simple-list/simple-list.tsx` - Also uses direct binding

**Key learnings from Chase Bill Tracker:**
1. Direct handler binding (no arrow function wrapper)
2. Pass the entire item cell to handlers, read properties inside handler body

---

## Key Takeaways

When binding handlers inside `.map()`:

1. **Use direct binding, not arrow functions:**
   - **DO:** `onClick={handler({ state })}`
   - **DON'T:** `onClick={() => handler({ state }).send()}`

2. **Pass the item cell, not extracted properties:**
   - **DO:** `onClick={handler({ items, item })}`
   - **AVOID:** `onClick={handler({ items, itemKey: item.key })}`

The handler binding returns a Stream that automatically calls `.send()` when the event fires. No manual `.send()` needed.

---

**Status:** Verified through testing. The arrow function pattern consistently fails, while direct binding consistently works. The item-cell pattern follows shopping-list.tsx reference implementation.
