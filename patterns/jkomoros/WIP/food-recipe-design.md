# Food Recipe Pattern - Design Document

## Overview

A structured recipe pattern that captures cooking recipes with both structured data fields and free-form notes. Inspired by the person.tsx pattern, this will support gradual structuring - starting with free-form text that can be extracted into structured fields via LLM, and supporting @mentions for linking to other charms (ingredients from shopping lists, related recipes, etc.).

## Goals

1. **Structured Data Capture**: Core recipe information in queryable, structured fields
2. **Flexible Input**: Support both structured entry and free-form paste-and-extract workflows
3. **Linkable**: Support @mentions to connect recipes with ingredients, shopping lists, and other charms
4. **Queryable**: Enable omnibot to find, query, and modify recipes via patternTool exports
5. **Gradual Enhancement**: Start simple, add more structure over time (nutrition, photos, ratings, etc.)

## Core Features - Phase 1 (MVP)

### Structured Fields

**Basic Info:**
- `name` (string) - Recipe title
- `cuisine` (string) - e.g., "Italian", "Thai", "Mexican"
- `servings` (number) - Number of servings
- `difficulty` ("easy" | "medium" | "hard")
- `tags` (string[]) - e.g., ["vegetarian", "quick", "dessert"]

**Ingredients:**
- Array of ingredient objects with:
  - `item` (string) - Ingredient name (could @mention a charm)
  - `amount` (string) - Quantity
  - `unit` (string) - Measurement unit

**Instructions:**
- Array of step objects with:
  - `order` (number) - Step number
  - `description` (string) - Step instructions
  - `duration` (number, optional) - Time in minutes for this step

**Time:**
- `prepTime` (number) - Prep time in minutes
- `cookTime` (number) - Cook time in minutes
- Computed: `totalTime` = prepTime + cookTime

**Unstructured:**
- `notes` (string, markdown) - Free-form notes with @mention support
- `source` (string) - Where the recipe came from (URL, book, person)

### UI Design

**Two-Pane Layout** (following person.tsx pattern):
- **Left Pane (Details)** - Structured fields in tabs:
  - **Info Tab**: Name, cuisine, servings, difficulty, times, tags
  - **Ingredients Tab**: List of ingredients with add/remove/reorder
  - **Instructions Tab**: Ordered steps with add/remove/reorder

- **Right Pane (Notes & Source)** - Unstructured content:
  - Code editor for notes (markdown, @mention support)
  - Source field
  - Extract button to populate structured fields from notes

**Computed Values:**
- Total time (prep + cook)
- Ingredient count
- Step count
- Difficulty icon/badge

### LLM Integration

**Extract Recipe Data** (triggered by user action):
- System prompt: "You are a recipe extraction assistant. Parse unstructured recipe text into structured fields."
- Input: Content from notes field
- Output schema: Recipe data matching our TypeScript types
- UI: Show extraction results in modal with "Apply" button (like person.tsx)

**Future Enhancement Ideas:**
- Auto-suggest tags based on ingredients and cuisine
- Generate shopping list from ingredients
- Scale recipe (adjust ingredient amounts)
- Suggest substitutions for ingredients

### Omnibot Integration (patternTool exports)

**Queryable Operations:**
```typescript
export const patternTool = {
  create: (recipeName: string, cuisine?: string) => { /* Create new recipe */ },
  find: (query: string) => { /* Search recipes by name, cuisine, tags */ },
  addIngredient: (recipeId: string, ingredient: Ingredient) => { /* Add ingredient */ },
  updateField: (recipeId: string, field: string, value: any) => { /* Update any field */ },
  export: (recipeId: string) => { /* Export recipe as formatted text */ }
};
```

## Data Model

```typescript
type RecipeData = {
  // Basic info
  name: Default<string, "">;
  cuisine: Default<string, "">;
  servings: Default<number, 4>;
  difficulty: Default<"easy" | "medium" | "hard", "medium">;
  tags: Default<string[], []>;

  // Time
  prepTime: Default<number, 0>;  // minutes
  cookTime: Default<number, 0>;  // minutes

  // Structured arrays
  ingredients: Default<Ingredient[], []>;
  steps: Default<RecipeStep[], []>;

  // Unstructured
  notes: Default<string, "">;
  source: Default<string, "">;
};

type Ingredient = {
  id: string;  // UUID for stable keying
  item: string;
  amount: string;
  unit: string;
};

type RecipeStep = {
  id: string;  // UUID for stable keying
  order: number;
  description: string;
  duration?: number;  // minutes, optional
};
```

