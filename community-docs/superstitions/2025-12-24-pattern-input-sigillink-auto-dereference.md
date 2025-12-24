---
topic: patterns, cells, reactivity
discovered: 2025-12-24
sessions: members-module-bidirectional-linking
related_labs_docs:
  - ~/Code/labs/packages/runner/src/query-result-proxy.ts
  - ~/Code/labs/packages/runner/src/cell.ts
status: verified
verified: 2025-12-24
verdict: CORRECT - pattern INPUT cells auto-dereference SigilLinks via .key() navigation
---

# Pattern INPUT Cells Auto-Dereference SigilLinks During Navigation

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

When doing cross-charm writes, you need writable Cell references to another charm's data. The challenge is that stored charm references (in arrays like `subCharms`) contain **SigilLinks** (serialized references), not actual Cell objects.

```typescript
// SubCharmEntry structure
interface SubCharmEntry {
  type: string;
  charm: unknown;  // This is a SigilLink, NOT a Cell!
}

// Naive approach - FAILS
const charmLinkCell = subCharmsCell.key(i).key("charm");
const membersCell = charmLinkCell.key("members");  // Extends path locally, doesn't follow link!
membersCell.set(newValue);  // Writes to wrong location!
```

**The problem:** `.key("charm")` returns a Cell containing the SigilLink value. Calling `.key("members")` on that extends the local path instead of following the link to the actual charm.

**Failed solution attempt:** `resolveToRoot()` exists in CellImpl but is NOT in the public Cell API, causing TypeScript errors.

## Solution: Pass allCharms as Pattern INPUT

When a Cell containing charm references is passed as a **pattern INPUT** (not from internal `wish()`), the reactive proxy system automatically dereferences SigilLinks during `.key()` navigation.

```typescript
// Pattern receives allCharms as INPUT
interface MembersModuleInput {
  allCharms?: Cell<MentionableCharm[]>;  // Passed from parent
}

// In handler, find target charm and navigate with .key()
const addMember = handler<Event, { mentionable: Cell<MentionableCharm[]> }>(
  (event, { mentionable }) => {
    // Find target charm index
    const items = mentionable.get() || [];
    let targetIndex = -1;
    for (let i = 0; i < items.length; i++) {
      if (Cell.equals(items[i] as object, targetCharm as object)) {
        targetIndex = i;
        break;
      }
    }

    // Navigate with .key() - SigilLinks are AUTO-DEREFERENCED!
    const targetMembersCell = mentionable
      .key(targetIndex)
      .key("subCharms")
      .key(membersModuleIndex)
      .key("charm")      // Contains SigilLink, but auto-dereferenced
      .key("members") as Cell<MemberEntry[]>;

    // This WORKS - writes to actual charm's members!
    targetMembersCell.set([...currentMembers, newEntry]);
  }
);
```

## Why This Works

1. **Pattern INPUTs are OpaqueRefs**: When `allCharms` is passed as pattern input, it maintains Cell delegation through the reactive proxy system.

2. **Automatic link resolution**: The reactive proxy's `.key()` implementation detects SigilLinks and follows them transparently.

3. **Different from wish()**: Internal `wish()` returns read-only query result projections. Pattern INPUTs provide writable access with link resolution.

## Key Distinction: INPUT vs wish()

| Source | Type | Link Resolution | Writable |
|--------|------|-----------------|----------|
| Pattern INPUT (`allCharms` prop) | OpaqueRef | Auto-dereferenced via .key() | Yes |
| Internal `wish("#mentionable")` | Query projection | No - minimal data only | No |
| Handler state | Snapshot | N/A - already unwrapped | Via Cell params |

## Working Example: BacklinksIndex

This pattern is used successfully in `packages/patterns/backlinks-index.tsx`:

```typescript
// BacklinksIndex receives allCharms as INPUT
interface BacklinksIndexInput {
  allCharms?: Cell<MentionableCharm[]>;  // Passed as input
}

// Inside lift(), property access auto-dereferences
const computeIndex = lift<{ allCharms: WriteableBacklinks[] }, void>(
  ({ allCharms }) => {
    for (const c of allCharms) {
      c.backlinks?.set([]);  // Direct property access works!
    }

    for (const c of allCharms) {
      const mentions = c.mentioned ?? [];
      for (const m of mentions) {
        m?.backlinks?.push(c);  // Cross-charm write works!
      }
    }
  },
);
```

## Context

- Discovered while fixing bidirectional linking in Members module
- Initial attempt used `resolveToRoot()` which failed (not in public API)
- Oracle investigation traced through `query-result-proxy.ts` to find the pattern
- The fix reduced complex dereference logic to simple `.key()` chains
- **Critical for ANY cross-charm writes**, not just Members module

## Related Documentation

- **Runtime source:** `labs/packages/runner/src/query-result-proxy.ts`
- **Cell implementation:** `labs/packages/runner/src/cell.ts`
- **Working pattern:** `labs/packages/patterns/backlinks-index.tsx`
- **Fixed pattern:** `labs/packages/patterns/members.tsx`

## Related Superstitions

- `2025-12-23-reactive-proxy-no-key-method.md` - About .key() availability (different issue)
- `2025-12-20-pattern-output-proxy-auto-dereferences.md` - About outputs, not inputs
- `2025-12-21-handlers-unwrap-opaquerefs-to-snapshots.md` - Handler state behavior

---

**This pattern is VERIFIED CORRECT.**
