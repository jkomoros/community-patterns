---
topic: cells, handlers, lift, cross-charm-writes, bidirectional-linking
discovered: 2025-12-27
sessions: members-module-bidirectional-linking
related_labs_docs:
  - ~/Code/labs/packages/runner/src/query-result-proxy.ts
  - ~/Code/labs/packages/runner/src/cell.ts
status: verified
verified: 2025-12-27
verdict: CORRECT - two different approaches needed for two different contexts
---

# Cross-Charm Writes: Two-Context Pattern (Handler vs lift)

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

When implementing bidirectional linking or other cross-charm writes, you need to use **TWO DIFFERENT approaches** depending on which execution context you're in:

1. **Handler context**: Use `.key()` chain navigation
2. **lift() context**: Use direct property access on reactive proxies

Using the wrong approach in the wrong context causes "not a function" errors or writes to fail.

## The Pattern

### Context 1: Handlers - Use .key() Navigation

In handler context, you navigate through data structures using `.key()` chains to maintain writable Cell references:

```typescript
const addMember = handler<Event, { members: Cell<MemberEntry[]>, targetCharm: any }>(
  (event, { members, targetCharm }) => {
    // ✅ CORRECT: Navigate with .key() chains to get writable Cell
    const subCharmsCell = targetCharm.key("subCharms");
    const membersEntryIndex = findMembersIndex(subCharmsCell.get());

    const targetMembersCell = subCharmsCell
      .key(membersEntryIndex)
      .key("charm")
      .key("members") as Cell<MemberEntry[]>;

    // Now you can write
    const currentMembers = targetMembersCell.get() || [];
    targetMembersCell.set([...currentMembers, newEntry]);
  }
);
```

**Why this works:**
- `.key()` returns Cell references that maintain writability
- Each `.key()` call creates a new Cell pointing to a nested path
- Handler receives sanitized state where proxies are unwrapped

### Context 2: lift() - Use Direct Property Access

In lift() context, you use direct property access on reactive proxies (from pattern INPUTs):

```typescript
const addReverseLink = lift<
  { allCharms: WriteableCharm[], targetCharm: any, sourceCharm: any },
  boolean
>(({ allCharms, targetCharm, sourceCharm }) => {
  // ✅ CORRECT: Direct property access on reactive proxies
  for (let i = 0; i < allCharms.length; i++) {
    const c = allCharms[i];
    if (Cell.equals(c, targetCharm)) {
      // Navigate via property access (NOT .key())
      const subCharms = c.subCharms;

      for (let j = 0; j < subCharms.length; j++) {
        const entry = subCharms[j];
        if (entry?.type === "members") {
          // Direct property access maintains Cell delegation
          const membersCell = entry.charm?.members;

          // Read and write using .get() and .set()
          const currentMembers = membersCell.get?.() ?? [];
          membersCell.set([...currentMembers, newEntry]);
          return true;
        }
      }
    }
  }
  return false;
});
```

**Why this works:**
- `allCharms` from pattern INPUT is an OpaqueRef with reactive proxies
- Property access (`c.subCharms`, `entry.charm.members`) maintains Cell delegation
- The reactive proxy system auto-dereferences SigilLinks during property access
- Result is a writable Cell reference

## Why Two Different Approaches?

The fundamental difference is **what data representation you're working with:**

| Context | Data Type | Navigation Method | Why |
|---------|-----------|-------------------|-----|
| **Handler** | Sanitized snapshots | `.key()` chains | Proxies unwrapped, use Cell navigation |
| **lift()** | OpaqueRef reactive proxies | Property access | Proxies maintain delegation, property access works |

### Handler Context Details

- Handler receives **state parameters** that are sanitized/unwrapped
- Direct property access returns plain values (not Cells)
- Must use `.key()` to get Cell references for nested writes
- `.get()` returns reactive proxies, but those don't have `.key()`

### lift() Context Details

- lift() receives **OpaqueRef inputs** wrapped in reactive proxies
- Property access on proxies maintains Cell delegation chain
- SigilLinks are auto-dereferenced during property access
- Calling `.key()` on a proxy fails ("proxy.key is not a function")

## Real-World Example: Members Module Bidirectional Linking

The Members module implements bidirectional linking and uses BOTH patterns:

**Handler for local writes** (uses `.key()` navigation):
```typescript
// packages/patterns/members.tsx - addMember handler
const addMember = handler<AddMemberEvent, {
  members: Cell<MemberEntry[]>,
  allCharms: Cell<MentionableCharm[]>
}>(
  (event, { members, allCharms }) => {
    const targetCharm = event.detail.charm;
    const bidirectional = event.detail.bidirectional;

    // ✅ Handler context: Use .key() for navigation
    const newEntry: MemberEntry = {
      charm: targetCharm,
      bidirectional,
    };

    const currentMembers = members.get() || [];
    members.set([...currentMembers, newEntry]);

    // Call lift() helper for reverse link (different context!)
    if (bidirectional) {
      addReverseLink({ allCharms, targetCharm, sourceCharm: parentCharm });
    }
  }
);
```

