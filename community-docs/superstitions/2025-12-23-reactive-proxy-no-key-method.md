---
topic: cells, reactive-proxies
discovered: 2025-12-23
sessions: members-module-bidirectional-linking
related_labs_docs: ~/Code/labs/packages/runner/src/query-result-proxy.ts
status: verified
verified: 2025-12-23
verdict: CORRECT - reactive proxies don't have .key(), only Cells do
---

# Reactive Proxies Don't Have .key() - Use Cell Navigation Chains

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

## Problem

When navigating to nested data for cross-charm writes, calling `.get()` then trying to access `.key()` on the result fails:

```typescript
// BAD: .get() returns reactive proxy, not a Cell
const proxySubCharms = charmCell.key("subCharms").get() || [];
const targetMembersEntry = proxySubCharms.find(e => e?.type === "members");

// This FAILS: "membersCharm.key is not a function"
const membersCharm = targetMembersEntry.charm as Cell<any>;
targetMembersCell = membersCharm.key("members");  // TypeError!
```

**Observed behavior:** The error `membersCharm.key is not a function` occurs because `targetMembersEntry.charm` is a reactive proxy object, NOT a Cell. Reactive proxies wrap values but don't have the `.key()` method that Cells have.

**This bug bit us TWICE** - in both `addMember()` and `removeMember()` handlers in `members.tsx`, requiring fixes to the same cross-charm write pattern in both places.

## Why This Happens

From `packages/runner/src/query-result-proxy.ts`:

1. When you call `.get()` on a Cell, it returns a reactive proxy wrapping the value
2. Accessing properties on that proxy (like `entry.charm`) returns MORE reactive proxies
3. Reactive proxies have `[toCell]` symbol but NOT the `.key()` method
4. Only actual Cell instances (from `cell.ts`) have `.key()`

The key distinction:
- **`.get()`** - Returns dereferenced value as reactive proxy (NO `.key()`)
- **`.key(prop)`** - Returns a Cell reference for that property (HAS `.key()`)

## Solution

Use `.key()` chains throughout to maintain writable Cell references:

```typescript
// GOOD: Navigate using .key() chain
const subCharmsCell = charmCell.key("subCharms");
const proxySubCharms = subCharmsCell.get() || [];

// Find the index you need using defensive property access
// NOTE: Use .get?.() with fallback for robustness with reactive proxies
let membersEntryIndex = -1;
for (let i = 0; i < proxySubCharms.length; i++) {
  const typeCell = subCharmsCell.key(i).key("type");
  const typeValue = String(typeCell.get?.() ?? typeCell ?? "");
  if (typeValue === "members") {
    membersEntryIndex = i;
    break;
  }
}

// Navigate using .key() to get Cell references
if (membersEntryIndex >= 0) {
  targetMembersCell = subCharmsCell
    .key(membersEntryIndex)
    .key("charm")
    .key("members") as Cell<MemberEntry[]>;

  // Now you can call .get() and .set() on the Cell
  const membersList = targetMembersCell.get() || [];
  targetMembersCell.set([...membersList, newEntry]);
}
```

This pattern is used successfully in:
- `packages/patterns/record/extraction/extractor-module.tsx` line 351
- `packages/patterns/members.tsx` bidirectional linking (`addMember` and `removeMember` handlers)
- **Any pattern that needs cross-charm writes via navigation through nested structures**

## The Rule

**Always use `.key()` for navigation when you need writable Cell references. Never use `.get()` and then expect `.key()` to exist on the result.**

Pattern to remember:
```typescript
// Reading nested value (reactive proxy):
cell.key("a").key("b").get()  // Returns value

// Getting Cell for nested property (for writes):
cell.key("a").key("b")  // Returns Cell with .get(), .set(), .key()

// Defensive property access on reactive proxy arrays:
const typeCell = arrayCell.key(i).key("type");
const typeValue = String(typeCell.get?.() ?? typeCell ?? "");
```

## Context

- Developed while fixing bidirectional linking in Members module
- The error `membersCharm.key is not a function` was cryptic and appeared in TWO places
- Oracle investigation traced through `query-result-proxy.ts` to find root cause
- **Fixed in both `addMember` and `removeMember` handlers** (same pattern, same bug)
- The fix reduced ~30 lines of broken code to ~5 lines of working code per handler
- Critical for ANY cross-charm writes, not just Members module

## Related Documentation

- **Runtime source:** `labs/packages/runner/src/query-result-proxy.ts`
- **Cell implementation:** `labs/packages/runner/src/cell.ts`
- **Working pattern:** `labs/packages/patterns/members.tsx`
- **Extraction example:** `labs/packages/patterns/record/extraction/extractor-module.tsx`

---

**This pattern is VERIFIED CORRECT.**
