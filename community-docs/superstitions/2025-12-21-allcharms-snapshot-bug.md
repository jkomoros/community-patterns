---
topic: patterns, framework, reactivity, wish, mentionable
discovered: 2025-12-21
sessions: members-module-development
related_labs_docs:
  - ~/Code/labs/packages/charm/src/manager.ts
  - ~/Code/labs/packages/runner/src/builtins/wish.ts
  - ~/Code/labs/packages/patterns/backlinks-index.tsx
status: verified-bug
confidence: very-high
related_issues: CT-1130
---

# BUG: spaceCell.allCharms is a Snapshot, Not a Live Reference

**STATUS: VERIFIED BUG** - Oracle investigation confirmed the root cause.

## The Symptom

When testing patterns that use `wish("#mentionable")`:
1. Navigate to a space via Playwright
2. Create charms via `ct charm new`
3. `wish("#mentionable")` returns `[]` even though charms exist
4. "Show All Charms" UI shows the charms correctly

## Root Cause

In `packages/charm/src/manager.ts:127-133`, the CharmManager constructor does:

```typescript
const nextSpaceValue: Partial<SpaceCellContents> = {
  ...(existingSpace ?? {}),
  allCharms: this.charms.withTx(tx).get() as Cell<never>[],  // ← SNAPSHOT!
  recentCharms: recentCharmsField.withTx(tx).get() as Cell<never>[],
};
spaceCellWithTx.set(nextSpaceValue as SpaceCellContents);
```

**The bug**: `this.charms.get()` returns a JavaScript array at initialization time. This array is written to storage. When CLI later adds charms to `ALL_CHARMS_ID`, the `spaceCell.allCharms` in storage still has the old empty snapshot.

## Data Flow

1. `wish("#mentionable")` → `spaceCell.defaultPattern.backlinksIndex.mentionable`
2. BacklinksIndex.mentionable is computed from `allCharms` input
3. default-app.tsx gets allCharms via `wish("/")` → reads `spaceCell.allCharms`
4. `spaceCell.allCharms` is a snapshot from CharmManager init, not a live reference

## Correct Pattern (defaultPattern)

Compare with how `defaultPattern` is linked (`manager.ts:207-215`):

```typescript
async linkDefaultPattern(defaultPatternCell: Cell<any>) {
  await this.runtime.editWithRetry((tx) => {
    const spaceCellWithTx = this.spaceCell.withTx(tx);
    spaceCellWithTx.key("defaultPattern").set(defaultPatternCell.withTx(tx));  // ← Sets CELL, not .get()
  });
}
```

It sets the **Cell itself**, creating a live reference.

## The Fix (Not Yet Implemented)

Change the constructor to:
```typescript
const nextSpaceValue: Partial<SpaceCellContents> = {
  ...(existingSpace ?? {}),
  allCharms: this.charms,  // ← Not .get() - set the Cell itself
  recentCharms: this.recentCharms,
};
```

And update the schema in `runtime.ts:84-87` to mark allCharms as a cell:
```typescript
allCharms: {
  type: "array",
  items: { not: true, asCell: true },
  asCell: true,  // ← ADD THIS
}
```

## Workaround for Testing

**⚠️ NO WORKING WORKAROUND EXISTS for local dev.**

Tested approaches that ALL FAILED:
1. Navigate to space first, then create charms via CLI → mentionable: 0
2. Create charms via CLI first, then navigate → mentionable: 0
3. Create charms in fresh space, then navigate → mentionable: 0
4. Use shell's "Show All Charms" list (charms ARE visible) → wish("#mentionable") still returns []

The bug is that `spaceCell.allCharms` is set once during CharmManager initialization and never updated when new charms are added via CLI.

**For testing Members/mentions, you must use production (toolshed.saga-castor.ts.net)** where the allCharms list was properly initialized with existing data.

## Why "Show All Charms" Works

The charm list UI reads directly from `ALL_CHARMS_ID` storage, not from `spaceCell.allCharms`. That's why it sees newly created charms even when `wish("#mentionable")` returns empty.

## Evidence Files

- `packages/charm/src/manager.ts:127-133` - Snapshot bug location
- `packages/charm/src/manager.ts:207-215` - Correct pattern (defaultPattern linking)
- `packages/runner/src/builtins/wish.ts:154-158` - #mentionable resolution
- `packages/patterns/backlinks-index.tsx:59-79` - computeMentionable function
- `packages/patterns/default-app.tsx:86-88` - allCharms → BacklinksIndex wiring

## Guestbook

- 2025-12-21 - Oracle investigation traced full data flow. Root cause: spaceCell.allCharms is set to .get() snapshot instead of Cell reference. Filed as part of CT-1130. (members-module-development)