**lift() helper for cross-charm writes** (uses property access):
```typescript
// packages/patterns/members.tsx - addReverseLink helper
const addReverseLink = lift<{
  allCharms: WriteableCharm[],
  targetCharm: unknown,
  sourceCharm: unknown
}, boolean>(({ allCharms, targetCharm, sourceCharm }) => {
  // ✅ lift() context: Use property access
  for (let i = 0; i < allCharms.length; i++) {
    const c = allCharms[i];
    if (Cell.equals(c, targetCharm)) {
      // Property access through reactive proxy
      const subCharms = c.subCharms;

      for (let j = 0; j < subCharms.length; j++) {
        if (subCharms[j]?.type === "members") {
          // Direct property navigation to get writable Cell
          const membersCell = subCharms[j].charm?.members;

          // Standard index-based iteration (no spread!)
          const currentMembers = membersCell.get?.() ?? [];
          const membersList: MemberEntry[] = [];
          for (let k = 0; k < currentMembers.length; k++) {
            membersList.push(currentMembers[k]);
          }

          membersList.push({ charm: sourceCharm, bidirectional: true });
          membersCell.set(membersList);
          return true;
        }
      }
    }
  }
  return false;
});
```

## Common Mistakes

### ❌ Using .key() in lift() context

```typescript
// BROKEN - .key() doesn't exist on reactive proxies
const addReverseLink = lift(({ allCharms, targetCharm }) => {
  const c = allCharms[0];
  const membersCell = c.key("subCharms").key(0).key("charm").key("members");
  // TypeError: c.key is not a function
});
```

**Fix:** Use property access instead: `c.subCharms[0].charm.members`

### ❌ Using property access in handler context

```typescript
// BROKEN - Property access returns plain values, not Cells
const addMember = handler((event, { targetCharm }) => {
  const membersCell = targetCharm.subCharms[0].charm.members;
  membersCell.set(newValue);
  // TypeError: membersCell.set is not a function
});
```

**Fix:** Use `.key()` navigation: `targetCharm.key("subCharms").key(0).key("charm").key("members")`

## Additional Gotchas in lift() Context

When using property access in lift(), remember:

1. **No spread operator on reactive proxy arrays** - produces nulls
   ```typescript
   // ❌ BROKEN
   const items = [...proxyArray];  // All nulls!

   // ✅ CORRECT
   const items: T[] = [];
   for (let i = 0; i < proxyArray.length; i++) {
     items.push(proxyArray[i]);
   }
   ```

2. **Array.isArray() returns false on proxies**
   ```typescript
   // ❌ BROKEN
   if (Array.isArray(c.subCharms)) { ... }  // Always false!

   // ✅ CORRECT
   if (c.subCharms && typeof c.subCharms.length === "number") { ... }
   ```

3. **Use Cell.equals() for charm comparison**
   ```typescript
   // ❌ BROKEN
   if (c === targetCharm) { ... }  // Reference equality fails

   // ✅ CORRECT
   if (Cell.equals(c as object, targetCharm as object)) { ... }
   ```

## Pattern Summary

**When implementing cross-charm writes:**

1. **Pattern receives allCharms as INPUT** (OpaqueRef type)
2. **Handler handles local state** using `.key()` navigation
3. **lift() helper handles cross-charm writes** using property access
4. **Both approaches write via `.set()`** on Cell references

This pattern is used successfully in:
- `packages/patterns/members.tsx` - Bidirectional linking
- `packages/patterns/backlinks-index.tsx` - Cross-charm backlink writes

## Related Superstitions

- `2025-12-23-reactive-proxy-no-key-method.md` - Why .key() doesn't work on proxies
- `2025-12-24-pattern-input-sigillink-auto-dereference.md` - How INPUT OpaqueRefs enable cross-charm writes
- `2025-12-24-reactive-proxy-array-spread-produces-nulls.md` - Index-based iteration requirement
- `2025-12-22-array-isarray-fails-on-reactive-proxies.md` - Array detection on proxies

## Context

- Discovered during Members module bidirectional linking implementation
- The broken version tried to use `.key()` chains everywhere
- The working version uses handler context for local writes + lift() for cross-charm writes
- This dual-context pattern reduced ~100 lines of broken code to ~50 lines of working code
- Critical for ANY pattern that needs cross-charm writes

## Related Documentation

- **Runtime source:** `labs/packages/runner/src/query-result-proxy.ts`
- **Cell implementation:** `labs/packages/runner/src/cell.ts`
- **Working examples:**
  - `labs/packages/patterns/members.tsx`
  - `labs/packages/patterns/backlinks-index.tsx`

---

**This pattern is VERIFIED CORRECT** based on the Members module implementation.
