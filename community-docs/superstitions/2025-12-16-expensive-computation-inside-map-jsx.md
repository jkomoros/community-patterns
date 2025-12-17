# Expensive Computation Inside .map() JSX Causes N² CPU Spikes

## TL;DR - The Rule

**Lift expensive computation out of `.map()` JSX into `computed()` cells.**

```tsx
// ❌ BAD - runs N times (once per charm instance)
{items.map(item => expensiveFunction(item.data))}

// ✅ GOOD - runs once, cached
const processed = computed(() => items.map(item => expensiveFunction(item.data)));
{processed.map(result => <div>{result}</div>)}
```

**This is permanent guidance, not a temporary workaround.** It's how reactive frameworks are designed to work.

---

## Summary

**Never put expensive computation inline inside `.map()` JSX closures.** When the framework discovers recipe functions, it evaluates parent scope closures for EVERY mapped item. This means expensive operations like `computeWordDiff()` or string processing get called N times during each reactive pass—even when guarded by conditionals. Combined with reactive cascades (N items × N actions), this creates N² complexity that can cause 5-60 second CPU spikes.

## The Problem

When you have expensive computation inline in JSX inside a `.map()`:

```tsx
// ❌ BAD: Expensive computation inline in .map() JSX
{changesPreview.map((change) => (
  <div>
    {change.field === "Notes"
      ? computeWordDiff(change.from, change.to).map(part => ...)  // EXPENSIVE!
      : <span>{change.from} → {change.to}</span>
    }
  </div>
))}
```

Even though `computeWordDiff` is only called for the Notes field, **the closure containing it is evaluated during recipe discovery for EVERY mapped item**. With 14 fields, this means:
- 14 charm instances (one per map item)
- Each running `computeWordDiff`
- On every reactive update

This caused 5-60 second CPU spikes in production.

## The Fix

Pre-compute expensive values in a `computed()` cell OUTSIDE the `.map()`:

```tsx
// ✅ GOOD: Pre-compute expensive operation in computed(), reference in JSX
const notesDiffChunks = computed(() => {
  const notesChange = changesPreview.find((c) => c.field === "Notes");
  if (!notesChange || !notesChange.from || !notesChange.to) {
    return [];
  }
  return computeWordDiff(notesChange.from, notesChange.to);  // Runs ONCE
});

// In JSX - just reference the pre-computed value
{changesPreview.map((change) => (
  <div>
    {change.field === "Notes"
      ? notesDiffChunks.map(part => ...)  // Just a reference!
      : <span>{change.from} → {change.to}</span>
    }
  </div>
))}
```

## Why This Happens

Three framework behaviors compound into N² complexity:

### 1. `.map()` Re-evaluates Parent Scope
When ANY parent input changes, the map action re-executes completely via `discoverAndCacheFunctions()` which traverses the entire recipe tree. This evaluates parent scope JavaScript—including closures with expensive computation.

**Location:** `labs/packages/runner/src/runner.ts:350-351`

### 2. Reactive Cascade (No Batching)
N array items create N actions subscribed to the same inputs. When any input changes, ALL N actions trigger. Each action runs and re-subscribes, potentially triggering more. The framework has `MAX_ITERATIONS_PER_RUN = 100` to prevent infinite loops—evidence they know this is a problem.

**Location:** `labs/packages/runner/src/scheduler.ts:80, 611-617`

### 3. No Lazy Closure Evaluation
Even conditionally-guarded code (`change.field === "Notes" ? ...`) has its closure evaluated during recipe discovery. The conditional doesn't prevent the closure from being analyzed and potentially executed.

## Symptoms of This Problem

1. **5-60 second CPU spikes** when LLM extraction completes or arrays update
2. **Browser becomes unresponsive** during reactive updates
3. **Multiple charm IDs in console logs** for what should be a single operation
4. **Fan spinning / high CPU** during what should be simple UI updates
5. **Console log count** matching the number of fields/items in array

## How to Diagnose

Add instrumentation to see if you're hitting this:

```tsx
// Diagnostic: Add to expensive functions
console.log(`[PERF] computeExpensiveThing from Charm(${self?.toString?.() || 'unknown'})`);
```

If you see **multiple unique charm IDs** calling the same function, you've hit this issue.

## How We Found This

1. Observed ~5 second CPU spikes when "Extract Data from Notes" LLM completed
2. User reported spikes up to 30-60 seconds in some cases
3. Added instrumentation showing `computeWordDiff` being called from **14 unique charm IDs**
4. 14 charm IDs matched the 14 fields in the LLM extraction schema
5. Investigated framework code: discovered `.map()` creates per-item charms
6. Moved `computeWordDiff` to pre-computed `computed()` cell
7. CPU spike reduced from ~5 seconds to **~2 milliseconds**

## Why This Is Permanent (Not a Bug)

This behavior is **architectural, not a bug**:

1. **Multiple charm instances per map item is intentional** - Each item needs its own reactive context for fine-grained updates. The alternative (one charm for whole list) would re-render everything on any change.

2. **Recipe discovery must evaluate closures** - The framework needs to understand dependencies to build the reactive graph. This is fundamental to how reactivity works.

3. **`computed()` is designed for this** - It makes dependencies explicit and guarantees single computation. This is the idiomatic pattern.

**Even if the framework adds batching or optimizations in the future, this pattern will still be correct.**

## What Counts as "Expensive"?

Apply this rule when computation involves:
- **String processing** - diffing, parsing, formatting large text
- **Array transformations** - sorting, filtering, reducing large arrays
- **Object traversal** - deep equality checks, serialization
- **Any async operation** - API calls, file reads
- **Anything >1ms** - when in doubt, measure

## Related Superstitions

- `2025-11-29-derive-inside-map-causes-thrashing.md` - Related: cell creation inside map
- `2025-11-29-no-computed-inside-map.md` - Related: reactive cells inside map

The difference: those are about **creating new cells** inside map. This is about **expensive computation** inside map JSX closures—even without creating cells.

## Pattern Fix Locations

This fix was applied to:
- `patterns/jkomoros/person.tsx` - Moved `computeWordDiff` to `notesDiffChunks` computed cell
- `patterns/jkomoros/food-recipe.tsx` - Same fix for `computeWordDiff` in extraction preview

See investigation details: `patterns/jkomoros/design/todo/cpu-spike-investigation.md`

## Metadata

```yaml
topic: performance, map, jsx, closure, computed, cpu-spike
discovered: 2025-12-16
confirmed_count: 1
last_confirmed: 2025-12-16
confidence: high
sessions: [cpu-spike-llm-extraction-investigation]
related_functions: map, computed, generateObject
related_files:
  - labs/packages/runner/src/runner.ts
  - labs/packages/runner/src/scheduler.ts
  - labs/packages/runner/src/builtins/map.ts
stars: 5
status: confirmed
```
