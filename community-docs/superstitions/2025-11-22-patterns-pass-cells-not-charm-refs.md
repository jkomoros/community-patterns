---
topic: patterns
discovered: 2025-11-22
confirmed_count: 1
last_confirmed: 2025-11-22
sessions: [food-recipe-viewer-development]
related_labs_docs: none found (checked ~/Code/labs/docs/common/PATTERNS.md)
status: superstition
stars: ⭐
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

# Pass Individual Cells Between Patterns, Not Whole Charm References

## Problem

When trying to create a new pattern instance from within a handler and pass data to it,
attempting to pass a reference to the current charm (or "self") doesn't work:

**Attempted approaches that failed:**
1. **Getting "self" reference** - No apparent way to get an Opaque reference to the current pattern from within the pattern itself
2. **Passing Opaque<RecipeOutput>** - Even if you could get a reference, TypeScript complains about Opaque types
3. **Using wish() with charm reference** - Can't construct wish paths without the charm reference first

**Example error situation:**
```typescript
// In food-recipe pattern, trying to create food-recipe-viewer:
const createViewer = handler<...>(() => {
  // ❌ How do I get a reference to THIS recipe to pass to viewer?
  const viewer = FoodRecipeViewer({
    sourceRecipe: ??? // No way to reference "self"
  });
  return navigateTo(viewer);
});
```

## Solution That Seemed To Work

Instead of passing a whole charm reference, **pass the individual cells** (state fields) that
the target pattern needs:

```typescript
// Target pattern accepts individual cells:
interface ViewerInput {
  recipeName: Default<string, "">;
  recipeServings: Default<number, 4>;
  recipeIngredients: Default<Ingredient[], []>;
  recipeStepGroups: Default<StepGroup[], []>;
}

// Source pattern handler receives state fields and passes them directly:
const createViewer = handler<
  Record<string, never>,
  {
    name: string;
    servings: number;
    ingredients: Ingredient[];
    stepGroups: StepGroup[];
  }
>((_event, { name, servings, ingredients, stepGroups }) => {
  // ✅ Pass individual cells to viewer
  const viewer = FoodRecipeViewer({
    recipeName: name,
    recipeServings: servings,
    recipeIngredients: ingredients,
    recipeStepGroups: stepGroups,
  });
  return navigateTo(viewer);
});
```

**Key insight**: Handlers receive the pattern's state fields as parameters, and can pass
them directly to newly instantiated patterns.

## Example

```typescript
// ❌ Before (tried to pass whole charm reference - doesn't work)
interface ViewerInput {
  sourceRecipe: Default<Opaque<RecipeOutput>, null>; // How to get this reference?
}

const createViewer = handler<...>(() => {
  // No way to get "self" reference here!
  const viewer = FoodRecipeViewer({ sourceRecipe: ??? });
  return navigateTo(viewer);
});

// ✅ After (pass individual cells - works!)
interface ViewerInput {
  recipeName: Default<string, "">;
  recipeServings: Default<number, 4>;
  recipeIngredients: Default<Ingredient[], []>;
  recipeStepGroups: Default<StepGroup[], []>;
}

const createViewer = handler<
  Record<string, never>,
  { name: string; servings: number; ingredients: Ingredient[]; stepGroups: StepGroup[]; }
>((_event, { name, servings, ingredients, stepGroups }) => {
  const viewer = FoodRecipeViewer({
    recipeName: name,
    recipeServings: servings,
    recipeIngredients: ingredients,
    recipeStepGroups: stepGroups,
  });
  return navigateTo(viewer);
});
```

## Context

Working on food-recipe-viewer pattern that needs recipe data from the source food-recipe pattern.

Initially tried to pass a reference to the whole recipe charm (Opaque<RecipeOutput>) so the
viewer could use wish() to live-link to the source data. This approach failed because:
1. No way to get "self" reference from within a pattern
2. Passing Opaque types between patterns unclear

The solution of passing individual cells works but creates a **snapshot** (not live-linked):
- Viewer gets recipe data at creation time
- If recipe changes, viewer doesn't update automatically
- To see updates, need to create a new viewer

**Trade-off accepted**: Snapshot approach is simpler and works for our use case (cooking view
doesn't need to stay in sync with recipe edits).

## Observed Patterns

Looking at labs/packages/patterns/ examples:
- **instantiate-recipe.tsx** (lines 75-77): Counter pattern calls `Counter({ value: ... })`
  passing a cell value directly
- **note.tsx** (lines 76-83): handleNewBacklink pushes charm to mentionable array, but doesn't
  demonstrate pattern-to-pattern cell passing

**Speculation**: The CommonTools pattern might be:
- Handlers can receive pattern state as parameters
- State fields can be passed as constructor params to other patterns
- This creates a data snapshot at instantiation time
- For live-linking, might need different approach (wish with charm ID? still unclear)

## Related Documentation

- **Official docs:** ~/Code/labs/docs/common/PATTERNS.md - Shows pattern structure but doesn't
  specifically address passing data between patterns
- **Related patterns:**
  - labs/packages/patterns/instantiate-recipe.tsx - Shows calling pattern as function
  - labs/packages/patterns/note.tsx - Shows handlers with pattern state
- **Similar issues:** None found

## Next Steps

- [ ] Needs confirmation by another session attempting pattern composition
- [ ] Check if there's a way to get "self" reference that we missed
- [ ] Ask framework author: Is cell-passing the intended pattern for pattern composition?
- [ ] Ask framework author: How to achieve live-linking between patterns (if possible)?
- [ ] Document if there's a better approach for live-linked pattern composition

## Notes

**Alternative approaches not tried:**
1. Global registry pattern (register recipe in a global cell, viewer looks it up)
2. Using #mentionable system to find recipes
3. Generating charm ID and using that somehow

**Questions:**
- Is there a wish-based approach that works for live-linking?
- Do other patterns in the wild solve this differently?
- Is snapshot vs live-linking a known trade-off in CommonTools?

**TypeScript quirks noticed:**
- Had to cast arrays: `ingredients as Ingredient[]` and `stepGroups as StepGroup[]`
- Error: `Type 'readonly { readonly item: string; ... }[]' is not assignable to type 'Opaque<...>'`
- The `as Type` casts resolved the readonly vs mutable type conflicts

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
