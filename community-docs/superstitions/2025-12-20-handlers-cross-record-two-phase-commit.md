---
topic: handlers
discovered: 2025-12-20
sessions: members-module-development
related_labs_docs: ~/Code/labs/packages/runner/src/storage/transaction-explainer.md
status: verified
verified: 2025-12-20
verdict: CORRECT for normal usage - all user records are in same space
---

# ✅ VERIFIED CORRECT - No Issue in Normal Usage

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

**VERDICT: CORRECT** - No issue in normal usage.

### Initial Concern

Transaction write isolation means a transaction can only write to ONE memory space. We worried that cross-record bidirectional linking might fail.

### What Follow-up Investigation Found

**All user-created Records are in the SAME space** (the user's home space).

From `/Users/alex/Code/labs-3/packages/runner/src/builtins/navigate-to.ts:28-29`:
- Records created via `navigateTo(Record({...}))` inherit the parent's space
- The parent is the default-app, which runs in `userIdentityDID` space

**Therefore:**
- Record A is in space `did:key:user`
- Record B is in space `did:key:user`
- Both writes are to the SAME space
- **No WriteIsolationError occurs**

### When It Would Fail (Edge Case)

If someone manually created Records in DIFFERENT spaces via direct runtime API calls, bidirectional linking would fail. But this is:
1. Not a normal user workflow
2. Correct behavior (cross-space writes are intentionally prevented)
3. Properly caught by the error handler in members.tsx

### Evidence

- Cell space assignment: `/Users/alex/Code/labs-3/packages/runner/src/cell.ts:472-475`
- navigateTo uses parent space: `/Users/alex/Code/labs-3/packages/runner/src/builtins/navigate-to.ts:28-29`

## Conclusion

The two-phase commit pattern in Members module is **correct** for its use case. All user records share the same space, so there's no write isolation violation.

**Ready to upstream to labs docs.**

---

**This pattern is VERIFIED CORRECT for normal usage.**
