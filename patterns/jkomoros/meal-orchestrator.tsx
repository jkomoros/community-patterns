/// <cts-enable />
import {
  cell,
  Cell,
  computed,
  Default,
  derive,
  generateObject,
  handler,
  ifElse,
  NAME,
  navigateTo,
  OpaqueRef,
  pattern,
  str,
  UI,
  wish,
} from "commontools";

import FoodRecipe from "./food-recipe.tsx";
import PreparedFood from "./prepared-food.tsx";

// Helper for wish with proper typing
function schemaifyWish<T>(path: string) {
  return wish<T>(path);
}

// Oven configuration
interface OvenConfig {
  rackPositions: number; // 3-7 vertical positions
  physicalRacks: number;  // 2-3 actual racks owned
}

// Guest dietary requirements
interface GuestDietaryProfile {
  guestName: Default<string, "">;
  requirements: Default<string[], []>;
}

// Food recipe interface (from food-recipe.tsx)
interface FoodRecipe {
  name: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  restTime: number;
  holdTime: number;
  category: string;
  ingredients: Array<{
    item: string;
    amount: string;
    unit: string;
  }>;
  stepGroups: Array<{
    id: string;
    name: string;
    nightsBeforeServing?: number;
    minutesBeforeServing?: number;
    duration?: number;
    maxWaitMinutes?: number;
    requiresOven?: {
      temperature: number;
      duration: number;
      racksNeeded?: {
        heightSlots: number;
        width: "full" | "half";
      };
    };
    steps: Array<{ description: string }>;
  }>;
}

// Prepared food interface (from prepared-food.tsx)
interface PreparedFood {
  name: string;
  servings: number;
  category: string;
  description: string;
  source: string;
  prepTime: number;
  requiresReheating: boolean;
  dietaryCompatibility: {
    compatible: string[];
    incompatible: string[];
    warnings: string[];
    primaryIngredients: string[];
  };
}

interface MealOrchestratorInput {
  mealName?: Default<string, "">;
  mealDate?: Default<string, "">; // ISO date: "2024-11-28"
  mealTime?: Default<string, "">; // 24hr time: "18:00"
  guestCount?: Default<number, 4>;

  // Equipment
  ovens?: Default<OvenConfig[], [{
    rackPositions: 5,
    physicalRacks: 2
  }]>;
  stovetopBurners?: Default<number, 4>;

  // Dietary requirements
  dietaryProfiles?: Default<GuestDietaryProfile[], []>;

  // Rough Planning (for early-stage brainstorming)
  planningNotes?: Default<string, "">;  // Free-form text for rough ideas

  // Recipes (@ references)
  recipes?: Default<OpaqueRef<FoodRecipe>[], []>;
  preparedFoods?: Default<OpaqueRef<PreparedFood>[], []>;

  notes?: Default<string, "">;
}

interface MealOrchestratorOutput extends MealOrchestratorInput {}

// Oven timeline event for visualization
interface OvenTimelineEvent {
  recipeName: string;
  stepGroupName: string;
  startMinutesBeforeServing: number;
  endMinutesBeforeServing: number;
  temperature: number;
  racksNeeded: { heightSlots: number; width: "full" | "half" };
}

// Handlers for oven configuration
const addOven = handler<unknown, { ovens: Cell<OvenConfig[]> }>(
  (_event, { ovens }) => {
    ovens.push({
      rackPositions: 5,
      physicalRacks: 2,
    });
  },
);

const removeOven = handler<
  unknown,
  { ovens: Cell<Array<Cell<OvenConfig>>>; oven: Cell<OvenConfig> }
>((_event, { ovens, oven }) => {
  const currentOvens = ovens.get();
  const index = currentOvens.findIndex((el) => oven.equals(el));
  if (index >= 0) {
    ovens.set(currentOvens.toSpliced(index, 1));
  }
});

// Handlers for dietary profiles
const addDietaryProfile = handler<
  unknown,
  { dietaryProfiles: Cell<GuestDietaryProfile[]> }
>((_event, { dietaryProfiles }) => {
  dietaryProfiles.push({
    guestName: "",
    requirements: [],
  });
});

const removeDietaryProfile = handler<
  unknown,
  {
    dietaryProfiles: Cell<Array<Cell<GuestDietaryProfile>>>;
    profile: Cell<GuestDietaryProfile>;
  }
>((_event, { dietaryProfiles, profile }) => {
  const currentProfiles = dietaryProfiles.get();
  const index = currentProfiles.findIndex((el) => profile.equals(el));
  if (index >= 0) {
    dietaryProfiles.set(currentProfiles.toSpliced(index, 1));
  }
});

// Handler for adding dietary requirement tags
const addDietaryRequirement = handler<
  { detail: { message: string } },
  { profile: Cell<GuestDietaryProfile> }
>(({ detail }, { profile }) => {
  const requirement = detail?.message?.trim();
  if (!requirement) return;

  const current = profile.get();
  if (!current.requirements.includes(requirement)) {
    profile.set({
      ...current,
      requirements: [...current.requirements, requirement],
    });
  }
});

const removeDietaryRequirement = handler<
  unknown,
  {
    profile: Cell<GuestDietaryProfile>;
    requirement: string;
  }
>((_event, { profile, requirement }) => {
  const current = profile.get();
  profile.set({
    ...current,
    requirements: current.requirements.filter((r) => r !== requirement),
  });
});

// Handler for removing recipes
const removeRecipe = handler<
  unknown,
  {
    recipes: Cell<Array<Cell<OpaqueRef<FoodRecipe>>>>;
    recipe: Cell<OpaqueRef<FoodRecipe>>;
  }
