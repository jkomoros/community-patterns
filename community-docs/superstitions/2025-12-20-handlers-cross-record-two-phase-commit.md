---
topic: handlers
discovered: 2025-12-20
sessions: members-module-development
related_labs_docs: ~/Code/labs/packages/runner/src/storage/transaction-explainer.md
status: superstition
verified: 2025-12-20
verdict: MISGUIDED - only works within same memory space
---

# ⚠️ SUPERSTITION - PARTIALLY VERIFIED (MISGUIDED)

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

# Cross-Record Modifications Need Two-Phase Commit Pattern

## Problem

When a handler modifies data in two different charms (e.g., bidirectional linking), sequential writes with fire-and-forget error handling can leave inconsistent state:

```typescript
// BAD: If reverse link fails, local change is already committed
const addMember = handler((_, { members, targetRecord }) => {
  members.push({ charm: targetRecord, bidirectional: true });  // Commits!

  try {
    // Try to add reverse link to target
    const targetMembers = targetRecord.key("members");
    targetMembers.push({ charm: parentRecord, bidirectional: true });
  } catch (e) {
    console.warn("Reverse link failed:", e);  // Local change persists!
  }
});
```

**Observed behavior:** When the reverse link fails (e.g., target doesn't have a Members module), the local change persists but the bidirectional invariant is broken. User A shows a link to B with the ↔ icon, but B has no link to A.

## Solution That Seemed To Work

Use a two-phase commit pattern: read all state first, prepare all updates, then write both atomically in the same transaction:

```typescript
// GOOD: Prepare all changes first, then write together
const addMember = handler((_, { members, targetRecord, parentRecord }) => {
  // === PHASE 1: Prepare updates (reads only) ===
  const currentMembers = members.get() || [];
  const newEntry = { charm: targetRecord, bidirectional: true };
  const newLocalList = [...currentMembers, newEntry];

  // Prepare reverse link
  let targetMembersCell = null;
  let newTargetList = null;
  try {
    targetMembersCell = targetRecord.key("subCharms")...key("members");
    const targetMembersList = targetMembersCell.get() || [];
    newTargetList = [...targetMembersList, { charm: parentRecord, bidirectional: true }];
  } catch (e) {
    // Target doesn't support members - mark as non-bidirectional
    newEntry.bidirectional = false;
  }

  // === PHASE 2: Commit both atomically ===
  // Both writes happen in same transaction - if either fails, both roll back
  members.set(newLocalList);
  if (targetMembersCell && newTargetList) {
    targetMembersCell.set(newTargetList);
  }
});
```

**Why this seems to work:** Both `set()` calls happen in the same handler execution, which runs in a single transaction context. The transaction system should ensure either both succeed or both are rolled back.

## Example

See `packages/patterns/members.tsx` in labs-3 for the full implementation of this pattern in the `addMember` and `removeMember` handlers.

## Context

- Developed while building the Members module for Record pattern
- Goal was bidirectional linking between Record charms
- Race conditions were identified by oracle review
- The two-phase pattern was recommended by oracle analysis

**What was tried that didn't work:**
- Sequential push() calls with try/catch around second one
- Letting failures be silent (broke bidirectional invariant)

## Related Documentation

- **Official docs:** None found specifically about cross-record modifications
- **Related patterns:** `labs/packages/patterns/members.tsx`
- **Transaction docs:** `labs/packages/runner/src/storage/transaction-explainer.md`

## Oracle Verification (2025-12-20)

**VERDICT: MISGUIDED** - The pattern is good practice BUT has a critical limitation.

### What the Oracle Found

From `/Users/alex/Code/labs-3/packages/runner/src/storage/transaction-explainer.md` (lines 54-62):

> **Write Isolation**: A transaction can only write to one memory space. This prevents distributed consistency issues.

**Critical finding:** If the two cells (`members` and `targetMembersCell`) are in **different memory spaces**, the second `set()` will fail with `WriteIsolationError` and the first `set()` will have already succeeded - NO ROLLBACK.

### When It Works

The two-phase pattern provides atomic rollback **ONLY IF** both cells belong to the same memory space.

### When It FAILS

If the cells are in different spaces:
1. First `set()` succeeds (locks transaction to space A)
2. Second `set()` fails with `WriteIsolationError` (trying to write to space B)
3. First write is NOT rolled back

### Recommendation

The members.tsx code should either:
1. Verify both cells are in the same space before claiming atomicity
2. Handle `WriteIsolationError` explicitly
3. Update comments to acknowledge this limitation

### Evidence

- Transaction enforcement: `/Users/alex/Code/labs-3/packages/runner/src/storage/transaction.ts:173-216`
- Test evidence: `/Users/alex/Code/labs-3/packages/runner/test/transaction.test.ts:212-240`

## Next Steps

- [x] Verify against official docs (transaction semantics)
- [ ] Determine if members module cells are always in same space
- [ ] If cross-space, refactor to handle WriteIsolationError
- [ ] Update labs docs with proper caveats

---

**Remember:** This pattern is useful for clarity but the atomicity guarantee is conditional on space topology!
