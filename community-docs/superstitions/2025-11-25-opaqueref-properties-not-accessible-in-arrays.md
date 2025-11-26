# OpaqueRef Properties Not Accessible When Stored in Cell Arrays

> ⚠️ **This is a temporary workaround for a potential framework bug.**
> See issue file: `patterns/jkomoros/issues/ISSUE-OpaqueRef-Properties-Not-Accessible-In-Cell-Arrays.md`

## Summary

When you store OpaqueRefs (results of pattern function calls like `FoodRecipe({...})`) in a Cell array, the OpaqueRef's exported properties (like `.name`, `.servings`, `.category`) are NOT directly accessible in JSX or derive callbacks. The workaround below is a **temporary hack** - the framework should ideally allow property access on OpaqueRefs in array contexts. Store wrapper objects containing both the display data and the charm reference until this is fixed.

## The Problem

```typescript
// Create a charm by calling a pattern function
const newCharm = FoodRecipe({
  name: "Roast Turkey",
  servings: 12,
  category: "main",
  ...
});

// Store it in a Cell array
const recipeMentioned = cell<any[]>([]);
recipeMentioned.push(newCharm);

// BROKEN: Properties are not accessible!
{recipeMentioned.map((recipe) => (
  <div>{recipe.name}</div>  // Shows nothing - recipe.name is undefined!
))}
```

**Debug output showed:**
- `typeof recipe` = "object"
- `Object.keys(recipe)` = `[]` (empty array!)
- `recipe.name` = `undefined`
- `recipe.servings` = `undefined`
- `recipe.category` = `undefined`

## Why This Happens

OpaqueRefs are references/pointers to charms, not the charm data itself. When stored in a Cell array:
1. The OpaqueRef's properties are accessed through the framework's reactivity system
2. When unwrapped via `derive()` or `.map()`, you get a proxy object without enumerable properties
3. Direct property access like `.name` returns `undefined`

## The Solution: Wrapper Objects

Store plain objects containing both the display data AND the OpaqueRef:

```typescript
// In handler when creating charms:
const newCharm = FoodRecipe({
  name: item.normalizedName,
  servings: item.servings || 4,
  category: item.category || "other",
  ...
});

// Store as wrapper with BOTH data and charm reference
const wrapper = {
  charm: newCharm,           // Keep the OpaqueRef for mentionable/linking
  name: item.normalizedName, // Duplicate data for display
  servings: item.servings || 4,
  category: item.category || "other",
  source: item.source || "",
};

recipesToAdd.push(wrapper);

// WORKS: Plain object properties are accessible!
{recipeMentioned.map((item) => (
  <div>
    <div>{item.name}</div>
    <div>{item.category} • {item.servings} servings</div>
  </div>
))}
```

## Complete Example

```typescript
// Handler that creates charms
const applyLinks = handler<...>((...) => {
  const recipesToAdd: any[] = [];

  items.forEach((item) => {
    const newCharm = FoodRecipe({
      name: item.normalizedName,
      servings: item.servings || 4,
      category: item.category || "other",
      // ... other fields
    });

    // Add to mentionable export
    createdCharms.push(newCharm);

    // Store wrapper for display
    recipesToAdd.push({
      charm: newCharm,
      name: item.normalizedName,
      servings: item.servings || 4,
      category: item.category || "other",
    });
  });

  recipeMentioned.set([...recipeMentioned.get(), ...recipesToAdd]);
});

// In JSX
{recipeMentioned.map((item) => (
  <div>
    <strong>{item.name}</strong>
    <span>{item.category} • {item.servings} servings</span>
    <button onClick={removeItem({ items: recipeMentioned, item })}>×</button>
  </div>
))}
```

## Key Points

1. **OpaqueRef = reference, not data** - It's a pointer to a charm, not the charm's contents
2. **Properties not enumerable** - `Object.keys()` returns empty array
3. **Wrapper pattern is the workaround** - Store plain objects with duplicated display data
4. **Keep the OpaqueRef for framework features** - The `.charm` property preserves linking/mentionable functionality

## What Doesn't Work (OpaqueRefs)

```typescript
// BROKEN: Direct property access on OpaqueRef in array - item is a Cell
{recipes.map((recipe) => <div>{recipe.name}</div>)}

// BROKEN: Using [NAME] symbol directly on Cell
{recipes.map((recipe) => <div>{recipe[NAME]}</div>)}
```

## What DOES Work (Wrapper Objects)

If you store **wrapper objects** (not raw OpaqueRefs), you can use `derive()` to unwrap the Cell and access properties:

```typescript
// Store wrappers with display data
recipeMentioned.push({
  charm: newCharm,  // OpaqueRef
  name: "...",      // Display data
  category: "main",
  servings: 4,
});

// WORKS: Use derive() to unwrap Cell and access wrapper properties
{recipeMentioned.map((itemCell) => (
  <div>
    {derive(itemCell, (item) => item?.name || "Untitled")}
    {derive(itemCell, (item) => item?.category ? `${item.category} • ${item.servings}` : "")}
  </div>
))}
```

**Key insight:** `derive()` unwraps Cells to plain values, so wrapper object properties ARE accessible inside derive. But OpaqueRef properties (on the `.charm` field) are still not accessible.

## Metadata

```yaml
topic: OpaqueRef, Cell arrays, charm creation, display, properties
discovered: 2025-11-25
confirmed_count: 1
last_confirmed: 2025-11-25
sessions: [meal-orchestrator-automatic-charm-creation]
related_functions: pattern, cell, OpaqueRef, handler
stars: 4
status: temporary_workaround
issue_file: patterns/jkomoros/issues/ISSUE-OpaqueRef-Properties-Not-Accessible-In-Cell-Arrays.md
```
