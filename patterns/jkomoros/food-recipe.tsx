/// <cts-enable />
import {
  cell,
  Cell,
  Default,
  derive,
  generateObject,
  handler,
  ifElse,
  NAME,
  navigateTo,
  type Opaque,
  OpaqueRef,
  patternTool,
  pattern,
  str,
  UI,
  wish,
} from "commontools";
import { type MentionableCharm } from "./lib/backlinks-index.tsx";
import { compareFields, computeWordDiff } from "./utils/diff-utils.tsx";

// Predefined units for ingredients
const UNITS = [
  "tsp",
  "tbsp",
  "cup",
  "oz",
  "lb",
  "g",
  "kg",
  "ml",
  "l",
  "piece",
  "pinch",
  "to taste",
] as const;

const UNIT_ITEMS = UNITS.map((unit) => ({
  label: unit,
  value: unit,
}));

interface Ingredient {
  item: string;
  amount: string;
  unit: string;
}

interface RecipeStep {
  order: number;
  description: string;
  duration?: number; // minutes
}

interface RecipeInput {
  name: Default<string, "">;
  cuisine: Default<string, "">;
  servings: Default<number, 4>;
  yield: Default<string, "">; // What the recipe makes (e.g., "12 cookies", "1 loaf")
  difficulty: Default<"easy" | "medium" | "hard", "medium">;
  prepTime: Default<number, 0>; // minutes
  cookTime: Default<number, 0>; // minutes
  ingredients: Default<Ingredient[], []>;
  steps: Default<RecipeStep[], []>;
  tags: Default<string[], []>;
  notes: Default<string, "">;
  source: Default<string, "">;
}

interface RecipeOutput extends RecipeInput {}

// Handler for charm link clicks
const handleCharmLinkClick = handler<
  {
    detail: {
      charm: Cell<MentionableCharm>;
    };
  },
  Record<string, never>
>(({ detail }, _) => {
  return navigateTo(detail.charm);
});

// Handler for new backlinks
const handleNewBacklink = handler<
  {
    detail: {
      text: string;
      charmId: any;
      charm: Cell<MentionableCharm>;
      navigate: boolean;
    };
  },
  {
    mentionable: Cell<MentionableCharm[]>;
  }
>(({ detail }, { mentionable }) => {
  console.log("new charm", detail.text, detail.charmId);

  if (detail.navigate) {
    return navigateTo(detail.charm);
  } else {
    mentionable.push(detail.charm as unknown as MentionableCharm);
  }
});

// Helper function to create schemaified wish
function schemaifyWish<T>(path: string, def: T) {
  return derive(wish<T>(path) as T, (i) => i ?? def);
}

// Ingredient handlers
const addIngredient = handler<unknown, { ingredients: Cell<Ingredient[]> }>(
  (_event, { ingredients }) => {
    ingredients.push({
      item: "",
      amount: "",
      unit: "cup",
    });
  },
);

const removeIngredient = handler<
  unknown,
  {
    ingredients: Cell<Array<Cell<Ingredient>>>;
    ingredient: Cell<Ingredient>;
  }
>((_event, { ingredients, ingredient }) => {
  const currentIngredients = ingredients.get();
  const index = currentIngredients.findIndex((el) => ingredient.equals(el));
  if (index >= 0) {
    ingredients.set(currentIngredients.toSpliced(index, 1));
  }
});

// Step handlers
const addStep = handler<unknown, { steps: Cell<RecipeStep[]> }>(
  (_event, { steps }) => {
    const currentSteps = steps.get();
    steps.push({
      order: currentSteps.length + 1,
      description: "",
    });
  },
);

const removeStep = handler<
  unknown,
  { steps: Cell<Array<Cell<RecipeStep>>>; step: Cell<RecipeStep> }
>((_event, { steps, step }) => {
  const currentSteps = steps.get();
  const index = currentSteps.findIndex((el) => step.equals(el));
  if (index >= 0) {
    steps.set(currentSteps.toSpliced(index, 1));
  }
});

// Tag handlers
const addTag = handler<
  { detail: { message: string } },
  { tags: Cell<string[]> }
>(({ detail }, { tags }) => {
  const tagName = detail?.message?.trim();
  if (!tagName) return;

  const currentTags = tags.get();
  if (!currentTags.includes(tagName)) {
    tags.push(tagName);
  }
});

const removeTag = handler<
  unknown,
  { tags: Cell<Array<Cell<string>>>; tag: Cell<string> }
