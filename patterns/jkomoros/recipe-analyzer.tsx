/// <cts-enable />
import {
  Default,
  derive,
  generateObject,
  OpaqueRef,
  pattern,
} from "commontools";

interface Ingredient {
  item: string;
  amount: string;
  unit: string;
}

// Food recipe interface (what we expect from food-recipe.tsx)
interface FoodRecipe {
  name: string;
  ingredients: Ingredient[];
  category: string;
  tags: string[];
}

interface RecipeAnalyzerInput {
  // Option 1: Pass a food-recipe reference
  recipe: Default<OpaqueRef<FoodRecipe> | null, null>;

  // Option 2: Or pass fields directly for standalone use
  recipeName: Default<string, "">;
  ingredients: Default<Ingredient[], []>;
  category: Default<string, "">;
  tags: Default<string[], []>;
}

interface RecipeAnalyzerOutput {
  dietaryCompatibility: {
    compatible: string[];
    incompatible: string[];
    warnings: string[];
    primaryIngredients: string[];
  };
}

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

export default pattern<RecipeAnalyzerInput, RecipeAnalyzerOutput>(
  ({ recipe, recipeName, ingredients, category, tags }) => {
    // Derive values from recipe ref OR direct inputs
    const effectiveName = derive(
      { recipe, recipeName },
      ({ recipe: r, recipeName: direct }) => {
        if (r) return r.name;
        return direct;
      },
    );

    const effectiveIngredients = derive(
      { recipe, ingredients },
      ({ recipe: r, ingredients: direct }) => {
        if (r) return r.ingredients;
        return direct;
      },
    );

    const effectiveCategory = derive(
      { recipe, category },
      ({ recipe: r, category: direct }) => {
        if (r) return r.category;
        return direct;
      },
    );

    const effectiveTags = derive(
      { recipe, tags },
      ({ recipe: r, tags: direct }) => {
        if (r) return r.tags;
        return direct;
      },
    );

    // Trigger re-analysis when ingredients change
    const analysisPrompt = derive(
      {
        name: effectiveName,
        ingredients: effectiveIngredients,
        category: effectiveCategory,
        tags: effectiveTags,
      },
      ({ name, ingredients: ings, category: cat, tags: tagList }) => {
        if (!ings || ings.length === 0) {
          return "No ingredients to analyze";
        }

        return `Analyze this recipe for dietary compatibility:

Recipe: ${name || "Untitled"}
Category: ${cat || "other"}
Tags: ${tagList.join(", ") || "none"}

Ingredients:
${ings.map((i) => `- ${i.amount} ${i.unit} ${i.item}`).join("\n")}`;
      },
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
            description: "Dietary tags this recipe IS compatible with",
          },
          incompatible: {
            type: "array",
            items: { type: "string" },
            description: "Dietary tags this recipe is NOT compatible with",
          },
          warnings: {
            type: "array",
            items: { type: "string" },
            description:
              "Human-readable warnings (e.g., 'Contains dairy - not vegan')",
          },
          primaryIngredients: {
            type: "array",
            items: { type: "string" },
            description: "5-10 main ingredients that define the dish",
          },
        },
        required: [
          "compatible",
          "incompatible",
          "warnings",
          "primaryIngredients",
        ],
      },
    });

    const dietaryCompatibility = derive(
      analysis,
      (result) =>
        result || {
          compatible: [],
          incompatible: [],
          warnings: [],
          primaryIngredients: [],
        },
    );

    return {
      dietaryCompatibility,
    };
  },
);
