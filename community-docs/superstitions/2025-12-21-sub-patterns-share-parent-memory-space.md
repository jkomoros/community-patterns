---
topic: patterns, framework, reactivity
discovered: 2025-12-21
sessions: members-module-development
related_labs_docs:
  - ~/Code/labs/packages/runner/src/builtins/navigate-to.ts
  - ~/Code/labs/packages/runner/src/cell.ts
status: superstition
confidence: high
---

# Sub-Patterns Share Parent's Memory Space (wish() Works!)

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

## The False Assumption

A previous commit message (`cbe571b57`) claimed:

> "sub-charms run in their own space context"

**This is WRONG.** Sub-patterns (like MembersModule instantiated by Record) do NOT run in isolated space contexts.

## What Actually Happens

Sub-patterns inherit `parentCell.space` - the parent's MemorySpace DID. All user Records are created in the same space (typically `did:key:user`).

This means:
- Sub-patterns CAN call `wish()` to access parent space data
- No need to pass everything through props
- `wish("#mentionable")` works in MembersModule even though it's a sub-charm of Record

## Evidence

```typescript
// MembersModule (sub-pattern of Record) - this WORKS!
const MembersModule = recipe("MembersModule", () => {
  // wish() resolves in the SAME space as parent Record
  const mentionable = wish<MentionableCharm[]>("#mentionable");

  // Returns 14+ items - same data as parent would see
  console.log("mentionable count:", mentionable?.length);

  return { ... };
});
```

## How Space Inheritance Works

1. When a pattern instantiates a sub-pattern, it passes its `parentCell`
2. The sub-pattern's cells are created with `parentCell.space`
3. `wish()` uses the current cell's space to resolve paths
4. Path `#mentionable` resolves to `spaceCell.defaultPattern.backlinksIndex.mentionable`

From `navigate-to.ts:28-29`:
```typescript
// Records inherit parent's space
const newCell = runtime.getCell(parentCell.space, { ... });
```

From `cell.ts:472-475`:
```typescript
// Cell space assignment
this.space = options.space ?? parentCell?.space;
```

## Why This Matters

You can write simpler patterns that fetch their own data instead of threading it through props:

```typescript
// BEFORE: Complex prop threading (and it doesn't work anyway due to snapshot issue)
const Record = recipe("Record", () => {
  const mentionable = wish("#mentionable");
  return {
    // Have to pass mentionable to every sub-pattern
    members: MembersModule({ mentionable }),
    notes: NotesModule({ mentionable }),
  };
});

// AFTER: Sub-patterns get their own data
const Record = recipe("Record", () => {
  return {
    // Sub-patterns call wish() themselves
    members: MembersModule({}),
    notes: NotesModule({}),
  };
});
```

## Evidence Files

- `packages/runner/src/builtins/navigate-to.ts:28-29` - Records inherit parent's space
- `packages/runner/src/cell.ts:472-475` - Cell space assignment
- `packages/runner/src/builtins/wish.ts:154-158` - How `#mentionable` resolves

## Related Superstitions

- `2025-12-21-handlers-unwrap-opaquerefs-to-snapshots.md` - Why you NEED this pattern (can't pass reactive data through handlers)

## Guestbook

- 2025-12-21 - Oracle investigation disproved the "separate space context" claim. wish("#mentionable") returns 14+ items when called from MembersModule sub-pattern. (members-module-development)
