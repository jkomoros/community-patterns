# Framework Issue: Self-Referential Wish Causes Infinite Loop

## Summary

When a pattern uses `wish()` with a query that matches its own exported data, the framework enters an infinite loop with 100% CPU usage and no error message. This is a severe bug that can make patterns completely undeployable.

## Priority

**High** - Silent failure with no diagnostic information. Causes 100% CPU and hangs deployment. Very difficult to debug without knowing this specific pitfall.

## Reproduction Steps

1. Create a pattern that exports typed data (e.g., `memberships: HotelMembership[]`)
2. In the same pattern, use `wish()` to query for that data type:
   ```typescript
   const wishedCharms = wish<HotelMembershipOutput>({ query: "#hotelMemberships" });
   ```
3. Try to deploy with `charm new`

**Result:** Deployment hangs, Deno CPU goes to 100%, no error message

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

### The Loop

1. Pattern A is created with exported data matching query Q
2. Pattern A calls `wish(Q)`
3. Wish system finds Pattern A's data matches Q
4. Wish resolves with Pattern A's charm
5. This triggers reactive update in Pattern A
6. Pattern A re-evaluates, including the wish
7. Go to step 3 (infinite loop)

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
