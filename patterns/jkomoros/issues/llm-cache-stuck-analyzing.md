# LLM Cache Issue: Photos Stuck in "Analyzing..." State

## Observation

When using the `hidden: boolean` workaround for the map identity tracking issue, photos sometimes get stuck showing "Analyzing..." permanently instead of quickly resolving from cache.

**Expected behavior:** When a photo moves from index 2 to index 1 (due to array mutation), the generateObject call should have identical parameters (same photo data, same prompt), so the LLM SDK's cache should return the response quickly (within milliseconds).

**Actual behavior:** Photos appear to get stuck in "Analyzing..." state and never complete, even though the LLM SDK should have cached the response.

## Root Cause Analysis

### How generateObject Caching Works

In `packages/runner/src/builtins/llm.ts` lines 847-874:

```typescript
const hash = refer(generateObjectParams).toString();
const currentRequestHash = requestHashWithLog.get();
const currentResult = resultWithLog.get();

// Return if the same request is being made again
// Only skip if we have a result - otherwise we need to (re)make the request
if (currentResult !== undefined && hash === currentRequestHash) {
  return;
}

// Also skip if this is the same request in the current transaction
if (hash === previousCallHash) {
  return;
}

previousCallHash = hash;

// Only increment currentRun if this is a NEW request (different hash)
if (hash !== currentRequestHash) {
  currentRun++;
}
const thisRun = currentRun;

resultWithLog.set(undefined);
errorWithLog.set(undefined);
partialWithLog.set(undefined);
pendingWithLog.set(true);  // ← Sets "Analyzing..." state
```

### The Problem: Two-Level Caching

There are TWO levels of caching:

1. **Cell-level cache** - Stored in the result cell's `requestHash` field
2. **LLM SDK cache** - The LLM client's internal cache

When Photo C moves from index 2 to index 1:
- A **new result cell** is created at index 1 (due to map's index-based identity)
- This new cell has `currentResult = undefined` and `currentRequestHash = undefined`
- Even though the request parameters are identical to Photo C's previous request at index 2
- The cell-level cache check fails, so it proceeds to make a request
- The LLM SDK cache SHOULD return quickly, but...

### Race Condition: Abandoned Requests

The critical issue is in lines 882-893:

```typescript
resultPromise
  .then(async (response) => {
    if (thisRun !== currentRun) return;  // ← Abandons result!

    await runtime.idle();

    await runtime.editWithRetry((tx) => {
      resultCell.key("pending").withTx(tx).set(false);
      resultCell.key("result").withTx(tx).set(response.object);
      resultCell.key("requestHash").withTx(tx).set(hash);
    });
  })
```

**Race condition scenario:**

1. Photo C moves to index 1, creates new result cell
2. `generateObject` action runs: `currentRun = 1`, `thisRun = 1`, `pending = true`
3. LLM SDK returns from cache quickly (say, 50ms)
4. **Before the result is written**, something triggers cell re-evaluation:
   - User interacts with UI
   - Another photo completes
   - Array reactivity fires
5. `generateObject` action runs AGAIN for same cell
6. Cell still has `currentResult = undefined` (previous write hasn't completed)
7. Cell still has `currentRequestHash = undefined`
8. **New transaction**, so `previousCallHash` check doesn't help
9. `currentRun` increments to 2, `thisRun = 2`, new request starts
10. Previous response (thisRun=1) arrives but `thisRun (1) !== currentRun (2)` → **abandoned!**
11. New response (thisRun=2) is requested
12. **Cycle repeats** if cell keeps getting re-evaluated

Result: `pending` stays `true` forever, showing "Analyzing..." permanently.

## Why This Happens with Map Identity Issue

When using `.toSpliced()` without the `hidden` workaround:
- Photo C moves from index 2 to index 1
- Creates new result cell (no cached data)
- **Triggers re-renders** as the new cell goes through pending → complete cycle
- These re-renders might trigger reactive dependencies that re-evaluate the cell
- Creates the race condition described above

## Testing Hypothesis

To test if this is the issue, check:

1. **Does the issue happen during high UI reactivity?**
   - More likely to happen when multiple photos are being processed
   - More likely when user is actively interacting with UI
   - Less likely with single photo in isolation

2. **Do browser console logs show repeated requests?**
   - Add logging to see if `currentRun` keeps incrementing
   - Check if LLM requests are being made repeatedly for same photo

3. **Does adding debouncing/throttling help?**
   - If we reduce cell re-evaluation frequency, does it resolve?

## Potential Solutions

### Option 1: Fix Map Identity Tracking (Preferred)
Use element-based identity instead of index-based identity in map implementation. This prevents new cells from being created when array elements shift positions.

See: `map-identity-tracking-issue.md`

### Option 2: Improve Request Abandonment Logic
Modify the `thisRun !== currentRun` check to be smarter:
- If the request hash is identical, don't abandon the result
- Let the "losing" request complete and use its result if the "winning" request hasn't finished yet

### Option 3: Add Request Deduplication
Before making a new LLM request, check if there's already a pending request with the same hash and wait for it instead of abandoning it.

### Option 4: Increase Caching Window
Store cell-level cache results in a shared cache indexed by request hash, so new cells can find cached results even if they're different cell instances.

## Related Issues

- Map identity tracking issue: `map-identity-tracking-issue.md`
- Store mapper extraction reset bug: Lines 700-703 in `store-mapper.tsx`

## Questions

1. Is the race condition hypothesis correct? Can we verify with logging?
2. Is this specific to `generateObject`, or do `generateText` and `llm` have the same issue?
3. Should the framework handle this at the LLM builtin level, or is this a broader cell re-evaluation issue?
4. Are there other builtins that might have similar race conditions with request abandonment?
