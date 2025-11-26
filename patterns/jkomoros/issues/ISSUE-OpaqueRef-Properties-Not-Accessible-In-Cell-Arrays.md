# Issue: OpaqueRef Properties Not Accessible When Stored in Cell Arrays

## Summary

When OpaqueRefs (results of pattern function calls) are stored in a Cell array, their exported properties are not accessible in JSX `.map()` contexts. Direct property access returns `undefined` and `Object.keys()` returns an empty array.

## Expected Behavior

```typescript
const newCharm = FoodRecipe({
  name: "Roast Turkey",
  servings: 12,
  category: "main",
});

const recipes = cell<any[]>([]);
recipes.push(newCharm);

// Expected: Should display "Roast Turkey"
{recipes.map((recipe) => <div>{recipe.name}</div>)}
```

## Actual Behavior

- `recipe.name` returns `undefined`
- `recipe.servings` returns `undefined`
- `recipe.category` returns `undefined`
- `Object.keys(recipe)` returns `[]` (empty array)
- `typeof recipe` returns `"object"`

The OpaqueRef exists and works for other purposes (mentionable export), but its properties are inaccessible.

## Reproduction Steps

1. Create a pattern that calls another pattern function to get an OpaqueRef
2. Store that OpaqueRef in a `cell<any[]>([])`
3. Try to access properties in JSX via `.map()`

```typescript
// In a handler:
const newCharm = FoodRecipe({
  name: item.name,
  servings: item.servings,
  category: item.category,
  // ...
});

createdCharms.push(newCharm);  // Works for mentionable
recipeMentioned.push(newCharm);  // Store for display

// In JSX - BROKEN:
{recipeMentioned.map((recipe) => (
  <div>
    <div>{recipe.name}</div>  {/* Shows nothing */}
    <div>{recipe.category} • {recipe.servings} servings</div>  {/* Shows "• servings" */}
  </div>
))}
```

## Debug Output

Added debug code to inspect the object:

```typescript
{recipeMentioned.map((recipe) => (
  <div>
    Type: {typeof recipe} | Keys: {derive(recipe, (r) => JSON.stringify(Object.keys(r || {})))}
  </div>
))}
```

**Result:** `Type: object | Keys: []`

```typescript
{derive(recipe, (r) => `name=${r?.name} | servings=${r?.servings} | category=${r?.category}`)}
```

**Result:** `name=undefined | servings=undefined | category=undefined`

## What Works vs What Doesn't

### Works:
- Creating the OpaqueRef via pattern function call
- Pushing to `createdCharms` for mentionable export
- The charm appears in `[[` autocomplete after page refresh
- Navigating to the created charm shows correct data

### Doesn't Work:
- Accessing `.name`, `.servings`, `.category` on the OpaqueRef in `.map()`
- Using `derive(recipe, (r) => r.name)`
- Using `recipe[NAME]` symbol access

## Current Workaround

Store wrapper objects with duplicated display data:

```typescript
const wrapper = {
  charm: newCharm,           // Keep OpaqueRef for framework features
  name: item.name,           // Duplicate for display
  servings: item.servings,
  category: item.category,
};
recipeMentioned.push(wrapper);

// Then access wrapper properties
{recipeMentioned.map((item) => <div>{item.name}</div>)}  // Works
```

This is a hack that:
- Duplicates data
- Can get out of sync if charm data changes
- Adds boilerplate that shouldn't be necessary

## Environment

- Pattern: meal-orchestrator.tsx
- Framework: CommonTools (labs repo)
- Date: 2025-11-25

## Questions for Framework Authors

1. Is this expected behavior or a bug?
2. Is there a correct way to access OpaqueRef properties when stored in Cell arrays?
3. Should OpaqueRefs in arrays be auto-unwrapped differently?
