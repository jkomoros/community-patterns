---
topic: reactivity
discovered: 2025-12-20
sessions: members-module-development
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
status: verified
verified: 2025-12-20
verdict: CORRECT - already documented in official docs
---

# ✅ VERIFIED CORRECT - Should Upstream to Labs Docs

**This superstition has been VERIFIED CORRECT by oracle review.**

It is already partially documented in `CELLS_AND_REACTIVITY.md` but could use expansion.

**Action:** Upstream the additional context to labs docs, then delete this file.

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

## Oracle Verification (2025-12-20)

**VERDICT: CORRECT** - Verified by code analysis and official documentation.

### Evidence from Source Code

**Cell.equals() implementation** (`/Users/alex/Code/labs-3/packages/runner/src/cell.ts:781-790`):
```typescript
equals(other: any): boolean {
  return areLinksSame(this, other, undefined, true, this.runtime.readTx(this.tx), this.runtime);
}
```

**areLinksSame()** (`/Users/alex/Code/labs-3/packages/runner/src/link-utils.ts:138-175`):
- First checks `value1 === value2` (returns true if same object)
- If not, parses both as links and compares normalized structure (space, id, path)
- Resolves aliases/redirects before comparing

### When === Fails

- When comparing values retrieved from `.get()` that are fresh Cell instances
- When different Cell instances point to the same entity
- When cells are created separately but reference the same charm

### Official Documentation

From `/Users/alex/Code/labs-3/docs/common/CELLS_AND_REACTIVITY.md:195-213`:
```typescript
### Cell.equals()
Use `Cell.equals()` to compare cells or cell values:

const removeItem = (items: Cell<Item[]>, item: Cell<Item>) => {
  const currentItems = items.get();
  const index = currentItems.findIndex(el => Cell.equals(item, el));
};
```

### Test Evidence

From `/Users/alex/Code/labs-3/packages/runner/test/cell-static-methods.test.ts:317-331`:
```typescript
it("should return true for cells with same link", () => {
  const cell1 = runtime.getCell(space, "same-link", undefined, tx);
  const cell2 = runtime.getCell(space, "same-link", undefined, tx);
  expect(Cell.equals(cell1, cell2)).toBe(true);  // Different objects, same entity
});
```

## Next Steps

- [x] Check if Cell.equals() is documented - YES, in CELLS_AND_REACTIVITY.md
- [x] Verify behavior - CONFIRMED by tests
- [ ] Upstream expanded documentation to labs docs
- [ ] Then delete this superstition

---

**This is VERIFIED CORRECT. Upstream to labs docs and delete.**