## Handlers (State Mutations)

```typescript
// Basic field updates
updateName: handler<string, RecipeData>
updateCuisine: handler<string, RecipeData>
updateServings: handler<number, RecipeData>
updateDifficulty: handler<"easy" | "medium" | "hard", RecipeData>
updateTimes: handler<{ prep: number; cook: number }, RecipeData>

// Array operations
addIngredient: handler<Ingredient, RecipeData>
updateIngredient: handler<{ id: string; field: string; value: any }, RecipeData>
removeIngredient: handler<string, RecipeData>  // by id
reorderIngredients: handler<string[], RecipeData>  // array of ids

addStep: handler<RecipeStep, RecipeData>
updateStep: handler<{ id: string; field: string; value: any }, RecipeData>
removeStep: handler<string, RecipeData>  // by id
reorderSteps: handler<string[], RecipeData>  // array of ids

// Tags
addTag: handler<string, RecipeData>
removeTag: handler<string, RecipeData>

// Notes
updateNotes: handler<string, RecipeData>
updateSource: handler<string, RecipeData>

// LLM extraction
triggerExtraction: handler<void, RecipeData>
applyExtraction: handler<ExtractedRecipe, RecipeData>
```

## Implementation Phases

### Phase 1: Basic Structure (This PR)
- [ ] Core data model with TypeScript types
- [ ] Basic UI with two-pane layout
- [ ] Manual entry of structured fields
- [ ] Notes field with ct-code-editor
- [ ] Basic handlers for add/remove/update operations
- [ ] Computed values (total time, counts)

### Phase 2: LLM Extraction (Follow-up)
- [ ] Extract recipe data from pasted text
- [ ] Modal showing extraction results
- [ ] Apply/cancel extraction workflow
- [ ] Diff visualization for changes

### Phase 3: Omnibot Integration (Follow-up)
- [ ] patternTool exports for create/find/update
- [ ] Search/filter functionality
- [ ] Bulk operations

### Phase 4: Enhancements (Future)
- [ ] Photo upload (photoUrl field)
- [ ] Nutrition info (calories, protein, etc.)
- [ ] Ratings and reviews
- [ ] Recipe scaling (multiply ingredient amounts)
- [ ] Shopping list export
- [ ] Print-friendly view
- [ ] Recipe collections/cookbooks
- [ ] Sharing/export formats (PDF, Markdown)

## Questions for Alex

1. **Scope for Phase 1**: Should we include LLM extraction in the first version, or start with just manual entry?

2. **Ingredient Linking**: Do you want ingredients to be just strings, or should they support @mentioning other charms (e.g., linking to a shopping list item or ingredient definition)?

3. **Instruction Steps**: Should steps support rich text/markdown, or just plain text strings?

4. **Units**: Should we have a predefined list of units (tsp, tbsp, cup, oz, g, etc.) or free-form strings?

5. **Tags vs Categories**: Should we have both tags (free-form) and categories (predefined like "Main Course", "Dessert", "Appetizer")?

6. **Recipe Collections**: Do you want the ability to group recipes into collections/cookbooks from the start, or add that later?

7. **Testing Priority**: What's most important to test with Playwright first - the manual entry workflow or the extraction workflow?

## Technical Notes

- Follow person.tsx pattern for structured fields + notes
- Use ct-code-editor for markdown notes with @mention support
- Use ct-autolayout for responsive two-pane design
- Use handlers for all state mutations (no direct cell.set() in UI)
- Use derive() for all computed values
- Keep extraction logic similar to person.tsx for consistency
- Add patternTool exports for omnibot discoverability

## Success Criteria

**Phase 1 Complete When:**
1. Can create a new recipe charm
2. Can enter name, cuisine, servings, difficulty, times manually
3. Can add/remove/reorder ingredients with amount/unit
4. Can add/remove/reorder instruction steps
5. Can add free-form notes with markdown
6. Can add/remove tags
7. Total time computed correctly
8. Recipe displays cleanly in both desktop and mobile views
9. Compiles without TypeScript errors
10. Tested working in Playwright (claude-food-recipe space)

## File Location

`/Users/alex/Code/recipes/.worktrees/alex/food-recipe/recipes/alex/WIP/food-recipe.tsx`
