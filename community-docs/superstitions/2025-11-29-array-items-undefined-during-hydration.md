# Array Items May Be Undefined During Page Refresh Hydration

## Summary

When a pattern page is refreshed, mapped arrays may temporarily contain `undefined` items during hydration. Derives that iterate over these arrays without null checks will throw `TypeError` and potentially trigger reactivity loops. **Defensive null checks are recommended** until we better understand the root cause.

## The Observation

After refreshing a deployed pattern with a multi-level pipeline (5 stages of map + generateObject/fetchData):

1. **TypeError observed**: `Cannot read properties of undefined (reading 'sourceUrl')`
2. **Reactivity loop**: `Too many iterations: 101 action` error
3. **Storage transaction failures**: Multiple concurrent write conflicts
4. **Counter discrepancies**: L3 counter showed 0/4 when data should exist

The array existed and had the correct length, but individual items were `undefined`.

## Our Hypothesis (LOW CONFIDENCE)

**What we THINK is happening:**
1. Framework restores array from storage during page refresh
2. Array length is restored before individual item data
3. Derives run during this intermediate state
4. Items accessed via `.map()` or `.filter()` are `undefined`
5. Property access on undefined items throws TypeError
6. Error triggers reactive re-evaluation
7. Re-evaluation hits same error → loop

**Why we're uncertain:**
- Haven't confirmed with framework author
- No minimal reproduction created
- Could be pattern-specific issue (complex 5-level pipeline)
- Could be related to how we're using `map()` over cell arrays

## What We Did (Defensive Fix)

Added null checks to ALL derives that iterate over arrays:

```typescript
// BEFORE (crashes during hydration)
const completedCount = derive(items, (list) =>
  list.filter((e: any) => !e.extraction?.pending).length
);

// AFTER (defensive)
const completedCount = derive(items, (list) =>
  list.filter((e: any) => e && !e.extraction?.pending).length
);

// For loops also need checks
for (const item of items) {
  if (!item) continue; // Skip undefined items during hydration
  // ... process item
}
```

## How To Falsify This

This hypothesis would be **proven wrong** if:
1. Framework author says arrays are always fully hydrated before derives run
2. We find another root cause for the TypeError (e.g., stale array references)
3. The issue never reproduces even without null checks

This hypothesis would be **confirmed** if:
1. Framework author confirms hydration can have intermediate states
2. We create minimal reproduction showing timing
3. Other users report similar issues during page refresh

## Related Observations

- Pattern was using complex nested maps: `manualArticleProcessing.map(processArticleUrl)`
- Each `processArticleUrl` creates multiple derived cells (L2-L5)
- Storage shows many concurrent transaction conflicts
- Issue only manifests on page REFRESH, not initial load

## Open Questions

1. Is this a framework bug or expected behavior?
2. Should we report this to framework author?
3. Are null checks the right fix, or do they mask a deeper issue?
4. Does this only happen with nested map operations?

## Metadata

```yaml
topic: hydration, page-refresh, arrays, undefined, reactivity-loops, derives
discovered: 2025-11-29
confirmed_count: 1
last_confirmed: 2025-11-29
confidence: low
sessions: [prompt-injection-tracker-caching-investigation]
related_functions: derive, map, filter, page refresh
stars: 4
status: needs-investigation
```
