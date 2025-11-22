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
  OpaqueRef,
  pattern,
  str,
  UI,
} from "commontools";

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

interface MealOrchestratorInput {
  mealName: Default<string, "">;
  mealDate: Default<string, "">; // ISO date: "2024-11-28"
  mealTime: Default<string, "">; // 24hr time: "18:00"
  guestCount: Default<number, 4>;

  // Equipment
  ovens: Default<OvenConfig[], [{
    rackPositions: 5,
    physicalRacks: 2
  }]>;
  stovetopBurners: Default<number, 4>;

  // Dietary requirements
  dietaryProfiles: Default<GuestDietaryProfile[], []>;

  // Recipes (@ references)
  recipes: Default<OpaqueRef<FoodRecipe>[], []>;

  notes: Default<string, "">;
}

interface MealOrchestratorOutput extends MealOrchestratorInput {}

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

export default pattern<MealOrchestratorInput, MealOrchestratorOutput>(
  ({
    mealName,
    mealDate,
    mealTime,
    guestCount,
    ovens,
    stovetopBurners,
    dietaryProfiles,
    recipes,
    notes,
  }) => {
    const displayName = derive(
      mealName,
      (name) => name.trim() || "Untitled Meal",
    );

    const ovenCount = derive(ovens, (list) => list.length);
    const profileCount = derive(dietaryProfiles, (list) => list.length);
    const recipeCount = derive(recipes, (list) => list.length);

    // Meal Balance Analysis
    const analysisPrompt = derive(
      { recipes, guestCount, dietaryProfiles },
      ({ recipes: recipeList, guestCount: guests, dietaryProfiles: profiles }) => {
        if (!recipeList || recipeList.length === 0) {
          return "No recipes to analyze";
        }

        const recipesSummary = recipeList
          .map((r) => `- ${r.name} (${r.category}, ${r.servings} servings)`)
          .join("\n");

        const dietaryRequirements = profiles
          .flatMap((p) => p.requirements)
          .filter((req, idx, arr) => arr.indexOf(req) === idx); // unique

        return `Analyze this meal menu for balance and dietary compatibility:

Guest Count: ${guests}
Dietary Requirements: ${dietaryRequirements.join(", ") || "none specified"}

Recipes:
${recipesSummary}

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
            <ct-vstack gap={1} style="padding: 8px;">
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
            <ct-vstack gap={1} style="padding: 8px;">
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
            <ct-vstack gap={1} style="padding: 8px;">
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
                  <ct-card style={{ padding: "8px", background: "#f9fafb" }}>
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

          {/* Recipes Section */}
          <ct-card>
            <ct-vstack gap={1} style="padding: 8px;">
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                Recipes ({recipeCount})
              </h3>
              {ifElse(
                derive(recipes, (list) => list.length === 0),
                <div style={{ fontSize: "13px", color: "#666", fontStyle: "italic" }}>
                  @ reference food-recipe patterns to add them to your meal
                </div>,
                <ct-vstack gap={1}>
                  {recipes.map((recipe) => (
                    <div
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
                        <div style={{ fontWeight: "600", fontSize: "14px" }}>
                          {recipe.name}
                        </div>
                        <div style={{ fontSize: "12px", color: "#666" }}>
                          {recipe.category} • {recipe.servings} servings
                        </div>
                      </div>
                      <ct-button
                        onClick={removeRecipe({ recipes, recipe })}
                        style={{ padding: "2px 6px", fontSize: "16px" }}
                      >
                        ×
                      </ct-button>
                    </div>
                  ))}
                </ct-vstack>,
              )}
            </ct-vstack>
          </ct-card>

          {/* Meal Balance Analysis */}
          {ifElse(
            derive(recipes, (list) => list.length > 0),
            <ct-card>
              <ct-vstack gap={1} style="padding: 8px;">
                <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                  📊 Meal Balance Analysis
                </h3>

                {ifElse(
                  analysisPending,
                  <div style={{ fontSize: "13px", color: "#666", fontStyle: "italic" }}>
                    Analyzing menu...
                  </div>,
                  <ct-vstack gap={1}>
                    {/* Category Breakdown */}
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>
                        Categories:
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {Object.entries(
                          derive(analysisResult, (r) => r.categoryBreakdown),
                        ).map(([category, count]) => (
                          <div
                            style={{
                              padding: "4px 10px",
                              background: "#e0f2fe",
                              borderRadius: "12px",
                              fontSize: "13px",
                            }}
                          >
                            {category}: {count}
                          </div>
                        ))}
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

          {/* Notes */}
          <ct-card>
            <ct-vstack gap={1} style="padding: 8px;">
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
                <li>Oven timeline visualization</li>
                <li>Production schedule generator</li>
                <li>Conflict detection and optimization</li>
              </ul>
            </div>
          </ct-card>
        </ct-vstack>
      ),
      mealName,
      mealDate,
      mealTime,
      guestCount,
      ovens,
      stovetopBurners,
      dietaryProfiles,
      recipes,
      notes,
    };
  },
);