>((_event, { tags, tag }) => {
  const currentTags = tags.get();
  const index = currentTags.findIndex((el) => tag.equals(el));
  if (index >= 0) {
    tags.set(currentTags.toSpliced(index, 1));
  }
});

// Scaling handlers
const scaleRecipe = handler<
  unknown,
  {
    servings: Cell<number>;
    ingredients: Cell<Array<Cell<Ingredient>>>;
    scaleFactor: number;
  }
>((_event, { servings, ingredients, scaleFactor }) => {
  // Scale servings
  const currentServings = servings.get();
  servings.set(Math.round(currentServings * scaleFactor));

  // Scale ingredient amounts
  const currentIngredients = ingredients.get();
  currentIngredients.forEach((ingredient) => {
    const ing = ingredient.get();
    const amount = ing.amount;

    // Try to parse and scale numeric amounts
    const numMatch = amount.match(/^(\d+\.?\d*)/);
    if (numMatch) {
      const num = parseFloat(numMatch[1]);
      const scaled = num * scaleFactor;
      const rest = amount.substring(numMatch[0].length);

      // Format nicely (e.g., 0.5 -> 1/2)
      let scaledStr: string;
      if (scaled === 0.25) scaledStr = "1/4";
      else if (scaled === 0.33 || scaled === 0.333) scaledStr = "1/3";
      else if (scaled === 0.5) scaledStr = "1/2";
      else if (scaled === 0.66 || scaled === 0.667) scaledStr = "2/3";
      else if (scaled === 0.75) scaledStr = "3/4";
      else if (scaled % 1 === 0) scaledStr = String(Math.round(scaled));
      else scaledStr = scaled.toFixed(2);

      ingredient.set({ ...ing, amount: scaledStr + rest });
    }
  });
});

// LLM Extraction Handlers
const triggerExtraction = handler<
  Record<string, never>,
  { notes: string; extractTrigger: Cell<string> }
>(
  (_, { notes, extractTrigger }) => {
    extractTrigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);
  },
);

const cancelExtraction = handler<
  Record<string, never>,
  { extractedData: Cell<any> }
>(
  (_, { extractedData }) => {
    extractedData.set(null);
  },
);

const applyExtractedData = handler<
  Record<string, never>,
  {
    extractedData: Cell<any>;
    name: Cell<string>;
    cuisine: Cell<string>;
    servings: Cell<number>;
    difficulty: Cell<"easy" | "medium" | "hard">;
    prepTime: Cell<number>;
    cookTime: Cell<number>;
    ingredients: Cell<Ingredient[]>;
    steps: Cell<RecipeStep[]>;
    tags: Cell<string[]>;
    source: Cell<string>;
    notes: Cell<string>;
  }
>(
  (
    _,
    {
      extractedData,
      name,
      cuisine,
      servings,
      difficulty,
      prepTime,
      cookTime,
      ingredients,
      steps,
      tags,
      source,
      notes,
    },
  ) => {
    const data = extractedData.get();
    if (!data) return;

    if (data.name) name.set(data.name);
    if (data.cuisine) cuisine.set(data.cuisine);
    if (data.servings) servings.set(data.servings);
    if (data.difficulty) difficulty.set(data.difficulty);
    if (data.prepTime) prepTime.set(data.prepTime);
    if (data.cookTime) cookTime.set(data.cookTime);
    if (data.source) source.set(data.source);

    // Apply ingredients - use .push() which auto-wraps in cells
    if (data.ingredients && Array.isArray(data.ingredients)) {
      const currentLength = ingredients.get().length;
      const nextOrder = currentLength + 1;
      data.ingredients.forEach((ing: any) => {
        ingredients.push({
          item: ing.item || "",
          amount: ing.amount || "",
          unit: ing.unit || "cup",
        });
      });
    }

    // Apply steps - use .push() which auto-wraps in cells
    if (data.steps && Array.isArray(data.steps)) {
      const currentLength = steps.get().length;
      const nextOrder = currentLength + 1;
      data.steps.forEach((step: any, idx: number) => {
        steps.push({
          order: nextOrder + idx,
          description: step.description || step,
          duration: step.duration,
        });
      });
    }

    // Apply tags - use .push() which auto-wraps in cells
    if (data.tags && Array.isArray(data.tags)) {
      const currentTags = tags.get();
      data.tags.forEach((tag: string) => {
        if (!currentTags.includes(tag)) {
          tags.push(tag);
        }
      });
    }

    // Update notes with remaining content after extraction
    if (data.remainingNotes !== undefined) {
      notes.set(data.remainingNotes);
    }

    // Clear extraction result
    extractedData.set(null);
  },
);