>((_event, { recipes, recipe }) => {
  const currentRecipes = recipes.get();
  const index = currentRecipes.findIndex((el) => recipe.equals(el));
  if (index >= 0) {
    recipes.set(currentRecipes.toSpliced(index, 1));
  }
});

// Handler for removing prepared foods
const removePreparedFood = handler<
  unknown,
  {
    preparedFoods: Cell<Array<Cell<OpaqueRef<PreparedFood>>>>;
    preparedFood: Cell<OpaqueRef<PreparedFood>>;
  }
>((_event, { preparedFoods, preparedFood }) => {
  const currentFoods = preparedFoods.get();
  const index = currentFoods.findIndex((el) => preparedFood.equals(el));
  if (index >= 0) {
    preparedFoods.set(currentFoods.toSpliced(index, 1));
  }
});

// LLM Recipe Linking Types
interface FoodItem {
  originalText: string;
  normalizedName: string;
  type: "recipe" | "prepared";
  contextSnippet: string;
  servings?: number;
  category?: string;
  description?: string;
  source?: string;
}

interface MatchResult {
  item: FoodItem;
  match: {
    existingCharmName: string;
    matchType: "exact" | "fuzzy";
    confidence: number;
  } | null;
  selected: boolean; // User's checkbox state
}

interface AnalysisResult {
  matches: MatchResult[];
}

// Handler to trigger LLM analysis of planning notes
const triggerRecipeLinking = handler<
  unknown,
  {
    planningNotes: Cell<string>;
    mentionable: any[];
    recipeMentioned: Cell<any[]>;
    preparedFoodMentioned: Cell<any[]>;
    linkingAnalysisTrigger: Cell<string>;
  }
>(
  (_event, { planningNotes, mentionable, recipeMentioned, preparedFoodMentioned, linkingAnalysisTrigger }) => {
    const notes = planningNotes.get();
    if (!notes || notes.trim() === "") {
      return; // Nothing to analyze
    }

    // Filter mentionables by emoji prefix
    const recipes = mentionable.filter((m: any) => m[NAME]?.startsWith('🍳'));
    const preparedFoods = mentionable.filter((m: any) => m[NAME]?.startsWith('🛒'));

    // Get currently mentioned items to avoid duplicates
    // Filter out any undefined values that might have been stored improperly
    const currentRecipes = recipeMentioned.get().filter((r: any) => r != null).map((r: any) => r.name);
    const currentPrepared = preparedFoodMentioned.get().filter((p: any) => p != null).map((p: any) => p.name);

    // Build context for LLM as natural language prompt
    const existingRecipesList = recipes.map((r: any) => r[NAME]?.replace('🍳 ', '')).join(', ') || 'none';
    const existingPreparedList = preparedFoods.map((p: any) => p[NAME]?.replace('🛒 ', '')).join(', ') || 'none';
    const currentRecipesList = currentRecipes.join(', ') || 'none';
    const currentPreparedList = currentPrepared.join(', ') || 'none';

    const prompt = `Planning Notes:
${notes}

Existing Recipes in Space: ${existingRecipesList}
Existing Prepared Foods in Space: ${existingPreparedList}

Already Added to This Meal:
- Recipes: ${currentRecipesList}
- Prepared Foods: ${currentPreparedList}

Please analyze the planning notes and extract all food items, matching them to existing items where possible.
---ANALYZE-${Date.now()}---`;

    // Trigger LLM analysis
    linkingAnalysisTrigger.set(prompt);
  }
);

// Handler to cancel analysis
const cancelLinking = handler<
  unknown,
  { linkingAnalysisTrigger: Cell<string> }
>((_event, { linkingAnalysisTrigger }) => {
  // Reset the trigger to clear the generateObject result
  linkingAnalysisTrigger.set("");
});

// Handler to apply selected links
const applyLinking = handler<
  unknown,
  {
    linkingResult: AnalysisResult | null;
    mentionable: any[];
    createdCharms: Cell<any[]>;
    recipeMentioned: Cell<any[]>;
    preparedFoodMentioned: Cell<any[]>;
    linkingAnalysisTrigger: Cell<string>;
  }
>((_event, { linkingResult, mentionable, createdCharms, recipeMentioned, preparedFoodMentioned, linkingAnalysisTrigger }) => {
  if (!linkingResult || !linkingResult.matches) return;

  // Filter for selected items
  const selectedItems = linkingResult.matches.filter(
    (matchResult) => matchResult.selected
  );

  if (selectedItems.length === 0) {
    // Close modal if nothing selected
    linkingAnalysisTrigger.set("");
    return;
  }

  const recipesToAdd: any[] = [];
  const preparedToAdd: any[] = [];

  selectedItems.forEach((matchResult) => {
    const { item, match } = matchResult;

    if (match) {
      // This item matches an existing charm - find and add it
      const charm = mentionable.find((m: any) => {
        const charmName = m[NAME]?.replace(/^[🍳🛒]\s*/, ''); // Remove emoji prefix
        return charmName === match.existingCharmName;
      });

      if (charm) {
        if (item.type === "recipe") {
          recipesToAdd.push(charm);
        } else {
          preparedToAdd.push(charm);
        }
      }
    } else {
      // No match - create a new charm with LLM-extracted data
      const newCharm = item.type === "recipe"
        ? FoodRecipe({
            name: item.normalizedName,
            cuisine: "",
            servings: item.servings || 4,
            yield: "",
            difficulty: "medium" as const,
            prepTime: 0,
            cookTime: 0,
            restTime: 0,
            holdTime: 0,
            category: (item.category as any) || "other",
            ingredients: [],
            stepGroups: [],
            tags: [],
            notes: item.description || "",
            source: item.source || "",
          })
        : PreparedFood({
            name: item.normalizedName,
            servings: item.servings || 4,
            category: (item.category as any) || "other",
            dietaryTags: [],
            primaryIngredients: [],
            description: item.description || "",
            source: item.source || "",
            prepTime: 0,
            requiresReheating: false,
            tags: [],
          });

      // Add to createdCharms so it becomes mentionable via this charm's export
      createdCharms.push(newCharm);

      // Add to appropriate array for this meal
      // OpaqueRef properties are now directly accessible after framework fix
      if (item.type === "recipe") {
        recipesToAdd.push(newCharm);
      } else {
        preparedToAdd.push(newCharm);
      }
    }
  });

  // Add to appropriate arrays
  if (recipesToAdd.length > 0) {
    const currentRecipes = recipeMentioned.get();
    recipeMentioned.set([...currentRecipes, ...recipesToAdd]);
  }

  if (preparedToAdd.length > 0) {
    const currentPrepared = preparedFoodMentioned.get();
    preparedFoodMentioned.set([...currentPrepared, ...preparedToAdd]);
  }

  // Close the modal
  linkingAnalysisTrigger.set("");
});

