# Framework Issue: Self-Referential Wish + Composition Causes Infinite Loop

## Summary

When a **composed pattern** (one that uses another pattern internally) uses `wish()` with a query that matches its own exported data, the framework enters an infinite loop with 100% CPU usage and no error message.

**Important nuance:** A standalone pattern with the same self-referential wish worked fine for months. The infinite loop only manifested when the pattern was refactored to **compose** another pattern (GmailAgenticSearch). This suggests the issue is related to the interaction between pattern composition and wish, not self-referential wish alone.

## Priority

**High** - Silent failure with no diagnostic information. Causes 100% CPU and hangs deployment. Very difficult to debug without knowing this specific pitfall.

## Reproduction Steps

1. Create a base pattern (e.g., `GmailAgenticSearch`) with its own reactive cells
2. Create a parent pattern that **composes** the base pattern
3. In the parent pattern, export typed data (e.g., `memberships: HotelMembership[]`)
4. In the same parent pattern, use `wish()` to query for that data type:
   ```typescript
   const wishedCharms = wish<HotelMembershipOutput>({ query: "#hotelMemberships" });
   ```
5. Try to deploy with `charm new`

**Result:** Deployment hangs, Deno CPU goes to 100%, no error message

**Note:** The same self-referential wish in a **non-composed** pattern (hotel-membership-extractor.tsx) worked fine.

## Expected Behavior

The framework should either:
1. **Detect and prevent** self-referential wishes at compile/deploy time
2. **Automatically exclude** the current charm from wish results
3. **Throw a clear error** explaining the self-reference issue
4. **Add cycle detection** to break infinite reactive loops

## Actual Behavior

- Deployment hangs indefinitely
- Deno process uses 100% CPU
- No error messages in console
- No telemetry events in debugger
- Browser becomes unresponsive
- Must manually kill Deno process to recover
- No indication of what went wrong

## Minimal Reproduction

```typescript
import { recipe, schema, wish, derive, type Cell, NAME } from "commontools";
import { z } from "zod";

const DataSchema = schema({
  [NAME]: z.literal("SelfWishLoop"),
  items: z.array(z.object({ id: z.string() })),
});

type DataOutput = typeof DataSchema.Type;

export default recipe(DataSchema, ({ items }) => {
  // This wish will match our own export, causing infinite loop
  const wishedData = wish<DataOutput>({ query: "#SelfWishLoop" });

  const combined = derive([items, wishedData], ([local, wished]) => {
    // This derive will re-evaluate infinitely
    return [...(local || []), ...(wished?.result?.items || [])];
  });

  return { items, combined };
});
```

## Workaround

Remove the self-referential wish. Don't wish for data types that your pattern exports.

## Technical Analysis

### The Loop (Hypothesis)

When a composed pattern has a self-referential wish, the reactive graph may create a loop:

1. Parent pattern P composes child pattern C (which has its own reactive cells)
2. Parent pattern P exports data matching query Q
3. Parent pattern P calls `wish(Q)`
4. Wish system finds P's own data matches Q
5. Wish resolves, triggering reactive update
6. Because P composes C, the reactive update cascades through both graphs
7. Something in this composition causes the wish to re-evaluate
8. Go to step 4 (infinite loop)

**Key unknown:** Why does composition trigger the loop when standalone doesn't? Possibilities:
- Child pattern's reactive cells create additional dependencies
- Timing of initialization differs in composed patterns
- The composed pattern's reactive graph has cycles the standalone didn't

### Possible Fixes

**Option A: Automatic Self-Exclusion**
- Wish results should automatically exclude the calling charm
- Pros: Zero-config fix, matches intuition
- Cons: May break legitimate self-reference use cases (if any exist)

**Option B: Cycle Detection**
- Track wish resolution chain, detect cycles
- Break cycle by returning empty/cached result
- Log warning about detected cycle
- Pros: Handles complex multi-pattern cycles too
- Cons: More complex to implement

**Option C: Compile-Time Detection**
- Analyze pattern exports vs wish queries
- Error if pattern wishes for own export type
- Pros: Fails fast with clear error
- Cons: May have false positives, doesn't catch runtime-generated queries

**Option D: Clear Error Message**
- At minimum, detect the infinite loop condition at runtime
- Throw descriptive error: "Self-referential wish detected: pattern X wishes for data it exports"
- Pros: Easy to implement, helps debugging
- Cons: Doesn't prevent the issue

## Impact

- **Severity:** High - completely blocks deployment
- **Discoverability:** Very low - no error messages
- **Debug time:** Hours (we spent significant time before identifying the cause)
- **Affected patterns:** Any pattern using wish for data aggregation

## Related

- Superstition: `community-docs/superstitions/2025-12-04-self-referential-wish-causes-infinite-loop.md`
- Pattern: `patterns/jkomoros/hotel-membership-gmail-agent.tsx`

## Environment

- Framework: CommonTools
- Pattern file: hotel-membership-gmail-agent.tsx
- Date discovered: 2025-12-04

---

**Filed by:** Claude Code session (hotel-membership-migration-check-recent)
**Date:** 2025-12-04