export default pattern<RecipeInput, RecipeOutput>(
  ({
    name,
    cuisine,
    servings,
    yield: recipeYield,
    difficulty,
    prepTime,
    cookTime,
    ingredients,
    steps,
    tags,
    notes,
    source,
  }) => {
    // Set up mentionable charms for @ references
    const mentionable = schemaifyWish<MentionableCharm[]>(
      "#mentionable",
      [],
    );
    const mentioned = cell<MentionableCharm[]>([]);

    // Computed values
    const totalTime = derive(
      [prepTime, cookTime],
      ([prep, cook]) => prep + cook,
    );

    const ingredientCount = derive(ingredients, (list) => list.length);
    const stepCount = derive(steps, (list) => list.length);
    const hasIngredients = derive(ingredientCount, (count) => count > 0);
    const hasSteps = derive(stepCount, (count) => count > 0);
    const hasTags = derive(tags, (list) => list.length > 0);

    const displayName = derive(
      name,
      (n) => n.trim() || "Untitled Recipe",
    );

    // Derive ingredient list text for copying
    const ingredientListText = derive(ingredients, (list) =>
      list.map((ing) => `${ing.amount} ${ing.unit} ${ing.item}`).join("\n"),
    );

    // LLM Extraction state
    const extractTrigger = cell<string>("");

    const { result: extractionResult, pending: extractionPending } =
      generateObject({
        system:
          `You are a recipe extraction assistant. Extract structured recipe information from unstructured text.

Extract the following fields if present:
- name: Recipe title
- cuisine: Type of cuisine (e.g., "Italian", "Thai", "Mexican")
- servings: Number of servings (as a number)
- difficulty: One of "easy", "medium", or "hard"
- prepTime: Preparation time in minutes (as a number)
- cookTime: Cooking time in minutes (as a number)
- source: Where the recipe came from (URL, book, person)
- ingredients: Array of objects with {item, amount, unit}. Parse amounts and units separately.
- steps: Array of instruction steps. Each can be a string or {description, duration} if time is mentioned.
- tags: Array of relevant tags (e.g., ["vegetarian", "quick", "dessert"])
- remainingNotes: Any text from the notes that was NOT extracted into structured fields (e.g., personal comments, modifications, tips). If everything was extracted, return an empty string.

Return only the fields you can confidently extract. Be thorough with ingredients and steps. For remainingNotes, preserve any content that doesn't fit into the structured fields.`,
        prompt: extractTrigger,
        model: "anthropic:claude-sonnet-4-5",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            cuisine: { type: "string" },
            servings: { type: "number" },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            prepTime: { type: "number" },
            cookTime: { type: "number" },
            source: { type: "string" },
            ingredients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  item: { type: "string" },
                  amount: { type: "string" },
                  unit: { type: "string" },
                },
              },
            },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  duration: { type: "number" },
                },
              },
            },
            tags: {
              type: "array",
              items: { type: "string" },
            },
            remainingNotes: { type: "string" },
          },
        },
      });

    // Derive changes preview comparing extracted data to current values
    const changesPreview = derive(
      {
        extractionResult,
        name,
        cuisine,
        servings,
        difficulty,
        prepTime,
        cookTime,
        source,
        notes,
      },
      ({
        extractionResult: result,
        name: currentName,
        cuisine: currentCuisine,
        servings: currentServings,
        difficulty: currentDifficulty,
        prepTime: currentPrepTime,
        cookTime: currentCookTime,
        source: currentSource,
        notes: currentNotes,
      }) => {
        return compareFields(result, {
          name: { current: currentName, label: "Recipe Name" },
          cuisine: { current: currentCuisine, label: "Cuisine" },
          servings: { current: String(currentServings), label: "Servings" },
          difficulty: { current: currentDifficulty, label: "Difficulty" },
          prepTime: { current: String(currentPrepTime), label: "Prep Time (min)" },
          cookTime: { current: String(currentCookTime), label: "Cook Time (min)" },
          source: { current: currentSource, label: "Source" },
          remainingNotes: { current: currentNotes, label: "Notes" },
        });
      },
    );

    const hasExtractionResult = derive(
      changesPreview,
      (changes) => changes.length > 0,
    );

    return {
      [NAME]: str`🍳 ${displayName}`,
      [UI]: (
        <ct-vstack gap={2} style="padding: 12px; max-width: 800px;">
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <h1 style={{ margin: "0", fontSize: "20px" }}>{displayName}</h1>
            <div style={{ fontSize: "13px", color: "#666" }}>
              {totalTime} min total
            </div>
          </div>

          {/* Scaling Controls */}
          <ct-card>
            <div style={{ padding: "12px", display: "flex", gap: "8px", alignItems: "center" }}>
              <strong style={{ fontSize: "14px" }}>Scale Recipe:</strong>
              <ct-button
                onClick={scaleRecipe({ servings, ingredients, scaleFactor: 0.5 })}
                variant="secondary"
              >
                ÷ 2 (Half)
              </ct-button>
              <ct-button
                onClick={scaleRecipe({ servings, ingredients, scaleFactor: 2 })}
                variant="secondary"
              >
                × 2 (Double)
              </ct-button>
              <ct-button
                onClick={scaleRecipe({ servings, ingredients, scaleFactor: 1.5 })}
                variant="secondary"
              >
                × 1.5
              </ct-button>
            </div>
          </ct-card>

          {/* Basic Info Section */}
          <ct-card>
            <ct-vstack gap={2} style="padding: 12px;">
              <h3 style={{ margin: "0 0 6px 0", fontSize: "14px" }}>Basic Info</h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Recipe Name
                  </label>
                  <ct-input
                    $value={name}
                    placeholder="e.g., Chocolate Chip Cookies"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Cuisine
                  </label>
                  <ct-input
                    $value={cuisine}
                    placeholder="e.g., Italian, Thai"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Servings
                  </label>
                  <ct-input
                    type="number"
                    $value={str`${servings}`}
                    min="1"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Yield
                  </label>
                  <ct-input
                    $value={recipeYield}
                    placeholder="e.g., 12 cookies, 1 loaf"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Difficulty
                  </label>
                  <ct-select
                    $value={difficulty}
                    items={[
                      { label: "Easy", value: "easy" },
                      { label: "Medium", value: "medium" },
                      { label: "Hard", value: "hard" },
                    ]}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Prep Time (min)
                  </label>
                  <ct-input
                    type="number"
                    $value={str`${prepTime}`}
                    min="0"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Cook Time (min)
                  </label>
                  <ct-input
                    type="number"
                    $value={str`${cookTime}`}
                    min="0"
                  />
                </div>
              </div>
            </ct-vstack>
          </ct-card>

          {/* Ingredients Section */}
          <ct-card>
            <ct-vstack gap={2} style="padding: 12px;">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: "0", fontSize: "14px" }}>Ingredients ({ingredientCount})</h3>
                <ct-button onClick={addIngredient({ ingredients })}>
                  + Add Ingredient
                </ct-button>
              </div>

              <ct-vstack gap={2}>
                {ingredients.map((ingredient) => (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr auto",
                      gap: "8px",
                      alignItems: "center",
                      padding: "8px",
                      border: "1px solid #eee",
                      borderRadius: "4px",
                    }}
                  >
                    <ct-input
                      $value={ingredient.item}
                      placeholder="Ingredient name"
                    />
                    <ct-input
                      $value={ingredient.amount}
                      placeholder="Amount"
                    />
                    <ct-select
                      $value={ingredient.unit}
                      items={UNIT_ITEMS}
                    />
                    <ct-button
                      onClick={removeIngredient({ ingredients, ingredient })}
                      style={{ padding: "4px 8px", fontSize: "18px" }}
                    >
                      ×
                    </ct-button>
                  </div>
                ))}
              </ct-vstack>
            </ct-vstack>
          </ct-card>

          {/* Steps Section */}
          <ct-card>
            <ct-vstack gap={2} style="padding: 12px;">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: "0", fontSize: "14px" }}>Instructions ({stepCount})</h3>
                <ct-button onClick={addStep({ steps })}>
                  + Add Step
                </ct-button>
              </div>

              <ct-vstack gap={2}>
                  {steps.map((step, index) => (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto auto",
                        gap: "8px",
                        alignItems: "start",
                        padding: "12px",
                        border: "1px solid #eee",
                        borderRadius: "4px",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                          color: "#666",
                          minWidth: "24px",
                        }}
                      >
                        {index + 1}.
                      </div>
                      <ct-input
                        $value={step.description}
                        placeholder="Describe this step..."
                        style="flex: 1."
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <ct-input
                          type="number"
                          $value={step.duration}
                          placeholder="min"
                          min="0"
                          style="width: 60px;"
                        />
                        <span style={{ fontSize: "12px", color: "#999" }}>min</span>
                      </div>
                      <ct-button
                        onClick={removeStep({ steps, step })}
                        style={{ padding: "4px 8px", fontSize: "18px" }}
                      >
                        ×
                      </ct-button>
                    </div>
                  ))}
                </ct-vstack>
            </ct-vstack>
          </ct-card>

          {/* Tags Section */}
          <ct-card>
            <ct-vstack gap={2} style="padding: 12px;">
              <h3 style={{ margin: "0 0 6px 0", fontSize: "14px" }}>Tags</h3>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                  {tags.map((tag) => (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 8px",
                        background: "#e3f2fd",
                        borderRadius: "16px",
                        fontSize: "14px",
                      }}
                    >
                      <span>{tag}</span>
                      <ct-button
                        onClick={removeTag({ tags, tag })}
                        style={{
                          padding: "0 4px",
                          fontSize: "16px",
                          background: "transparent",
                          border: "none",
                        }}
                      >
                        ×
                      </ct-button>
                    </div>
                  ))}
                </div>

              <ct-message-input
                placeholder="Add tag (e.g., vegetarian, quick, dessert)..."
                appearance="rounded"
                onct-send={addTag({ tags })}
              />
            </ct-vstack>
          </ct-card>

          {/* Notes Section */}
          <ct-card>
            <ct-vstack gap={2} style="padding: 12px;">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: "0", fontSize: "14px" }}>Notes</h3>
                <ct-button
                  onClick={triggerExtraction({ notes, extractTrigger })}
                  disabled={extractionPending}
                >
                  {extractionPending
                    ? "Extracting..."
                    : "Extract Recipe Data"}
                </ct-button>
              </div>
              <ct-code-editor
                $value={notes}
                $mentionable={mentionable}
                $mentioned={mentioned}
                onbacklink-click={handleCharmLinkClick({})}
                onbacklink-create={handleNewBacklink({ mentionable })}
                language="text/markdown"
                theme="light"
                wordWrap
                tabIndent
                placeholder="Paste a recipe here and click 'Extract Recipe Data' to auto-fill fields..."
                style="min-height: 150px;"
              />
            </ct-vstack>
          </ct-card>

          {/* Source Section */}
          <ct-card>
            <ct-vstack gap={2} style="padding: 12px;">
              <h3 style={{ margin: "0 0 6px 0", fontSize: "14px" }}>Source</h3>
              <ct-input
                $value={source}
                placeholder="Where did this recipe come from? (URL, book, person)"
              />
            </ct-vstack>
          </ct-card>

          {/* Extraction Results Modal */}
          {ifElse(
            hasExtractionResult,
            <ct-card style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "600px",
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
              zIndex: "1000",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1), 0 0 0 9999px rgba(0,0,0,0.5)",
            }}>
              <ct-vstack gap={2} style="padding: 16px;">
                <h3 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>Review Extracted Changes</h3>
                <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#666" }}>
                  The following changes will be applied to your recipe:
                </p>

                <ct-vstack gap={2}>
                  {changesPreview.map((change) => (
                    <div style={{
                      padding: "6px 10px",
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: "4px",
                    }}>
                      <ct-vstack gap={0}>
                        <strong style={{ fontSize: "12px" }}>
                          {change.field}
                        </strong>
                        <div style={{ fontSize: "11px", lineHeight: "1.4" }}>
                          {change.field === "Notes"
                            ? (
                              change.to === "(empty)"
                                ? (
                                  <div style={{
                                    color: "#dc2626",
                                    fontStyle: "italic",
                                  }}>
                                    Notes will be cleared
                                  </div>
                                )
                                : change.from === "(empty)"
                                ? (
                                  <div style={{ color: "#16a34a" }}>
                                    {change.to}
                                  </div>
                                )
                                : change.from && change.to
                                ? (
                                  computeWordDiff(change.from, change.to).map(
                                    (part) => {
                                      if (part.type === "removed") {
                                        return (
                                          <span style={{
                                            color: "#dc2626",
                                            textDecoration: "line-through",
                                            backgroundColor: "#fee",
                                          }}>
                                            {part.word}
                                          </span>
                                        );
                                      } else if (part.type === "added") {
                                        return (
                                          <span style={{
                                            color: "#16a34a",
                                            backgroundColor: "#efe",
                                          }}>
                                            {part.word}
                                          </span>
                                        );
                                      } else {
                                        return <span>{part.word}</span>;
                                      }
                                    },
                                  )
                                )
                                : (
                                  <div style={{
                                    color: "#666",
                                    fontStyle: "italic",
                                  }}>
                                    (no diff available)
                                  </div>
                                )
                            )
                            : (
                              <div>
                                <span style={{
                                  color: "#dc2626",
                                  textDecoration: "line-through",
                                  marginRight: "6px",
                                }}>
                                  {change.from}
                                </span>
                                <span style={{ color: "#16a34a" }}>
                                  {change.to}
                                </span>
                              </div>
                            )}
                        </div>
                      </ct-vstack>
                    </div>
                  ))}

                  {/* Show info about complex fields if extracted */}
                  {derive(extractionResult, (result) => {
                    const hasComplexFields =
                      (result?.ingredients && result.ingredients.length > 0) ||
                      (result?.steps && result.steps.length > 0) ||
                      (result?.tags && result.tags.length > 0);

                    return hasComplexFields ? (
                      <div style={{
                        padding: "6px 10px",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        borderRadius: "4px",
                        fontSize: "12px",
                        color: "#1e40af",
                      }}>
                        {result?.ingredients && result.ingredients.length > 0 ?
                          `✓ ${result.ingredients.length} ingredient(s) ` : ""}
                        {result?.steps && result.steps.length > 0 ?
                          `✓ ${result.steps.length} step(s) ` : ""}
                        {result?.tags && result.tags.length > 0 ?
                          `✓ ${result.tags.length} tag(s) ` : ""}
                        will be added
                      </div>
                    ) : null;
                  })}
                </ct-vstack>

                <div style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                  marginTop: "1rem",
                }}>
                  <ct-button
                    onClick={cancelExtraction({ extractedData: extractionResult })}
                  >
                    Cancel
                  </ct-button>
                  <ct-button
                    onClick={applyExtractedData({
                      extractedData: extractionResult,
                      name,
                      cuisine,
                      servings,
                      difficulty,
                      prepTime,
                      cookTime,
                      ingredients,
                      steps,
                      tags,
                      source,
                      notes,
                    })}
                    style={{ backgroundColor: "#2563eb", color: "white" }}
                  >
                    Apply
                  </ct-button>
                </div>
              </ct-vstack>
            </ct-card>,
            <div />
          )}
        </ct-vstack>
      ),
      name,
      cuisine,
      servings,
      yield: recipeYield,
      difficulty,
      prepTime,
      cookTime,
      ingredients,
      steps,
      tags,
      notes,
      source,
      // Pattern tools for omnibot
      getIngredientsList: patternTool(
        ({ ingredients }: { ingredients: Ingredient[] }) => {
          return derive(ingredients, (items) => {
            if (!items || items.length === 0) return "No ingredients";
            return items.map((ing) =>
              `${ing.amount} ${ing.unit} ${ing.item}`
            ).join("\n");
          });
        },
        { ingredients }
      ),
      getInstructions: patternTool(
        ({ steps }: { steps: RecipeStep[] }) => {
          return derive(steps, (stepList) => {
            if (!stepList || stepList.length === 0) return "No instructions";
            return stepList.map((step) =>
              `${step.order}. ${step.description}${step.duration ? ` (${step.duration} min)` : ""}`
            ).join("\n");
          });
        },
        { steps }
      ),
      getRecipeSummary: patternTool(
        ({ name, cuisine, servings, prepTime, cookTime }: {
          name: string;
          cuisine: string;
          servings: number;
          prepTime: number;
          cookTime: number;
        }) => {
          return derive({ name, cuisine, servings, prepTime, cookTime }, (data) => {
            const parts = [
              `Recipe: ${data.name || "Untitled"}`,
              data.cuisine ? `Cuisine: ${data.cuisine}` : null,
              `Servings: ${data.servings}`,
              `Prep: ${data.prepTime} min, Cook: ${data.cookTime} min`,
              `Total: ${data.prepTime + data.cookTime} min`,
            ].filter(Boolean);
            return parts.join("\n");
          });
        },
        { name, cuisine, servings, prepTime, cookTime }
      ),
    };
  },
);
