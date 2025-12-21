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

## Uncertainty

**Key unknowns:**
- Does the transaction system actually roll back both writes if one fails?
- What happens if the two writes are to different "spaces" in the storage?
- Are there scenarios where this still fails?

This needs testing with deliberately failing reverse links to verify rollback behavior.

## Next Steps

- [ ] Verify against official docs (transaction semantics)
- [ ] Test with deliberately failing reverse links
- [ ] If correct, upstream to labs docs
- [ ] Then delete this superstition

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
