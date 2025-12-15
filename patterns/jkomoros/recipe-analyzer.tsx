/// <cts-enable />
import {
  computed,
  Default,
  generateObject,
  pattern,
  UI,
} from "commontools";

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

/** Recipe dietary analyzer. #recipeAnalyzer */
interface RecipeAnalyzerOutput {
  dietaryCompatibility: {
    compatible: string[];
    incompatible: string[];
    warnings: string[];
    primaryIngredients: string[];
  };
  analysisPending: boolean;
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
  ({ recipeName, ingredients, category, tags }) => {
    // Trigger re-analysis when ingredients change
    const analysisPrompt = computed(() => {
      if (!ingredients || ingredients.length === 0) {
        return "No ingredients to analyze";
      }

      return `Analyze this recipe for dietary compatibility:

Recipe: ${recipeName || "Untitled"}
Category: ${category || "other"}
Tags: ${tags.join(", ") || "none"}

Ingredients:
${ingredients.map((i) => `- ${i.amount} ${i.unit} ${i.item}`).join("\n")}`;
    });

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

    const dietaryCompatibility = computed(() =>
      analysis || {
        compatible: [],
        incompatible: [],
        warnings: [],
        primaryIngredients: [],
      }
    );

    return {
      [UI]: (
        <div style={{ padding: "8px" }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Dietary Analysis</h4>
          {computed(() => {
            const dc = dietaryCompatibility;
            if (dc.compatible.length === 0 && dc.incompatible.length === 0) {
              return <div style={{ fontStyle: "italic", color: "#666" }}>
                Add ingredients to see dietary analysis
              </div>;
            }

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {dc.compatible.length > 0 && (
                  <div>
                    <div style={{ fontWeight: "600", color: "#059669", marginBottom: "4px" }}>
                      ✓ Compatible:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {dc.compatible.map((tag: string) => (
                        <span style={{
                          padding: "2px 8px",
                          background: "#d1fae5",
                          borderRadius: "12px",
                          fontSize: "12px",
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {dc.warnings.length > 0 && (
                  <div>
                    <div style={{ fontWeight: "600", color: "#dc2626", marginBottom: "4px" }}>
                      ⚠️ Warnings:
                    </div>
                    <ul style={{ margin: "0", paddingLeft: "20px", fontSize: "13px" }}>
                      {dc.warnings.map((warning: string) => (
                        <li>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {dc.primaryIngredients.length > 0 && (
                  <div>
                    <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                      Main Ingredients:
                    </div>
                    <div style={{ fontSize: "13px", color: "#666" }}>
                      {dc.primaryIngredients.join(", ")}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ),
      dietaryCompatibility,
      analysisPending: pending,
    };
  },
);
