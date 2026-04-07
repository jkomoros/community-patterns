# ISSUE: No Primitive for Programmatic Charm Creation Without Navigation

## Summary

The CommonTools framework lacks a primitive function to programmatically create and persist charms without navigating to them. This creates a significant limitation when building features that need to batch-create charms (like AI-assisted recipe extraction).

## Current State

### What Exists

1. **Pattern Functions** (`FoodRecipe({...})`, etc.)
   - Return Cell-wrapped reactive outputs
   - NOT persistent charms
   - Don't survive page reloads
   - Meant for reactive composition, not storage

2. **`navigateTo(charm)`**
   - Takes a charm reference and navigates to it
   - Returns boolean indicating success
   - **Side effect**: May persist the charm during navigation
   - **Problem**: Always navigates away, returns boolean not charm reference

3. **ct-code-editor Component**
   - Can create charms when user types `[[New Page]]`
   - Internal implementation not exposed to pattern developers
   - Passes created charm to `onbacklink-create` handler

### What's Missing

**`createCharm(pattern, inputs)` or similar** - A function that:
- Instantiates a pattern with given inputs
- Persists it to storage
- Returns a reference that can be added to arrays
- **Does NOT navigate** to the created charm
- Allows batch creation of multiple charms

## Use Case: Meal Orchestrator LLM Recipe Linking

### Goal
Allow users to paste free-form meal planning notes like:
```
Let's make dinner for 6:
- Roast chicken
- Caesar salad
- Apple pie from Costco
```

Then have an LLM:
1. Extract food items from text
2. Match against existing recipe/prepared-food charms
3. **Create stub charms for unmatched items**
4. Add both matched and newly-created charms to the meal

### Problem
Step 3 (creating stub charms) is not possible without navigation:

```typescript
// ❌ This doesn't work - returns Cells, not persistent charms
const newCharm = FoodRecipe({
  name: "Roast Chicken",
  servings: 6,
  // ...
});
recipeMentioned.set([...currentRecipes, newCharm]); // newCharm is Cell-wrapped

// ❌ This doesn't work - navigates away and returns boolean
const success = navigateTo(FoodRecipe({ name: "Roast Chicken", ... }));
recipeMentioned.set([...currentRecipes, ???]); // No charm reference!

// ✅ This is what we need
const newCharmRef = createCharm(FoodRecipe, {
  name: "Roast Chicken",
  servings: 6,
  // ...
});
recipeMentioned.set([...currentRecipes, newCharmRef]); // Works!
```

### Current Workarounds (All Inadequate)

1. **Skip unmatched items** - Defeats the purpose of AI extraction
2. **Navigate to each charm** - Bad UX, navigates away 4 times for 4 items
3. **Tell user to create manually** - Defeats the purpose of automation

## Observed Behavior

When using `navigateTo()` inside a handler to create charms:
- Items are added to arrays (counts show correctly: "Recipes (3)")
- But references are undefined or incomplete
- UI displays "• servings" instead of charm names
- Items don't persist after page reload

This suggests `navigateTo()` has side effects that create the charm, but the return value (boolean) doesn't give us a usable reference.

## API Design Suggestion

```typescript
// Option 1: Explicit create function
export const createCharm: <I, O>(
  pattern: Pattern<I, O>,
  inputs: I
) => OpaqueRef<O>;

// Usage
const newRecipe = createCharm(FoodRecipe, {
  name: "Roast Chicken",
  servings: 6,
  // ...
});
recipeMentioned.push(newRecipe);

// Option 2: Pattern method
const newRecipe = FoodRecipe.create({
  name: "Roast Chicken",
  // ...
});

// Option 3: navigateTo returns tuple
const [didNavigate, charmRef] = navigateTo(FoodRecipe({ ... }));
if (!didNavigate) {
  recipeMentioned.push(charmRef);
}
```

## Questions for Framework Authors

1. **Is this intentionally not exposed?** If so, why?
2. **Does ct-code-editor use internal APIs we can't access?** Can those be exposed?
3. **Is there a pattern I'm missing?** How should batch charm creation work?
4. **Should `navigateTo()` be split?** One for "create and persist" and one for "navigate to existing"?

## Workaround Attempts

### Attempt 1: Call pattern function and add to array
```typescript
const newRecipe = FoodRecipe({ name: "Roast Chicken", ... });
recipeMentioned.push(newRecipe);
```
**Result**: Items show as undefined, display "• servings" instead of names

### Attempt 2: Call .get() on pattern result
```typescript
const newRecipe = FoodRecipe({ name: "Roast Chicken", ... }).get();
recipeMentioned.push(newRecipe);
```
**Result**: Same issue, objects don't persist

### Attempt 3: Use navigateTo and store return value
```typescript
const ref = navigateTo(FoodRecipe({ name: "Roast Chicken", ... }));
recipeMentioned.push(ref);
```
**Result**: `ref` is boolean, not charm reference

### Attempt 4: Check how note.tsx does it
```typescript
// In note.tsx handleNewBacklink
if (detail.navigate) {
  return navigateTo(detail.charm);
} else {
  mentionable.push(detail.charm as unknown as MentionableCharm);
}
```
**Finding**: The charm is **already created by ct-code-editor**, handler just decides navigation vs adding to array. This doesn't help us create charms programmatically.

## Related Code

- `meal-orchestrator.tsx` lines 318-416 (applyLinking handler)
- `note.tsx` lines 64-84 (handleNewBacklink - receives pre-created charms)
- `page-creator.tsx` lines 78-96 (createFoodRecipe - uses navigateTo)
- `space-setup.tsx` lines 109-136 (LLM tool that creates charms with navigateTo)
- `/Users/alex/Code/labs/packages/runner/src/builtins/navigate-to.ts` (navigateTo implementation)

## Impact

This limitation blocks any pattern that needs to:
- Batch-create charms programmatically
- Create charms in response to AI/LLM extraction
- Create charms without disrupting user's current view
- Implement "create from template" features
- Build wizards that create multiple related charms

## Filed

2025-01-24

## Related Issues

- **CT-1127**: [Feature: Add charmRef to WishState for navigation to wished charms](https://linear.app/common-tools/issue/CT-1127/feature-add-charmref-to-wishstate-for-navigation-to-wished) - Related navigation problem: patterns can't navigate to charms found via `wish()` because wish returns data, not charm identity. Proposed solution adds `charmRef` to WishState.

## Status

Open - Awaiting framework author feedback
