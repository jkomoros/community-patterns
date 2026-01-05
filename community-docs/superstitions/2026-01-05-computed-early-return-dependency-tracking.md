# Establish Reactive Dependencies Before Early Returns in computed()

**Date:** 2026-01-05
**Status:** confirmed
**Confidence:** high
**Stars:** 5

## Summary

When a `computed()` function accesses another `computed` value and has early returns (for pending/error/conditional logic), the dependency may never be tracked if the access happens after the early return. **Always assign computed values to local variables at the top of the function, before any conditional logic.**

## The Problem

CommonTools' reactive system tracks dependencies by observing which values are **actually accessed during execution**. If your code path returns early before accessing a computed value, that value is never tracked as a dependency.

```typescript
// BROKEN - preview dependency not tracked when pending/error
const currentPhase = computed(() => {
  const phase = extractPhase.get() || "select";
  if (phase === "extracting") {
    if (extraction.pending) return "extracting";  // Returns before preview access!
    if (extraction.error) return "error";         // Returns before preview access!
    if (preview?.fields?.length) return "preview"; // Dependency never established
  }
  return phase;
});
```

**What happens:**
1. Initial evaluation: `extraction.pending` is true -> early return
2. `preview?.fields?.length` is never accessed -> no dependency tracked
3. Later: `preview` updates with data -> `currentPhase` doesn't re-run
4. UI shows wrong state forever

## The Fix

Assign the computed value to a local variable **before any conditional logic**:

```typescript
// CORRECT - preview dependency tracked on first evaluation
const currentPhase = computed(() => {
  const p = preview; // Establish reactive dependency BEFORE conditionals
  const phase = extractPhase.get() || "select";
  if (phase === "extracting") {
    if (extraction.pending) return "extracting";
    if (extraction.error) return "error";
    if (p?.fields?.length) return "preview";  // Use local variable
    if (extraction.result && !p?.fields?.length) return "no-results";
    return "extracting";
  }
  return phase;
});
```

**Why this works:**
- `const p = preview;` accesses `preview` on the first line
- Reactive system registers the dependency immediately
- Later updates to `preview` trigger re-evaluation
- Doesn't matter which code path executes

## The Chaining Problem

This issue also affects **computed-to-computed chains**:

```typescript
// BROKEN - Chained access breaks dependencies
const extractableSources = computed(() => scanExtractableSources(parentSubCharms.get()));

const hasSelectedSources = computed(() => {
  if (extractableSources.length === 0) return false;  // Access through intermediate computed
  const selectionsMap = sourceSelections.get() || {};
  return extractableSources.some(s => selectionsMap[s.index] !== false);
});
```

**Fix: "Flatten" the chain** - read directly from source Cells:

```typescript
// CORRECT - Direct access to source Cell
const hasSelectedSources = computed(() => {
  const subCharms = parentSubCharms.get() || [];  // Read source Cell directly
  const sources = scanExtractableSources(subCharms);
  if (sources.length === 0) return false;
  const selectionsMap = sourceSelections.get() || {};
  return sources.some(s => selectionsMap[s.index] !== false);
});
```

## Rules of Thumb

### 1. Assign Computed Values Early

```typescript
// BAD
const result = computed(() => {
  if (someCondition) return early;
  return otherComputed.value; // Dependency only tracked in non-early-return path
});

// GOOD
const result = computed(() => {
  const other = otherComputed; // Track dependency first
  if (someCondition) return early;
  return other.value;
});
```

### 2. Flatten Computed Chains

```typescript
// BAD - Chain breaks dependencies
const derived1 = computed(() => sourceCell.transform());
const derived2 = computed(() => derived1.furtherTransform());

// GOOD - Both read source directly
const derived1 = computed(() => sourceCell.transform());
const derived2 = computed(() => {
  const source = sourceCell.get();
  return source.transform().furtherTransform();
});
```

### 3. Test Your Reactive Paths

If a computed should update but doesn't:
1. Check if it accesses other computeds
2. Look for early returns before those accesses
3. Add local variable assignments at the top

## Symptoms

- Computed values that never update despite their dependencies changing
- UI stuck in loading/pending state even after data arrives
- "Phase" or state variables that don't transition properly
- Conditional logic that seems to break reactivity

## Real-World Example

**Pattern:** `extractor-module.tsx` - AI extraction preview
**Bug:** Preview phase never displayed after extraction completed
**Debugging time:** 5-7 days
**Root cause:** `preview?.fields?.length` accessed after early returns

**Impact:**
- Users couldn't see extraction results
- Appeared as if extraction never completed
- No error messages, just wrong state

**Fix in commit d515f18b5:**
- Added `const p = preview;` before conditionals in `currentPhase`
- Flattened `hasSelectedSources`, `selectedSourceCount`, `photoSources`, `hasNoSources`
- Immediate resolution - preview phase started working

## Is This CommonTools-Specific?

**No - this is a general reactive programming pattern.**

Any system with:
- Execution-based dependency tracking (MobX, Vue, Solid.js, etc.)
- Early returns in reactive computations
- Computed-to-computed chaining

Will have this same issue. The fix pattern applies universally:
1. Access dependencies before early returns
2. Avoid deep computed chains
3. Read from source data directly when possible

## Related Issues

- `2025-11-29-derive-inside-map-causes-thrashing.md` - Creating `computed()` in `.map()` creates new nodes
- `2025-11-29-no-computed-inside-map.md` - Node identity problems with inline `computed()`
- `2025-11-26-reactive-first-pass-may-have-empty-data.md` - First reactive pass behavior

## Metadata

```yaml
topic: reactivity, computed, dependency-tracking, early-returns, computed-chaining
discovered: 2026-01-01
confirmed: 2026-01-05
debugging_duration: 5-7 days
session: extractor-module-preview-phase-debugging
pattern: packages/patterns/record/extraction/extractor-module.tsx
commits: [d515f18b5, 8a48bf9cf, 69898e29a]
status: confirmed
confidence: high
stars: 5
applies_to: [CommonTools, MobX, Vue, Solid.js, general-reactive-programming]
```

## Guestbook

- 2026-01-05 - Spent nearly a week debugging why extraction preview never showed. The computed `currentPhase` accessed `preview?.fields?.length` after early returns for `pending` and `error` states. During initial evaluation, early returns prevented the access, so `preview` was never tracked as a dependency. When extraction completed and `preview` updated, `currentPhase` didn't re-run. Fixed by adding `const p = preview;` before any conditionals. Also discovered and fixed same pattern in 4 other computeds (`hasSelectedSources`, `selectedSourceCount`, `photoSources`, `hasNoSources`) that were chaining through intermediate computed `extractableSources`. The core lesson: reactive dependencies are tracked by ACTUAL execution, not static analysis. Access all dependencies before any early-return logic. (extractor-module-preview-phase)

---

**Remember:** The reactive system only knows about dependencies you actually access during execution. Early returns can prevent dependency tracking. Always access computed values at the top of your function!
