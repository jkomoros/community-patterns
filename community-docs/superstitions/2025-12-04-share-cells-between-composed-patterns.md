---
topic: pattern-composition
discovered: 2025-12-04
confirmed_count: 1
last_confirmed: 2025-12-04
sessions: [hotel-membership-migration-check-recent]
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
status: superstition
stars: ⭐⭐
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

**If this works for you,** update the metadata and consider promoting to folk_wisdom.

---

# Share Cells Between Composed Patterns for Coordinated State

## Problem

When a **parent pattern composes a child pattern**, the parent may need to coordinate
state that the child pattern uses internally. If the child creates its own internal
cell, the parent can't affect that state - even if the parent sets related fields,
the child's internal cell remains unchanged.

**Example situation:**
```typescript
// Base pattern creates its own internal cell
const BasePattern = pattern<...>(({ isScanning }) => {
  // ❌ Internal cell - parent can't access or modify this
  const searchProgress = Cell.of<SearchProgress>({
    status: "idle",
    completedQueries: [],
  });

  // Progress UI depends on BOTH isScanning AND searchProgress
  const progressUI = derive([isScanning, searchProgress], ([scanning, progress]) => {
    if (!scanning || progress.status === "idle") return null;
    return <LoadingIndicator queries={progress.completedQueries} />;
  });

  return { progressUI, searcher: { searchProgress } };
});

// Parent pattern - can set isScanning but progressUI still won't show
const ParentPattern = pattern<...>(({ isScanning }) => {
  const baseResult = BasePattern({ isScanning });

  const startScan = handler<...>((_) => {
    // ❌ This only sets isScanning - but base's searchProgress.status is still "idle"
    // So progressUI condition fails: scanning=true BUT progress.status="idle"
    isScanning.set(true);
  });
});
```

## Solution: Pass the Cell as Input

Make the shared state a **pattern input** so both parent and child use the same cell:

```typescript
// ✅ Base pattern accepts cell as input
const BasePattern = pattern<BaseInput, ...>(
  ({ isScanning, searchProgress }) => {
    // searchProgress comes from input - parent can pass their own cell

    const progressUI = derive([isScanning, searchProgress], ([scanning, progress]) => {
      if (!scanning || progress.status === "idle") return null;
      return <LoadingIndicator queries={progress.completedQueries} />;
    });

    return { progressUI };
  }
);

// ✅ Parent pattern passes same cell to base
const ParentPattern = pattern<ParentInput, ...>(
  ({ isScanning, searchProgress }) => {
    // Pass SAME cell to base pattern
    const baseResult = BasePattern({ isScanning, searchProgress });

    const startScan = handler<
      unknown,
      { isScanning: Cell<boolean>; searchProgress: Cell<SearchProgress> }
    >((_event, state) => {
      // ✅ Set both - progressUI sees changes because it's the SAME cell
      state.searchProgress.set({ status: "searching", completedQueries: [] });
      state.isScanning.set(true);
    });

    return {
      startScan: startScan({ isScanning, searchProgress }),
      ...baseResult,
    };
  }
);
```

## Key Insight: The Framework Idiom

**"In this framework the idiom is to coordinate by using the same cell."**

When parent and child patterns need coordinated state:
1. Make the state an **input** to the child pattern (with optional default)
2. Parent creates/owns the cell
3. Parent passes the same cell to child
4. Both patterns read/write the same cell
5. Reactivity "just works" - no derives/computes needed between patterns

**IMPORTANT:** Don't use derives/computes to sync state between patterns.
The shared cell approach keeps reactivity intact.

## Example: Real-World Fix

**Before (broken):**
```typescript
// gmail-agentic-search.tsx - creates internal cell
const searchProgress = Cell.of<SearchProgress>({ status: "idle", ... });

// hotel-membership-gmail-agent.tsx - can't affect progressUI
const startScan = handler<...>((_) => {
  // searchProgress lives in base pattern - we can't touch it
  isScanning.set(true);  // ❌ progressUI still won't show
});
```

**After (working):**
```typescript
// gmail-agentic-search.tsx - accepts cell as input
interface GmailAgenticSearchInput {
  searchProgress?: Default<SearchProgress, { status: "idle", ... }>;
}
const GmailAgenticSearch = pattern<GmailAgenticSearchInput, ...>(
  ({ searchProgress }) => {
    // searchProgress comes from input - can be shared with parent
  }
);

// hotel-membership-gmail-agent.tsx - passes same cell
interface HotelMembershipInput {
  searchProgress?: Default<SearchProgress, { status: "idle", ... }>;
}
const HotelMembership = pattern<HotelMembershipInput, ...>(
  ({ searchProgress }) => {
    const baseResult = GmailAgenticSearch({ searchProgress });  // ✅ Same cell

    const startScan = handler<
      unknown,
      { searchProgress: Cell<SearchProgress> }
    >((_event, state) => {
      state.searchProgress.set({ status: "searching", ... });  // ✅ Both see this
      state.isScanning.set(true);
    });

    return { startScan: startScan({ searchProgress }) };
  }
);
```

## Context

Working on `hotel-membership-gmail-agent.tsx` which composes `gmail-agentic-search.tsx`.
The progressUI (showing LLM queries, loading state) wasn't displaying even though
the parent pattern set `isScanning = true`.

**Root cause:** The base pattern's progressUI conditional was:
```typescript
if (!isScanning || searchProgress.status === "idle") return null;
```

The parent set `isScanning = true`, but the base pattern's internal `searchProgress`
cell still had `status: "idle"`. Both conditions need to be true for progressUI to show.

**Fix:** Make `searchProgress` an input to the base pattern. Parent passes the same
cell it creates. When parent's handler sets `searchProgress.status = "searching"`,
the base pattern's progressUI sees the change because it's the SAME cell.

## Related Superstitions

- `2025-11-22-patterns-pass-cells-not-charm-refs.md` - Related: passing cells between patterns
- `2025-12-03-avoid-composed-pattern-cells-in-derives.md` - Avoid derives over composed pattern cells
- `2025-11-24-use-derive-not-computed-for-jsx-rendering.md` - Derive vs computed for rendering

## Related Documentation

- **Official docs:** ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
- **Related patterns:**
  - `patterns/jkomoros/gmail-agentic-search.tsx` - Base pattern accepting shared cell
  - `patterns/jkomoros/hotel-membership-gmail-agent.tsx` - Parent pattern sharing cell

## Next Steps

- [ ] Confirm this is the intended framework pattern for parent-child coordination
- [ ] Check if there are examples in labs/packages/patterns/ using this idiom
- [ ] Document edge cases (what if child pattern also needs to modify the cell?)

## Notes

**Why not use derives/computes?**
- Derives/computes create new cells with derived values
- They can break reactivity chains
- The shared cell approach is simpler and maintains direct reactivity

**Optional defaults pattern:**
Using `Default<T, V>` allows callers to omit the cell (uses default),
while composed patterns can pass in their own cell to coordinate state.

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
