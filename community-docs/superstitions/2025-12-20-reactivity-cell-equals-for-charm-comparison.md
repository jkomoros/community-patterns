---
topic: reactivity
discovered: 2025-12-20
sessions: members-module-development
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
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

# Use Cell.equals() to Compare Charm References, Not ===

## Problem

When comparing charm references (e.g., checking if a member already exists in a list, or finding a reverse link), using JavaScript's `===` identity comparison doesn't work correctly:

```typescript
// BAD: May return false even for the same charm
const hasReverse = targetMembers.some(m => m.charm === parentRecord);

// BAD: May not find the index correctly
const reverseIdx = targetMembers.findIndex(m => m.charm === parentRecord);
```

**Observed behavior:** The `===` comparison returned `false` even when the charms were the same entity, causing duplicate entries or failed lookups.

## Solution That Seemed To Work

Use `Cell.equals()` for comparing charm/Cell references:

```typescript
// GOOD: Correctly compares Cell references
const hasReverse = targetMembers.some(m =>
  Cell.equals(m.charm as Cell<unknown>, parentRecord as Cell<unknown>)
);

// GOOD: Finds the index correctly
const reverseIdx = targetMembers.findIndex(m =>
  Cell.equals(m.charm as Cell<unknown>, parentRecord as Cell<unknown>)
);
```

**Import:** `Cell` is imported from `commontools`.

## Example

```typescript
// Before (didn't work)
const isDuplicate = members.some(m => m.charm === newCharm);
if (isDuplicate) return;  // Sometimes failed to detect duplicates!

// After (seemed to work)
const isDuplicate = members.some(m =>
  Cell.equals(m.charm as Cell<unknown>, newCharm as Cell<unknown>)
);
if (isDuplicate) return;  // Correctly detects duplicates
```

## Context

- Developed while building the Members module for Record pattern
- Needed to check for duplicate members before adding
- Needed to find reverse links for bidirectional removal
- Oracle review specifically identified this as a bug

**Why === might fail:**
- Charms may be wrapped in proxy objects
- Cell references might be created fresh during access
- The underlying entity ID is what matters, not object identity

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` (may mention Cell.equals)
- **Related patterns:** `labs/packages/patterns/members.tsx`

## Uncertainty

**Key unknowns:**
- Is Cell.equals() documented anywhere?
- When exactly does === fail? All the time, or only in certain contexts?
- Are there other comparison methods that work?
- Does this apply to all Cell-wrapped values or only charm references?

## Next Steps

- [ ] Check if Cell.equals() is documented
- [ ] Test when === works vs fails
- [ ] If correct, upstream to labs docs
- [ ] Then delete this superstition

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
