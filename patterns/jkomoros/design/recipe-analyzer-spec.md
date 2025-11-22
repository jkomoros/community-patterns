# Recipe Analyzer Pattern Specification

**Purpose:** Reusable pattern for analyzing recipe dietary compatibility

**Used By:** food-recipe.tsx (embedded), potentially other patterns

---

## Pattern Interface

```typescript
interface Ingredient {
  item: string;
  amount: string;
  unit: string;
}

interface RecipeAnalyzerInput {
  recipeName: Default<string, "">;
  ingredients: Default<Ingredient[], []>;
  category: Default<string, "">;
  tags: Default<string[], []>;
}

interface RecipeAnalyzerOutput {
  dietaryCompatibility: {
    compatible: string[];           // Tags this recipe IS compatible with
    incompatible: string[];         // Tags this recipe is NOT compatible with
    warnings: string[];             // Human-readable warnings
    primaryIngredients: string[];   // 5-10 main ingredients for "no-X" matching
  };
}
```

---

## Standard Dietary Tags

The analyzer should recognize these standard tags:

```typescript
const STANDARD_DIETARY_TAGS = {
  // Allergies & Intolerances
  allergies: [
    "nut-free",           // All nuts
    "peanut-free",        // Peanuts specifically
    "tree-nut-free",      // Almonds, cashews, walnuts, etc.
    "shellfish-free",     // Shrimp, crab, lobster
    "fish-free",          // All fish
    "dairy-free",         // Milk, cheese, butter, cream
    "lactose-free",       // Dairy but lactose removed
    "egg-free",           // Eggs and egg products
    "soy-free",           // Soybeans, tofu, soy sauce
    "gluten-free",        // Wheat, barley, rye
    "nightshade-free"     // Tomatoes, peppers, potatoes, eggplant
  ],

  // Lifestyle & Ethics
  lifestyle: [
    "vegan",              // No animal products at all
    "vegetarian",         // No meat, but dairy/eggs OK
    "pescatarian",        // No meat except fish
    "kosher",             // Jewish dietary laws
    "halal",              // Islamic dietary laws
    "pork-free",          // No pork
    "beef-free",          // No beef
    "lamb-free"           // No lamb
  ],

  // Health Conditions
  health: [
    "diabetic-friendly",  // Low sugar, controlled carbs
    "low-sugar",          // Minimal added sugar
    "low-sodium",         // Reduced salt
    "heart-healthy",      // Low saturated fat, cholesterol
    "kidney-friendly",    // Low potassium, phosphorus, protein
    "low-FODMAP",         // IBS-friendly, no fermentable carbs
    "keto",               // Very low carb, high fat
    "low-carb"            // Reduced carbohydrates
  ]
};
```

---

## LLM Analysis Prompt

```typescript
const SYSTEM_PROMPT = `You are a dietary compatibility analyzer for recipes.

Analyze recipe ingredients and determine which dietary requirements the recipe meets or violates.

DIETARY TAGS TO CHECK:
Allergies: nut-free, peanut-free, tree-nut-free, shellfish-free, fish-free,
           dairy-free, lactose-free, egg-free, soy-free, gluten-free, nightshade-free

Lifestyle: vegan, vegetarian, pescatarian, kosher, halal,
           pork-free, beef-free, lamb-free

Health: diabetic-friendly, low-sugar, low-sodium, heart-healthy,
        kidney-friendly, low-FODMAP, keto, low-carb

IMPORTANT RULES:
• "vegan" is stricter than "vegetarian" (no animal products whatsoever)
• "gluten-free" means NO wheat, barley, rye, or derivatives (including soy sauce!)
• "nut-free" includes all tree nuts AND peanuts
• "nightshade-free" means no tomatoes, peppers, potatoes, eggplant
• "kosher" and "halal" have specific meat preparation requirements - be conservative
• If unsure about a tag, mark as incompatible and add a warning
• Be thorough - check all ingredient derivatives (e.g., butter contains dairy)

PRIMARY INGREDIENTS:
List 5-10 main ingredients that define the dish. Focus on:
- Proteins (chicken, beef, fish, tofu, beans)
- Main vegetables/starches (potatoes, rice, tomatoes, onions)
- Key flavor ingredients (garlic, cilantro, mushrooms)

These are used for custom "no-X" matching (e.g., "no-mushrooms", "no-cilantro").`;
```

---

## Implementation

### Pattern Structure

```typescript
import {
  Default,
  derive,
  generateObject,
  pattern
} from "commontools";

export default pattern<RecipeAnalyzerInput, RecipeAnalyzerOutput>(
  ({ recipeName, ingredients, category, tags }) => {

    // Trigger re-analysis when ingredients change
    const analysisPrompt = derive(
      [recipeName, ingredients, category, tags],
      ([name, ings, cat, tags]) => {
        if (!ings || ings.length === 0) {
          return "No ingredients to analyze";
        }

        return `Analyze this recipe for dietary compatibility:

Recipe: ${name || "Untitled"}
Category: ${cat || "other"}
Tags: ${tags.join(", ") || "none"}

Ingredients:
${ings.map(i => `- ${i.amount} ${i.unit} ${i.item}`).join('\n')}`;
      }
    );

    const { result: analysis, pending } = generateObject({
      system: SYSTEM_PROMPT,
      prompt: analysisPrompt,
      model: "anthropic:claude-sonnet-4-5",
      schema: {
        type: "object",
        properties: {
          compatible: {
            type: "array",
            items: { type: "string" },
            description: "Dietary tags this recipe IS compatible with"
          },
          incompatible: {
            type: "array",
            items: { type: "string" },
            description: "Dietary tags this recipe is NOT compatible with"
          },
          warnings: {
            type: "array",
            items: { type: "string" },
            description: "Human-readable warnings (e.g., 'Contains dairy - not vegan')"
          },
          primaryIngredients: {
            type: "array",
            items: { type: "string" },
            description: "5-10 main ingredients that define the dish"
          }
        },
        required: ["compatible", "incompatible", "warnings", "primaryIngredients"]
      }
    });

    const dietaryCompatibility = derive(
      analysis,
      (result) => result || {
        compatible: [],
        incompatible: [],
        warnings: [],
        primaryIngredients: []
      }
    );

    return {
      dietaryCompatibility
    };
  }
);
```

---

## Integration with food-recipe.tsx

```typescript
// In food-recipe.tsx
import recipeAnalyzer from "./recipe-analyzer.tsx";

export default pattern<RecipeInput, RecipeOutput>(
  ({ name, ingredients, category, tags, /* ... other inputs */ }) => {

    // Embed recipe analyzer
    const analyzer = recipeAnalyzer({
      recipeName: name,
      ingredients,
      category,
      tags
    });

    // ... rest of food-recipe logic ...

    return {
      [NAME]: str`🍳 ${displayName}`,
      [UI]: ( /* ... */ ),

      // All existing outputs
      name,
      ingredients,
      stepGroups,
      // ...

      // NEW: Export dietary analysis
      dietaryCompatibility: analyzer.dietaryCompatibility
    };
  }
);
```

---

## Testing Examples

### Example 1: Simple Vegan Recipe

**Input:**
```typescript
{
  recipeName: "Tomato Basil Pasta",
  ingredients: [
    { item: "pasta", amount: "1", unit: "lb" },
    { item: "tomatoes", amount: "4", unit: "piece" },
    { item: "basil", amount: "1/4", unit: "cup" },
    { item: "olive oil", amount: "2", unit: "tbsp" }
  ],
  category: "main",
  tags: []
}
```

**Expected Output:**
```typescript
{
  compatible: [
    "vegan", "vegetarian", "dairy-free", "egg-free",
    "nut-free", "soy-free", "kosher", "halal"
  ],
  incompatible: [
    "gluten-free", "nightshade-free", "keto", "low-carb"
  ],
  warnings: [
    "Contains gluten (pasta)",
    "Contains nightshades (tomatoes)"
  ],
  primaryIngredients: ["pasta", "tomatoes", "basil", "olive oil"]
}
```

### Example 2: Complex Allergy Case

**Input:**
```typescript
{
  recipeName: "Thai Peanut Chicken",
  ingredients: [
    { item: "chicken breast", amount: "1", unit: "lb" },
    { item: "peanut butter", amount: "1/4", unit: "cup" },
    { item: "soy sauce", amount: "2", unit: "tbsp" },
    { item: "bell peppers", amount: "2", unit: "piece" }
  ],
  category: "main",
  tags: []
}
```

**Expected Output:**
```typescript
{
  compatible: [
    "dairy-free", "egg-free"
  ],
  incompatible: [
    "vegan", "vegetarian", "nut-free", "peanut-free",
    "soy-free", "gluten-free", "nightshade-free"
  ],
  warnings: [
    "Contains peanuts - severe allergy risk",
    "Contains soy (soy sauce)",
    "Contains gluten (soy sauce)",
    "Contains nightshades (bell peppers)"
  ],
  primaryIngredients: [
    "chicken", "peanut butter", "soy sauce", "bell peppers"
  ]
}
```

---

## Performance Considerations

- Analysis triggers on ingredient changes (via `derive`)
- LLM call is async - shows pending state
- Results cached until inputs change
- For large ingredient lists (15+), response may take 2-3 seconds

---

## Future Enhancements

1. **Confidence scores**: Rate certainty of each compatibility tag
2. **Substitution suggestions**: "Replace butter with olive oil for dairy-free"
3. **Cross-contamination warnings**: "May be prepared on shared equipment"
4. **Nutrition estimates**: Calories, macros (separate concern)
5. **Cultural/regional tags**: "Asian", "Mediterranean", "Southern"

---

**End of Specification**
