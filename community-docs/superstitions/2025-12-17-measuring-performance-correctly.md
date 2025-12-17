# Timing Inside computed() Only Measures Graph Setup, Not Reactive Execution

## Summary

When you add timing instrumentation inside a `computed()`, it only measures the initial graph construction, not when the computed re-runs in response to dependency changes. The framework uses lazy, deferred execution - reactive re-runs happen asynchronously via `setTimeout(..., 0)`.

## Observed: 2025-12-17

## The Problem

```typescript
// ❌ WRONG - Only measures graph setup, not re-execution
const myComputed = computed(() => {
  console.time('compute');
  const result = expensiveCalculation();
  console.timeEnd('compute');
  return result;
});
```

This timing code fires once during graph construction, then the actual reactive re-runs bypass it entirely because they're scheduled asynchronously through the scheduler.

## Why This Happens

1. **`computed()` creates a NodeFactory** - just wraps the function, doesn't execute it:
   ```typescript
   // From /labs/packages/runner/src/builder/module.ts line 227
   export const computed: <T>(fn: () => T) => OpaqueRef<T> = <T>(fn: () => T) =>
     lift<any, T>(fn)(undefined);
   ```

2. **Initial execution happens during graph construction** - the closure runs once to build the dependency graph

3. **Reactive re-runs are scheduled asynchronously** via `setTimeout(..., 0)`:
   ```typescript
   // From /labs/packages/runner/src/scheduler.ts line 773-775
   function queueTask(fn: () => void): void {
     setTimeout(fn, 0);  // Executes in NEXT event loop
   }
   ```

4. **Re-execution goes through the scheduler's `run()` method** - which has its own internal timing, but your console.time() in the computed body doesn't capture this.

## The Correct Approaches

### 1. Count Function Calls (Most Reliable)

Track how many times expensive operations run:

```typescript
// ✅ CORRECT - Count executions
let computeCallCount = 0;

const myComputed = computed(() => {
  computeCallCount++;
  console.log(`[PERF] compute called ${computeCallCount} times`);
  return expensiveCalculation();
});
```

This reveals the **true performance impact**: if a function runs 18 times instead of 1, that's your problem.

### 2. Use Chrome DevTools Performance Tab

- Record while interacting with the pattern
- Look for long tasks (>50ms)
- Identify hot paths (e.g., `intern()`, `claim()` functions)
- Measure total blocking time across trials

### 3. A/B Test with Deployed Versions

The proven methodology from cpu-spike-investigation.md:
1. Deploy BEFORE version to `test-before` space
2. Deploy AFTER version to `test-after` space
3. Run identical interactions on both
4. Compare:
   - Function call counts (via console logs)
   - Total blocking time (via DevTools)
   - CPU profiler results

### 4. Measure in Handlers (Where Mutations Happen)

Handlers execute synchronously when called:

```typescript
// ✅ CORRECT - Handlers are synchronous
const processData = handler<{ data: unknown }, { result: Cell<any> }>(
  ({ data }, { result }) => {
    const start = Date.now();
    const processed = expensiveWork(data);
    console.log(`[PERF] Processing: ${Date.now() - start}ms`);
    result.set(processed);
  }
);
```

### 5. Use `.sink()` to Observe Re-execution

```typescript
// ✅ CORRECT - sink() fires on EVERY update
let recomputeCount = 0;
myComputed.sink((value) => {
  console.log(`[PERF] Recomputed #${++recomputeCount} at ${new Date().toISOString()}`);
});
```

## Key Metrics to Measure

| What to Measure | How | Why |
|-----------------|-----|-----|
| Function call count | Console log counter | Reveals N² complexity |
| Render count | Counter in JSX closure | Shows unnecessary re-renders |
| Total blocking time | DevTools Performance | User-perceived lag |
| Hot function time | CPU Profiler | Identifies bottlenecks |

## Real Example: extracurricular-v2 A/B Test (2025-12-17)

Testing BEFORE vs AFTER optimization with identical workflow (add location, import 4 classes, pin all 4):

**BEFORE version (inline calculations in JSX):**
```
scheduleDerive #1-9: called with 0 classes (initial setup)
scheduleDerive #10-11: called with 1 class
scheduleDerive #12-13: called with 2 classes
scheduleDerive #14-15: called with 3 classes
scheduleDerive #16-17: called with 4 classes
Total: 17 derive calls
```
Each call does: `list.indexOf(cls)` O(n) + `timeToTopPosition()` + `durationToHeight()` per class

**AFTER version (precomputed scheduleData):**
```
scheduleDataComputed #1-10: empty, returning null (initial setup)
scheduleDataComputed #11-12: processing 1 class
scheduleDataComputed #13-14: processing 2 classes
scheduleDataComputed #15-16: processing 3 classes
scheduleDataComputed #17-18: processing 4 classes
Total: 18 computed calls, 17+ derive calls
```
Each computed call precomputes colorIdx/top/height ONCE, derive just reads values

**Key Insight:** Both versions have ~17-18 reactive re-runs. The optimization isn't about reducing re-runs - it's about **reducing work PER re-run**:
- BEFORE: O(n²) operations per derive (indexOf for each class in array)
- AFTER: O(n) precomputation, then O(1) reads

## Earlier Example: 18x Improvement

From cpu-spike-investigation, comparing inline vs pre-computed:

**BEFORE (expensive computation inline in .map() JSX):**
- 18 function calls from 9 charm instances
- 5+ second CPU spike

**AFTER (precomputed in computed()):**
- 1 function call
- ~2ms execution

The difference wasn't visible in `console.time()` inside the computed - it was only visible by counting calls and using DevTools profiling.

## Reference

- `/labs/packages/runner/src/scheduler.ts` - Lines 151-208 (subscribe), 474-478 (queueExecution), 515-633 (execute)
- `/labs/packages/runner/src/builder/module.ts` - Line 227 (computed definition)
- `patterns/jkomoros/design/todo/cpu-spike-investigation.md` - Real-world A/B test methodology
