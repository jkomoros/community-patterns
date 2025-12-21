---
topic: handlers
discovered: 2025-12-20
sessions: members-module-development
related_labs_docs: none
status: superstition
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this is verified correct,** upstream it to labs docs and delete this superstition.

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

## Uncertainty

**Key unknowns:**
- Does the transaction system actually detect conflicts?
- Is push() truly non-atomic, or does the transaction provide protection?
- What happens on conflict - retry or fail?
- Is this a real problem in practice or just theoretical?

**Need to verify:**
- Test with deliberately concurrent operations
- Check transaction-explainer.md for conflict detection details
- Look for existing patterns that handle this

## Next Steps

- [ ] Read transaction-explainer.md thoroughly
- [ ] Test concurrent operations
- [ ] If correct, upstream to labs docs
- [ ] Then delete this superstition

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