const MealOrchestrator = pattern<MealOrchestratorInput, MealOrchestratorOutput>(
  ({
    mealName,
    mealDate,
    mealTime,
    guestCount,
    ovens,
    stovetopBurners,
    dietaryProfiles,
    planningNotes,
    recipes,
    preparedFoods,
    notes,
  }) => {
    // Get mentionable charms for @ references
    const mentionable = schemaifyWish<any[]>("#mentionable");

    // Track charms created by this meal orchestrator
    // These will be exported as mentionable so they become discoverable
    const createdCharms = cell<any[]>([]);

    // Cells for ct-code-editor inputs and outputs
    // $mentioned is automatically populated by ct-code-editor with charm references
    const recipeInputText = cell<string>("");
    const recipeMentioned = cell<any[]>([]);
    const preparedFoodInputText = cell<string>("");
    const preparedFoodMentioned = cell<any[]>([]);

    // LLM Recipe Linking State
    const linkingAnalysisTrigger = cell<string>("");
    const linkingAnalysisResult = cell<AnalysisResult | null>(null);

    // LLM Analysis of Planning Notes
    const { result: linkingResult, pending: linkingPending } = generateObject({
      system: `You are a meal planning assistant. Extract food items from planning notes and match them to existing recipes and prepared foods.

Your task:
1. Parse the planning notes to identify all food items mentioned
2. Classify each item as either "recipe" (homemade) or "prepared" (store-bought, guest-brought, takeout)
3. Match each item to existing recipes/prepared foods in the space using fuzzy matching
4. Extract contextual details from the notes (servings, category, description, source)

Matching guidelines:
- Prioritize exact matches (case-insensitive)
- Use semantic similarity for fuzzy matching (e.g., "rotisserie chicken" matches "Costco Rotisserie Chicken")
- Return the single best match per item
- Mark match as null if no good match exists (confidence < 0.6)
- Never suggest items already in currentlyAdded lists

Context extraction guidelines:
- servings: Look for phrases like "serves 8", "for 12 people", "feeds 6"
- category: Infer from context (appetizer, main, side, starch, vegetable, dessert, bread, other)
- description: Capture brief description from notes
- source: For prepared foods, look for store names, person names, or "takeout"

Return all items found in the planning notes, matched or unmatched.`,
      prompt: linkingAnalysisTrigger,
      model: "anthropic:claude-sonnet-4-5",
      schema: {
        type: "object",
        properties: {
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                item: {
                  type: "object",
                  properties: {
                    originalText: { type: "string", description: "Raw text from planning notes" },
                    normalizedName: { type: "string", description: "Cleaned name for the item" },
                    type: { type: "string", enum: ["recipe", "prepared"], description: "Item classification" },
                    contextSnippet: { type: "string", description: "Surrounding context from notes" },
                    servings: { type: "number", description: "Extracted serving size if found" },
                    category: {
                      type: "string",
                      enum: ["appetizer", "main", "side", "starch", "vegetable", "dessert", "bread", "other"],
                      description: "Inferred category"
                    },
                    description: { type: "string", description: "Brief description from notes" },
                    source: { type: "string", description: "Source (for prepared foods)" },
                  },
                  required: ["originalText", "normalizedName", "type", "contextSnippet"],
                },
                match: {
                  oneOf: [
                    {
                      type: "object",
                      properties: {
                        existingCharmName: { type: "string", description: "Name of matched charm" },
                        matchType: { type: "string", enum: ["exact", "fuzzy"], description: "Type of match" },
                        confidence: { type: "number", description: "Match confidence 0-1", minimum: 0, maximum: 1 },
                      },
                      required: ["existingCharmName", "matchType", "confidence"],
                    },
                    {
                      type: "null",
                    },
                  ],
                  description: "Match to existing charm, null if no match"
                },
                selected: { type: "boolean", description: "Default to true for user approval", default: true },
              },
              required: ["item", "selected"],
            },
          },
        },
        required: ["matches"],
      },
    });

    // Derive a flag for showing the modal
    const hasLinkingResult = derive(
      linkingResult,
      (result) => result && result.matches && result.matches.length > 0,
    );

    const displayName = derive(
      mealName,
      (name) => name.trim() || "Untitled Meal",
    );

    const ovenCount = derive(ovens, (list) => list.length);
    const profileCount = derive(dietaryProfiles, (list) => list.length);
    const recipeCount = computed(() => recipeMentioned.get().length);
    const preparedFoodCount = computed(() => preparedFoodMentioned.get().length);

    // Meal Balance Analysis
    const analysisPrompt = derive(
      { guestCount, dietaryProfiles },
      ({ guestCount: guests, dietaryProfiles: profiles }) => {
        const recipeList = recipeMentioned.get();
        const preparedList = preparedFoodMentioned.get();

      if ((!recipeList || recipeList.length === 0) && (!preparedList || preparedList.length === 0)) {
        return "No items to analyze";
      }

      const recipesSummary = (recipeList || [])
        .filter((r: any) => r != null)
        .map((r: any) => `- ${r.name} (${r.category}, ${r.servings} servings) [recipe]`)
        .join("\n");

      const preparedSummary = (preparedList || [])
        .filter((p: any) => p != null)
        .map((p: any) => `- ${p.name} (${p.category}, ${p.servings} servings) [prepared/bought]`)
        .join("\n");

      const allItems = [recipesSummary, preparedSummary].filter(Boolean).join("\n");

      const dietaryRequirements = profiles
        .flatMap((p: any) => p.requirements)
        .filter((req: any, idx: number, arr: any[]) => arr.indexOf(req) === idx); // unique

        return `Analyze this meal menu for balance and dietary compatibility:

Guest Count: ${guests}
Dietary Requirements: ${dietaryRequirements.join(", ") || "none specified"}

Menu Items:
${allItems}

Provide:
1. Category breakdown (how many mains, sides, desserts, etc.)
2. Total servings vs guest count analysis
3. Dietary compatibility warnings for guests with requirements
4. Menu balance suggestions (missing categories, too much/little of something)`;
      },
    );

    const { result: mealAnalysis, pending: analysisPending } = generateObject({
      system: `You are a meal planning expert. Analyze menus for balance, portion sizing, and dietary compatibility.

When analyzing:
- Consider standard meal structure (appetizer, main, sides, dessert)
- Check if servings are appropriate for guest count (typically 1-1.5 servings per guest per dish category)
- Identify dietary compatibility issues (e.g., no vegan main for vegan guests)
- Suggest improvements for balance and variety

Be concise and practical in your analysis.`,
      prompt: analysisPrompt,
      model: "anthropic:claude-sonnet-4-5",
      schema: {
        type: "object",
        properties: {
          categoryBreakdown: {
            type: "object",
            additionalProperties: { type: "number" },
            description: "Count of dishes per category (main, side, dessert, etc.)",
          },
          servingsAnalysis: {
            type: "string",
            description: "Analysis of total servings vs guest count",
          },
          dietaryWarnings: {
            type: "array",
            items: { type: "string" },
            description: "Warnings about dietary compatibility issues",
          },
          suggestions: {
            type: "array",
            items: { type: "string" },
            description: "Suggestions for improving menu balance",
          },
        },
        required: [
          "categoryBreakdown",
          "servingsAnalysis",
          "dietaryWarnings",
          "suggestions",
        ],
      },
    });

    const analysisResult = derive(
      mealAnalysis,
      (result) =>
        result || {
          categoryBreakdown: {},
          servingsAnalysis: "",
          dietaryWarnings: [],
          suggestions: [],
        },
    );

    // Oven Timeline Calculation
    const ovenTimeline = derive(mealTime, (servingTime) => {
      const recipeList = recipeMentioned.get();

      if (!recipeList || recipeList.length === 0 || !servingTime) {
        return { events: [], conflicts: [], hasData: false };
      }

      const events: OvenTimelineEvent[] = [];

      // Extract all oven events from recipes
      recipeList.forEach((recipe: any) => {
        if (recipe.stepGroups) {
          recipe.stepGroups.forEach((stepGroup: any) => {
              if (stepGroup.requiresOven) {
                const startMinutes = stepGroup.minutesBeforeServing || 0;
                const duration = stepGroup.requiresOven.duration || 0;
                const endMinutes = startMinutes - duration; // Earlier time (more minutes before)

                events.push({
                  recipeName: recipe.name,
                  stepGroupName: stepGroup.name,
                  startMinutesBeforeServing: startMinutes,
                  endMinutesBeforeServing: endMinutes,
                  temperature: stepGroup.requiresOven.temperature,
                  racksNeeded: stepGroup.requiresOven.racksNeeded || {
                    heightSlots: 1,
                    width: "full",
                  },
                });
              }
            });
          }
        });

        // Sort events by start time (descending - furthest from serving time first)
        events.sort((a, b) => b.startMinutesBeforeServing - a.startMinutesBeforeServing);

        // Detect conflicts
        interface Conflict {
          time: number;
          reason: string;
          affectedRecipes: string[];
        }
        const conflicts: Conflict[] = [];

        // Check for time overlaps
        for (let i = 0; i < events.length; i++) {
          for (let j = i + 1; j < events.length; j++) {
            const eventA = events[i];
            const eventB = events[j];

            // Check if time ranges overlap
            const aStart = eventA.startMinutesBeforeServing;
            const aEnd = eventA.endMinutesBeforeServing;
            const bStart = eventB.startMinutesBeforeServing;
            const bEnd = eventB.endMinutesBeforeServing;

            const overlaps = (aStart >= bEnd && aEnd <= bStart);

            if (overlaps) {
              // Check if temperatures are compatible (within 25°F)
              const tempDiff = Math.abs(eventA.temperature - eventB.temperature);
              if (tempDiff > 25) {
                conflicts.push({
                  time: Math.max(aStart, bStart),
                  reason: `Temperature conflict: ${eventA.temperature}°F vs ${eventB.temperature}°F`,
                  affectedRecipes: [eventA.recipeName, eventB.recipeName],
                });
              }
            }
          }
        }

      return {
        events,
        conflicts,
        hasData: events.length > 0,
      };
    });

    return {
      [NAME]: str`🍽️ ${displayName}`,
      [UI]: (
        <ct-vstack gap={1} style="padding: 8px; max-width: 900px;">
          {/* Header */}
          <div style={{ marginBottom: "4px" }}>
            <h1 style={{ margin: "0 0 2px 0", fontSize: "20px", fontWeight: "700" }}>
              {displayName}
            </h1>
            <div style={{ fontSize: "13px", color: "#666" }}>
              Plan multi-recipe meals with equipment scheduling and dietary analysis
            </div>
          </div>

          {/* Event Information */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                Event Information
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Meal Name
                  </label>
                  <ct-input
                    $value={mealName}
                    placeholder="e.g., Thanksgiving Dinner 2024"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Guest Count
                  </label>
                  <ct-input
                    type="number"
                    $value={str`${guestCount}`}
                    min="1"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Date
                  </label>
                  <ct-input
                    type="date"
                    $value={mealDate}
                    placeholder="2024-11-28"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Serving Time
                  </label>
                  <ct-input
                    type="time"
                    $value={mealTime}
                    placeholder="18:00"
                  />
                </div>
              </div>
            </ct-vstack>
          </ct-card>

          {/* Equipment Configuration */}
          <ct-card>
            <ct-vstack gap={1}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>
                  Equipment ({ovenCount} ovens)
                </h3>
                <ct-button onClick={addOven({ ovens })}>
                  + Add Oven
                </ct-button>
              </div>

              <ct-vstack gap={1}>
                {ovens.map((oven, index) => (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr 1fr auto",
                      gap: "8px",
                      alignItems: "center",
                      padding: "8px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "4px",
                      background: "#f9fafb",
                    }}
                  >
                    <div style={{ fontWeight: "600", color: "#666", fontSize: "14px" }}>
                      Oven {index + 1}
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "13px" }}>
                        Rack Positions
                      </label>
                      <ct-input
                        type="number"
                        $value={str`${oven.rackPositions}`}
                        min="3"
                        max="7"
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "13px" }}>
                        Physical Racks
                      </label>
                      <ct-input
                        type="number"
                        $value={str`${oven.physicalRacks}`}
                        min="1"
                        max="3"
                      />
                    </div>
                    <ct-button
                      onClick={removeOven({ ovens, oven })}
                      style={{ padding: "6px 12px", fontSize: "18px" }}
                    >
                      ×
                    </ct-button>
                  </div>
                ))}
              </ct-vstack>

              <div style={{ marginTop: "8px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                  Stovetop Burners
                </label>
                <ct-input
                  type="number"
                  $value={str`${stovetopBurners}`}
                  min="1"
                  max="8"
                  style="max-width: 150px;"
                />
              </div>
            </ct-vstack>
          </ct-card>

          {/* Dietary Requirements */}
          <ct-card>
            <ct-vstack gap={1}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>
                  Dietary Requirements ({profileCount} guests)
                </h3>
                <ct-button onClick={addDietaryProfile({ dietaryProfiles })}>
                  + Add Guest
                </ct-button>
              </div>

              <ct-vstack gap={1}>
                {dietaryProfiles.map((profile, index) => (
                  <ct-card style={{ background: "#f9fafb" }}>
                    <ct-vstack gap={1}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <ct-input
                          $value={profile.guestName}
                          placeholder={`Guest ${index + 1} (optional name)`}
                          style="flex: 1; marginRight: 8px;"
                        />
                        <ct-button
                          onClick={removeDietaryProfile({ dietaryProfiles, profile })}
                          style={{ padding: "4px 8px", fontSize: "18px" }}
                        >
                          ×
                        </ct-button>
                      </div>

                      <div>
                        <div style={{ fontSize: "13px", fontWeight: "500", marginBottom: "6px" }}>
                          Requirements:
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                          {profile.requirements.map((req) => (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "4px 8px",
                                background: "#dbeafe",
                                borderRadius: "12px",
                                fontSize: "13px",
                              }}
                            >
                              <span>{req}</span>
                              <button
                                onClick={removeDietaryRequirement({ profile, requirement: req })}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: "0 2px",
                                  cursor: "pointer",
                                  fontSize: "14px",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        <ct-message-input
                          placeholder="Add requirement (vegan, gluten-free, no-mushrooms)..."
                          appearance="rounded"
                          onct-send={addDietaryRequirement({ profile })}
                        />
                      </div>
                    </ct-vstack>
                  </ct-card>
                ))}
              </ct-vstack>
            </ct-vstack>
          </ct-card>

          {/* Planning Notes Section */}
          <ct-card>
            <ct-vstack gap={1}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>
                  📝 Planning Notes
                </h3>
                <ct-button
                  onClick={triggerRecipeLinking({ planningNotes, mentionable, recipeMentioned, preparedFoodMentioned, linkingAnalysisTrigger })}
                  disabled={linkingPending}
                >
                  {ifElse(
                    linkingPending,
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <ct-loader size="sm" show-elapsed></ct-loader>
                      Analyzing...
                    </span>,
                    "🔗 Link Recipes"
                  )}
                </ct-button>
              </div>
              <div style={{ fontSize: "13px", color: "#666", marginBottom: "4px" }}>
                Free-form brainstorming space for rough ideas and menu thoughts.
              </div>
              <ct-input
                $value={planningNotes}
                placeholder="Jot down ideas for the meal..."
                style="min-height: 120px; width: 100%;"
              />
            </ct-vstack>
          </ct-card>

          {/* Recipes Section */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                Recipes ({recipeCount})
              </h3>

              {/* Input for adding recipes via wiki links */}
              <ct-code-editor
                $value={recipeInputText}
                $mentionable={mentionable}
                $mentioned={recipeMentioned}
                placeholder="Type [[ to mention recipes..."
                language="text/markdown"
                theme="light"
                wordWrap
                style="min-height: 60px;"
              />

              {/* List of added recipes */}
              {ifElse(
                computed(() => recipeMentioned.get().filter(Boolean).length > 0),
                <ct-vstack gap={1} style="margin-top: 8px;">
                  {recipeMentioned.map((itemCell: any, index: number) => (
                    <div
                      key={index}
                      style={{
                        padding: "6px 8px",
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                        borderRadius: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        {/* Use derive to unwrap the Cell and get display name */}
                        <div style={{ fontWeight: "600", fontSize: "14px" }}>
                          {derive(itemCell, (item: any) => item?.name || item?.[NAME] || "Untitled Recipe")}
                        </div>
                        <div style={{ fontSize: "12px", color: "#666" }}>
                          {derive(itemCell, (item: any) =>
                            item?.category ? `${item.category} • ${item.servings} servings` : "Recipe"
                          )}
                        </div>
                      </div>
                      <ct-button
                        onClick={removeRecipe({ recipes: recipeMentioned, recipe: itemCell })}
                        style={{ padding: "2px 6px", fontSize: "16px" }}
                      >
                        ×
                      </ct-button>
                    </div>
                  ))}
                </ct-vstack>,
                null,
              )}
            </ct-vstack>
          </ct-card>

          {/* Prepared Foods Section */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                🛒 Prepared/Store-Bought ({preparedFoodCount})
              </h3>

              {/* Input for adding prepared foods via wiki links */}
              <ct-code-editor
                $value={preparedFoodInputText}
                $mentionable={mentionable}
                $mentioned={preparedFoodMentioned}
                placeholder="Type [[ to mention prepared foods..."
                language="text/markdown"
                theme="light"
                wordWrap
                style="min-height: 60px;"
              />

              {/* List of added prepared foods */}
              {ifElse(
                computed(() => preparedFoodMentioned.get().filter(Boolean).length > 0),
                <ct-vstack gap={1} style="margin-top: 8px;">
                  {preparedFoodMentioned.map((itemCell: any, index: number) => (
                    <div
                      key={index}
                      style={{
                        padding: "6px 8px",
                        background: "#fef3c7",
                        border: "1px solid #fde68a",
                        borderRadius: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        {/* Use derive to unwrap the Cell and get display name */}
                        <div style={{ fontWeight: "600", fontSize: "14px" }}>
                          {derive(itemCell, (item: any) => item?.name || item?.[NAME] || "Untitled Item")}
                        </div>
                        <div style={{ fontSize: "12px", color: "#666" }}>
                          {derive(itemCell, (item: any) =>
                            item?.category
                              ? `${item.category} • ${item.servings} servings${item.source ? ` • ${item.source}` : ""}`
                              : "Prepared Food"
                          )}
                        </div>
                      </div>
                      <ct-button
                        onClick={removePreparedFood({ preparedFoods: preparedFoodMentioned, preparedFood: itemCell })}
                        style={{ padding: "2px 6px", fontSize: "16px" }}
                      >
                        ×
                      </ct-button>
                    </div>
                  ))}
                </ct-vstack>,
                null,
              )}
            </ct-vstack>
          </ct-card>

          {/* Meal Balance Analysis */}
          {ifElse(
            derive({ recipes, preparedFoods }, ({ recipes: r, preparedFoods: p }) => (r.length + p.length) > 0),
            <ct-card>
              <ct-vstack gap={1}>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                  📊 Meal Balance Analysis
                </h3>

                {ifElse(
                  analysisPending,
                  <div style={{ fontSize: "13px", color: "#666", fontStyle: "italic", display: "flex", alignItems: "center", gap: "8px" }}>
                    <ct-loader size="sm" show-elapsed></ct-loader>
                    Analyzing menu...
                  </div>,
                  <ct-vstack gap={1}>
                    {/* Category Breakdown */}
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>
                        Categories:
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {derive(analysisResult, (r) => {
                          return Object.entries(r.categoryBreakdown).map(([category, count]) => (
                            <div
                              style={{
                                padding: "4px 10px",
                                background: "#e0f2fe",
                                borderRadius: "12px",
                                fontSize: "13px",
                              }}
                            >
                              {category}: {count as number}
                            </div>
                          ));
                        })}
                      </div>
                    </div>

                    {/* Servings Analysis */}
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>
                        Portions:
                      </div>
                      <div style={{ fontSize: "14px", color: "#444" }}>
                        {derive(analysisResult, (r) => r.servingsAnalysis)}
                      </div>
                    </div>

                    {/* Dietary Warnings */}
                    {ifElse(
                      derive(
                        analysisResult,
                        (r) => r.dietaryWarnings && r.dietaryWarnings.length > 0,
                      ),
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "6px", color: "#dc2626" }}>
                          ⚠️ Dietary Warnings:
                        </div>
                        <ul style={{ margin: "0", paddingLeft: "20px", fontSize: "13px", color: "#dc2626" }}>
                          {derive(analysisResult, (r) => r.dietaryWarnings).map(
                            (warning: string) => (
                              <li>{warning}</li>
                            ),
                          )}
                        </ul>
                      </div>,
                      null,
                    )}

                    {/* Suggestions */}
                    {ifElse(
                      derive(
                        analysisResult,
                        (r) => r.suggestions && r.suggestions.length > 0,
                      ),
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "6px", color: "#059669" }}>
                          💡 Suggestions:
                        </div>
                        <ul style={{ margin: "0", paddingLeft: "20px", fontSize: "13px", color: "#059669" }}>
                          {derive(analysisResult, (r) => r.suggestions).map(
                            (suggestion: string) => (
                              <li>{suggestion}</li>
                            ),
                          )}
                        </ul>
                      </div>,
                      null,
                    )}
                  </ct-vstack>,
                )}
              </ct-vstack>
            </ct-card>,
            null,
          )}

          {/* Oven Timeline Visualization */}
          {ifElse(
            derive(ovenTimeline, (timeline) => timeline.hasData),
            <ct-card>
              <ct-vstack gap={1}>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                  🔥 Oven Timeline
                </h3>

                {/* Conflicts Warning */}
                {ifElse(
                  derive(ovenTimeline, (timeline) => timeline.conflicts.length > 0),
                  <div
                    style={{
                      padding: "8px",
                      background: "#fef2f2",
                      border: "1px solid #fca5a5",
                      borderRadius: "4px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#dc2626", marginBottom: "4px" }}>
                      ⚠️ Conflicts Detected
                    </div>
                    <ul style={{ margin: "0", paddingLeft: "20px", fontSize: "12px", color: "#dc2626" }}>
                      {derive(ovenTimeline, (timeline) => timeline.conflicts).map(
                        (conflict: any) => (
                          <li>
                            {conflict.reason} ({conflict.affectedRecipes.join(", ")})
                          </li>
                        ),
                      )}
                    </ul>
                  </div>,
                  null,
                )}

                {/* Timeline visualization */}
                <div style={{ position: "relative", marginTop: "8px" }}>
                  {/* Helper function to format time */}
                  {derive(ovenTimeline, (timeline) => {
                    if (!timeline.hasData) return null;

                    // Find the time range
                    const maxMinutes = Math.max(
                      ...timeline.events.map((e: OvenTimelineEvent) => e.startMinutesBeforeServing),
                    );
                    const minMinutes = Math.min(
                      ...timeline.events.map((e: OvenTimelineEvent) => e.endMinutesBeforeServing),
                    );

                    const timeRange = maxMinutes - minMinutes;
                    const pixelWidth = 700;

                    const formatTime = (minutesBefore: number) => {
                      if (minutesBefore === 0) return "Serving";
                      const hours = Math.floor(minutesBefore / 60);
                      const mins = minutesBefore % 60;
                      if (hours > 0 && mins > 0) return `-${hours}h ${mins}m`;
                      if (hours > 0) return `-${hours}h`;
                      return `-${mins}m`;
                    };

                    return (
                      <ct-vstack gap={1}>
                        {/* Time axis */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "11px",
                            color: "#666",
                            marginBottom: "4px",
                            paddingLeft: "150px",
                          }}
                        >
                          <span>{formatTime(maxMinutes)}</span>
                          <span>{formatTime(Math.floor((maxMinutes + minMinutes) / 2))}</span>
                          <span>{formatTime(minMinutes)}</span>
                        </div>

                        {/* Events */}
                        {timeline.events.map((event: OvenTimelineEvent, index: number) => {
                          const startPos = ((maxMinutes - event.startMinutesBeforeServing) / timeRange) * pixelWidth;
                          const duration = event.startMinutesBeforeServing - event.endMinutesBeforeServing;
                          const width = (duration / timeRange) * pixelWidth;

                          // Check if this event has conflicts
                          const hasConflict = timeline.conflicts.some(
                            (c: any) => c.affectedRecipes.includes(event.recipeName),
                          );

                          return (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                marginBottom: "2px",
                              }}
                            >
                              {/* Recipe label */}
                              <div
                                style={{
                                  width: "140px",
                                  fontSize: "12px",
                                  fontWeight: "500",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={`${event.recipeName} - ${event.stepGroupName}`}
                              >
                                {event.recipeName}
                              </div>

                              {/* Timeline bar container */}
                              <div
                                style={{
                                  position: "relative",
                                  height: "28px",
                                  width: `${pixelWidth}px`,
                                  background: "#f3f4f6",
                                  borderRadius: "2px",
                                }}
                              >
                                {/* Event bar */}
                                <div
                                  style={{
                                    position: "absolute",
                                    left: `${startPos}px`,
                                    width: `${width}px`,
                                    height: "100%",
                                    background: hasConflict
                                      ? "linear-gradient(90deg, #fca5a5, #f87171)"
                                      : "linear-gradient(90deg, #93c5fd, #60a5fa)",
                                    borderRadius: "2px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    color: "#fff",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                  }}
                                  title={`${event.stepGroupName}: ${event.temperature}°F for ${duration} min`}
                                >
                                  {event.temperature}°F
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Legend */}
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "8px",
                            background: "#f9fafb",
                            borderRadius: "4px",
                            fontSize: "11px",
                            color: "#666",
                          }}
                        >
                          <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                            Timeline shows when each recipe uses the oven
                          </div>
                          <div style={{ display: "flex", gap: "16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <div
                                style={{
                                  width: "16px",
                                  height: "16px",
                                  background: "linear-gradient(90deg, #93c5fd, #60a5fa)",
                                  borderRadius: "2px",
                                }}
                              />
                              <span>Normal</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <div
                                style={{
                                  width: "16px",
                                  height: "16px",
                                  background: "linear-gradient(90deg, #fca5a5, #f87171)",
                                  borderRadius: "2px",
                                }}
                              />
                              <span>Conflict</span>
                            </div>
                          </div>
                        </div>
                      </ct-vstack>
                    );
                  })}
                </div>
              </ct-vstack>
            </ct-card>,
            null,
          )}

          {/* Notes */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                Notes
              </h3>
              <ct-input
                $value={notes}
                placeholder="Additional notes or special instructions..."
                style="width: 100%;"
              />
            </ct-vstack>
          </ct-card>

          {/* Placeholder sections for future features */}
          <ct-card style={{ background: "#f0fdf4", border: "1px solid #86efac" }}>
            <div style={{ padding: "8px" }}>
              <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px", color: "#166534" }}>
                Coming Soon:
              </div>
              <ul style={{ margin: "0", paddingLeft: "16px", fontSize: "12px", color: "#166534" }}>
                <li>Production schedule generator (detailed step-by-step timeline)</li>
                <li>Smart conflict resolution suggestions</li>
                <li>Stovetop burner timeline</li>
              </ul>
            </div>
          </ct-card>

          {/* Recipe Linking Results Modal */}
          {ifElse(
            hasLinkingResult,
            <ct-card style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "700px",
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
              zIndex: "1000",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1), 0 0 0 9999px rgba(0,0,0,0.5)",
            }}>
              <ct-vstack gap={1} style="padding: 16px;">
                <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: "600" }}>
                  Review Recipe Links
                </h3>
                <div style={{ fontSize: "13px", color: "#666", marginBottom: "12px" }}>
                  The following items were found in your planning notes. Check the items you want to add to your meal.
                </div>

                {/* Display each match with checkbox */}
                <ct-vstack gap={1}>
                  {derive(linkingResult, (result) => {
                    if (!result || !result.matches) return [];
                    return result.matches.map((matchResult: MatchResult, index: number) => {
                      const item = matchResult.item;
                      const match = matchResult.match;

                      return (
                        <div
                          style={{
                            padding: "12px",
                            border: "1px solid #e5e7eb",
                            borderRadius: "4px",
                            background: "#f9fafb",
                          }}
                        >
                          <div style={{ display: "flex", gap: "12px", alignItems: "start" }}>
                            {/* Checkbox */}
                            <div style={{ paddingTop: "2px" }}>
                              <ct-checkbox checked={matchResult.selected} />
                            </div>

                            <div style={{ flex: 1 }}>
                              {/* Item name and type */}
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                <span style={{ fontSize: "14px", fontWeight: "600" }}>
                                  {item.normalizedName}
                                </span>
                                <span style={{
                                  padding: "2px 6px",
                                  background: item.type === "recipe" ? "#dbeafe" : "#fef3c7",
                                  borderRadius: "8px",
                                  fontSize: "11px",
                                  fontWeight: "500",
                                }}>
                                  {item.type === "recipe" ? "🍳 Recipe" : "🛒 Prepared"}
                                </span>
                              </div>

                              {/* Match status */}
                              {match ? (
                                <div style={{ fontSize: "12px", color: "#059669", marginBottom: "4px" }}>
                                  ✓ Match found: <strong>{match.existingCharmName}</strong>
                                  {match.matchType === "fuzzy" && (
                                    <span style={{ color: "#666", fontStyle: "italic" }}>
                                      {" "}(fuzzy match, {Math.round(match.confidence * 100)}% confidence)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div style={{ fontSize: "12px", color: "#10b981", marginBottom: "4px" }}>
                                  ✨ Will create new {item.type === "recipe" ? "recipe" : "prepared food"} charm
                                </div>
                              )}

                              {/* Extracted details */}
                              <div style={{ fontSize: "12px", color: "#666", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                {item.servings && (
                                  <span>• {item.servings} servings</span>
                                )}
                                {item.category && (
                                  <span>• {item.category}</span>
                                )}
                                {item.source && (
                                  <span>• {item.source}</span>
                                )}
                              </div>

                              {/* Context snippet */}
                              {item.contextSnippet && (
                                <div style={{
                                  fontSize: "11px",
                                  color: "#666",
                                  fontStyle: "italic",
                                  marginTop: "6px",
                                  paddingTop: "6px",
                                  borderTop: "1px solid #e5e7eb",
                                }}>
                                  "{item.contextSnippet}"
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })}
                </ct-vstack>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
                  <ct-button
                    onClick={cancelLinking({ linkingAnalysisTrigger })}
                    style={{ padding: "8px 16px" }}
                  >
                    Cancel
                  </ct-button>
                  <ct-button
                    onClick={applyLinking({ linkingResult, mentionable, createdCharms, recipeMentioned, preparedFoodMentioned, linkingAnalysisTrigger })}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "#2563eb",
                      color: "white",
                    }}
                  >
                    Apply Links
                  </ct-button>
                </div>
              </ct-vstack>
            </ct-card>,
            <div />
          )}
        </ct-vstack>
      ),
      mealName,
      mealDate,
      mealTime,
      guestCount,
      ovens,
      stovetopBurners,
      dietaryProfiles,
      planningNotes,
      recipes,
      preparedFoods,
      notes,
      // Export created charms as mentionable so they become discoverable
      // BacklinksIndex will pick these up and include them in #mentionable
      mentionable: createdCharms,
    };
  },
);

export default MealOrchestrator;
