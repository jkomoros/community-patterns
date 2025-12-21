---
topic: handlers
discovered: 2025-12-20
sessions: members-module-development
related_labs_docs: ~/Code/labs/packages/runner/src/storage/transaction-explainer.md
status: deprecated
verified: 2025-12-20
verdict: WRONG - push() and set() have identical atomicity
---

# ❌ DEPRECATED - VERIFIED WRONG

**This superstition has been VERIFIED WRONG by oracle review.**

The premise that `push()` is less atomic than `set()` is incorrect. Both operations have **identical atomicity guarantees** through the transaction system.

**Do NOT follow this advice.** It was based on a misunderstanding of the transaction model.

---

# Use set() Not push() for Atomic Check-Then-Add Operations

## Problem

When checking for duplicates before adding to an array, using `get()` then `push()` is not atomic - another concurrent operation could add the same item between check and push:

```typescript
// BAD: Race condition between check and push
const current = members.get() || [];
const isDuplicate = current.some(m => Cell.equals(m.charm, newCharm));
if (isDuplicate) return;
// ... time passes, concurrent add could happen here ...
members.push(newEntry);  // May create duplicate!
```

**Observed behavior (theoretical):** In concurrent scenarios, two handlers could both check for duplicates at the same time, both see no duplicate, and both add the same item.

## Solution That Seemed To Work

Compute the new array immediately after the check, then use `set()` instead of `push()`:

```typescript
// GOOD: Compute new array immediately, set atomically
const current = members.get() || [];
const isDuplicate = current.some(m => Cell.equals(m.charm, newCharm));
if (isDuplicate) return;

// Compute new array right here - minimize time between check and write
const newList = [...current, newEntry];
members.set(newList);  // Atomic - transaction fails if current changed
```

**Why this might work:** Using `set()` with the computed array happens in a single operation. If the underlying data changed since our `get()`, the transaction system should detect the conflict and fail/retry.

## Example

```typescript
// Before (potential race condition)
const addMember = handler((_, { members }) => {
  const current = members.get() || [];
  if (current.some(m => isDuplicate(m))) return;

  // Do some other processing...
  const newEntry = createEntry();

  members.push(newEntry);  // Another handler could have pushed between check and here
});

// After (atomic update)
const addMember = handler((_, { members }) => {
  const current = members.get() || [];
  if (current.some(m => isDuplicate(m))) return;

  const newEntry = createEntry();
  const newList = [...current, newEntry];  // Compute immediately
  members.set(newList);  // Single atomic write
});
```

## Context

- Identified during oracle review of Members module
- Race condition is theoretical - not directly observed in testing
- Based on analysis of Cell implementation in `packages/runner/src/cell.ts`
- The `push()` method internally does get → modify → set (three operations)

**From cell.ts analysis:**
```typescript
// push() implementation (simplified):
push(...value) {
  const currentValue = this.tx.readValueOrThrow(resolvedLink);  // READ
  // ... processing ...
  diffAndUpdate(this.runtime, this.tx, resolvedLink, newArray, cause);  // WRITE
}
```

## Related Documentation

- **Official docs:** None found about transaction atomicity
- **Cell implementation:** `labs/packages/runner/src/cell.ts` lines 678-728
- **Transaction docs:** `labs/packages/runner/src/storage/transaction-explainer.md`

## Oracle Verification (2025-12-20)

**VERDICT: WRONG** - The superstition is based on a misunderstanding.

### Why This Is Wrong

**Both `push()` and `set()` use the same transaction mechanism.**

From `/Users/alex/Code/labs-3/packages/runner/src/cell.ts`:

Both methods:
- Use the same transaction (`this.tx`)
- Call the same write mechanism (`diffAndUpdate`)
- Are subject to the same transaction lifecycle

### The Actual Concurrency Model

From `/Users/alex/Code/labs-3/packages/runner/src/storage/transaction-explainer.md:66-84`:

> **Read Consistency**: All reads capture "invariants" - assumptions about the state when read. If any invariant is violated before commit, the transaction fails.

This means:
- **ANY read** in a transaction creates an invariant
- **IF that value changes** before commit, the transaction fails
- This applies **equally** to both `push()` and `get()+set()`

### Automatic Retry

From `/Users/alex/Code/labs-3/packages/runner/src/scheduler.ts:251-270`:
The scheduler automatically retries on conflict, regardless of whether you used `push()` or `set()`.

### The Correct Understanding

```typescript
// These have IDENTICAL atomicity guarantees:

// Using push()
members.push(newEntry);  // Will retry on conflict

// Using get() + set()
const current = members.get() || [];
members.set([...current, newEntry]);  // Will also retry on conflict
```

Both approaches:
- Record read invariant for `members`
- Fail if `members` changed since read
- Automatically retry via scheduler

## Conclusion

**Delete this superstition.** There is no atomicity difference between `push()` and `set()`.

---

**This superstition is WRONG. Do not follow this advice.**
