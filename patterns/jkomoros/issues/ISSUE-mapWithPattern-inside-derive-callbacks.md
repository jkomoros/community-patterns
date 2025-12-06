# Issue: `.filter().map()` fails inside `derive()` callbacks with "mapWithPattern is not a function"

## Summary

When using `.filter().map()` chains inside `derive()` callbacks, the compiler transforms `.map()` to `.mapWithPattern()`, but at runtime the filtered array is a plain JavaScript array that doesn't have this method, causing a runtime error.

## Frequency

**This is a common footgun.** We encounter it frequently when building patterns that need to filter and transform arrays reactively. The community-docs already have multiple related superstitions:

- `2025-11-21-cannot-map-computed-arrays-in-jsx.md` (2 confirmations)
- `2025-11-29-map-only-over-cell-arrays-fixed-slots.md`
- `2025-11-29-no-computed-inside-map.md`

The workaround (using `for` loops instead of `.filter().map()`) is non-obvious and makes code less readable.

## Use Case

**Pattern:** wish-recipe-companion.tsx (and many others)

**What we're trying to accomplish:**
- Filter an array based on a condition
- Map over the filtered results to extract a property
- Do this reactively inside a `derive()` callback

This is a very common JavaScript pattern that users expect to "just work."

## Current State (What Works)

Using a `for` loop instead of method chaining:

```typescript
const wishQuery = derive({ foodDescription, preferences }, ({ foodDescription: food, preferences: prefs }) => {
  // Workaround: Use for loop instead of .filter().map()
  const liked: string[] = [];
  const disliked: string[] = [];
  for (const p of prefs) {
    if (p.preference === "liked") liked.push(p.ingredient);
    else if (p.preference === "disliked") disliked.push(p.ingredient);
  }

  let query = `Suggest a recipe that complements: "${food}"`;
  if (liked.length > 0) query += `. I especially like: ${liked.join(", ")}`;
  if (disliked.length > 0) query += `. Please avoid: ${disliked.join(", ")}`;
  return query;
});
```

## What We Tried (Failed Attempts)

### Attempt 1: Direct `.filter().map()` chain

```typescript
const wishQuery = derive({ foodDescription, preferences }, ({ foodDescription: food, preferences: prefs }) => {
  const liked = prefs.filter(p => p.preference === "liked").map(p => p.ingredient).join(", ");
  const disliked = prefs.filter(p => p.preference === "disliked").map(p => p.ingredient).join(", ");
  // ... build query
});
```

**Error:**
```
TypeError: prefs.filter(...).mapWithPattern is not a function
```

**Analysis:** The compiler sees `.map()` and transforms it to `.mapWithPattern()`. But inside the derive callback, `prefs` is already unwrapped to a plain JS array, and `.filter()` returns another plain JS array. Plain arrays don't have `.mapWithPattern()`.

---

### Attempt 2: Using `computed()` with `.get()`

```typescript
const likedIngredients = computed(() =>
  preferences.get()
    .filter(p => p.preference === "liked")
    .map(p => p.ingredient)
);
```

**Error:**
```
TypeError: preferences.get is not a function
```

**Analysis:** Inside `computed()`, the framework also unwraps values, so `.get()` doesn't exist.

---

### Attempt 3: Using separate `derive()` calls

```typescript
const likedPrefs = derive(preferences, (prefs) =>
  prefs.filter(p => p.preference === "liked")
);

// Then in JSX:
{likedPrefs.map(pref => <span>{pref.ingredient}</span>)}
```

**Result:** This works for JSX rendering, but if you need to use the filtered/mapped result in another `derive()` for string building, you're back to the same problem.

## Root Cause Analysis

Looking at `packages/ts-transformers/src/closures/strategies/map-strategy.ts`:

1. **Lines 127-140**: The compiler has special handling - if the target of `.map()` is a `derive()` call, it always transforms to `.mapWithPattern()`

2. **Lines 209-265**: `isInsideDeriveWithOpaqueRef()` checks if we should skip transformation inside derive callbacks, but it only checks if the **direct target** of `.map()` is an OpaqueRef

3. **The gap**: When you have `.filter().map()`, the target of `.map()` is the result of `.filter()` - which at compile time looks like an array type, but at runtime is a plain JS array (because the original Cell was unwrapped by derive)

The compiler already has logic to walk method chains (lines 152-186 in `isOpaqueRefArrayMapCall`), but this logic isn't applied correctly when inside a derive callback.

## Possible Fixes

### Option 1: Extend method chain detection inside derive callbacks

When inside a derive callback, trace `.filter().map()` chains back to see if the origin is a callback parameter. If so, skip transformation since callback parameters are unwrapped at runtime.

```typescript
// In isInsideDeriveWithOpaqueRef or shouldTransformMap:
// If map target is result of .filter()/.slice()/etc. on a derive callback parameter,
// skip transformation
```

### Option 2: Track unwrapped parameters in context

When entering a derive callback, mark all parameters as "unwrapped" in the transformation context. Skip `.mapWithPattern()` transformation for any value derived from these parameters.

### Option 3: Conservative approach

Inside derive callbacks, only transform `.map()` calls directly on Cell-typed identifiers, never on method chain results. This is more conservative but simpler.

### Option 4: Runtime fallback

Have `.mapWithPattern()` fall back to regular `.map()` if the array doesn't have the method. This is a runtime fix rather than compile-time, but would prevent crashes.

## Questions

1. **Which fix approach would be preferred?** Option 1 seems most surgical, Option 3 is safest.

2. **Are there cases where `.filter().map()` inside derive SHOULD transform?** I can't think of any, since derive always unwraps its inputs.

3. **Should this also apply to other array methods?** `.slice().map()`, `.concat().map()`, etc.?

4. **Is there a way for users to opt-out of transformation?** A comment directive or type annotation?

## Desired Behavior

```typescript
const wishQuery = derive({ preferences }, ({ preferences: prefs }) => {
  // This should "just work" - no transformation needed since prefs is unwrapped
  const liked = prefs.filter(p => p.preference === "liked").map(p => p.ingredient);
  return liked.join(", ");
});
```

The compiler should recognize that inside a derive callback, method chains on callback parameters produce plain JS arrays and should not be transformed to use `.mapWithPattern()`.

## Environment

- CommonTools framework (labs repo, commit ~Dec 2024)
- Affects all patterns using `.filter().map()` or similar chains inside derive callbacks
- Related transformer: `packages/ts-transformers/src/closures/strategies/map-strategy.ts`

---

**This is a significant developer experience issue. The workaround (for loops) is non-obvious and makes code less idiomatic. Any guidance on the best fix approach would be appreciated!**
