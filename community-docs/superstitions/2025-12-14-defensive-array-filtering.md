# Superstition: Defensive Array Filtering in Computed/Derive

**Date:** 2025-12-14
**Confirmed by:** 1 developer
**Status:** Superstition (needs more confirmation)

## Symptom

When iterating over arrays inside `computed()` or `derive()` blocks, you get:
- `TypeError: Cannot read properties of undefined (reading 'id')`
- `TypeError: Cannot read properties of undefined (reading 'name')`
- Similar errors accessing properties on array items

The errors appear in `Array.find()`, `Array.map()`, or `Array.filter()` callbacks.

## Root Cause (Suspected)

Arrays inside reactive contexts may contain `undefined` or `null` entries due to:
1. Framework OpaqueRef wrapping/unwrapping behavior
2. Timing issues during state updates
3. Cell array mutations that leave gaps

## Solution

Always defensively filter arrays before iterating:

```typescript
// BAD - will crash if array contains undefined
const locationPairs = computed(() => {
  const locs = locations;
  for (const loc of locs) {
    console.log(loc.name); // TypeError if loc is undefined
  }
});

// GOOD - filter out undefined/null first
const locationPairs = computed(() => {
  const locs = (Array.isArray(locations) ? locations : []).filter((l) => l != null) as Location[];
  for (const loc of locs) {
    console.log(loc.name); // Safe
  }
});
```

## Pattern

```typescript
// For Default<> inputs in computed:
const safeArray = (Array.isArray(rawArray) ? rawArray : []).filter((item) => item != null) as ItemType[];

// For Cell<>.get() in handlers:
const safeArray = (cell.get() || []).filter((item) => item != null);

// In derive() callbacks:
derive(arrayCell, (rawArray) => {
  const safeArray = rawArray.filter((item) => item != null);
  return safeArray.map(...);
});
```

## Places to Apply

Apply defensive filtering to:
- Any `.find()` call on Cell/Default arrays
- Any `.map()` call rendering UI
- Any `.filter()` call in computed values
- Any loop iterating over reactive arrays

## Related Docs

- `2025-12-14-checked-binding-cell-vs-computed.md` - Related Cell vs computed issues
- `2025-12-14-opaque-ref-closure-frame-limitation.md` - Frame tracking issues

## Confirmation Needed

This pattern resolved production errors in the extracurricular-selector pattern after arrays unexpectedly contained undefined entries following LLM extraction and triage operations. Needs confirmation from other developers.
