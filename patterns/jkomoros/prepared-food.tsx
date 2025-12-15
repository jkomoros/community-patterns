/// <cts-enable />
import {
  Cell,
  computed,
  Default,
  handler,
  NAME,
  pattern,
  str,
  UI,
} from "commontools";

interface PreparedFoodInput {
  // Basic Info
  name?: Default<string, "">;
  servings?: Default<number, 4>;
  category?: Default<string, "other">;

  // Dietary Info (user-specified since no ingredients to analyze)
  dietaryTags?: Default<string[], []>;
  primaryIngredients?: Default<string[], []>;

  // Source/Context
  description?: Default<string, "">;
  source?: Default<string, "">;

  // Optional: If it needs minimal work
  prepTime?: Default<number, 0>;
  requiresReheating?: Default<boolean, false>;

  tags?: Default<string[], []>;
}

/** Prepared food item with serving time and dietary info. #preparedFood */
interface PreparedFoodOutput extends PreparedFoodInput {
  // Provide dietary compatibility for consistency with food-recipe
  dietaryCompatibility: {
    compatible: string[];
    incompatible: string[];
    warnings: string[];
    primaryIngredients: string[];
  };
}

// Handler for adding dietary tags
const addDietaryTag = handler<
  { detail: { message: string } },
  { dietaryTags: Cell<string[]> }
>(({ detail }, { dietaryTags }) => {
  const tag = detail?.message?.trim().toLowerCase();
  if (!tag) return;

  const current = dietaryTags.get();
  if (!current.includes(tag)) {
    dietaryTags.set([...current, tag]);
  }
});

const removeDietaryTag = handler<
  unknown,
  { dietaryTags: Cell<string[]>; tag: string }
>((_event, { dietaryTags, tag }) => {
  const current = dietaryTags.get();
  dietaryTags.set(current.filter((t) => t !== tag));
});

// Handler for quick-adding dietary tags from common list
const quickAddDietaryTag = handler<
  unknown,
  { dietaryTags: Cell<string[]>; tag: string }
>((_event, { dietaryTags, tag }) => {
  const current = dietaryTags.get();
  if (!current.includes(tag)) {
    dietaryTags.set([...current, tag]);
  }
});

// Handler for adding primary ingredients
const addIngredient = handler<
  { detail: { message: string } },
  { primaryIngredients: Cell<string[]> }
>(({ detail }, { primaryIngredients }) => {
  const ingredient = detail?.message?.trim().toLowerCase();
  if (!ingredient) return;

  const current = primaryIngredients.get();
  if (!current.includes(ingredient)) {
    primaryIngredients.set([...current, ingredient]);
  }
});

const removeIngredient = handler<
  unknown,
  { primaryIngredients: Cell<string[]>; ingredient: string }
>((_event, { primaryIngredients, ingredient }) => {
  const current = primaryIngredients.get();
  primaryIngredients.set(current.filter((i) => i !== ingredient));
});

// Standard dietary tags for quick reference
const COMMON_TAGS = [
  "vegan",
  "vegetarian",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "soy-free",
  "egg-free",
  "shellfish-free",
  "pescatarian",
  "kosher",
  "halal",
  "keto",
  "low-carb",
  "low-sodium",
];

const PreparedFood = pattern<PreparedFoodInput, PreparedFoodOutput>(
  ({
    name,
    servings,
    category,
    dietaryTags,
    primaryIngredients,
    description,
    source,
    prepTime,
    requiresReheating,
    tags,
  }) => {
    const displayName = computed(() => name.trim() || "Untitled Item");

    // Derive dietary compatibility from user-provided tags
    const dietaryCompatibility = computed(() => ({
      compatible: dietaryTags || [],
      incompatible: [], // User doesn't specify what it's NOT compatible with
      warnings: [
        "User-specified tags only - not automatically analyzed",
      ],
      primaryIngredients: primaryIngredients || [],
    }));

    return {
      [NAME]: str`🛒 ${displayName}`,
      [UI]: (
        <ct-vstack gap={1} style="padding: 8px; max-width: 700px;">
          {/* Header */}
          <div>
            <h1 style={{ margin: "0 0 2px 0", fontSize: "20px", fontWeight: "700" }}>
              {displayName}
            </h1>
            <div style={{ fontSize: "13px", color: "#666" }}>
              Prepared food (store-bought, guest-brought, or takeout)
            </div>
          </div>

          {/* Basic Info */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                Basic Info
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Name
                  </label>
                  <ct-input
                    $value={name}
                    placeholder="e.g., Costco Rotisserie Chicken"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Source
                  </label>
                  <ct-input
                    $value={source}
                    placeholder="e.g., Costco, Aunt Mary, Whole Foods"
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
                    Category
                  </label>
                  <ct-select
                    $value={category}
                    items={[
                      { label: "Appetizer", value: "appetizer" },
                      { label: "Main", value: "main" },
                      { label: "Side", value: "side" },
                      { label: "Starch", value: "starch" },
                      { label: "Vegetable", value: "vegetable" },
                      { label: "Dessert", value: "dessert" },
                      { label: "Bread", value: "bread" },
                      { label: "Other", value: "other" },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                  Description
                </label>
                <ct-input
                  $value={description}
                  placeholder="e.g., Whole roasted chicken, ready to serve"
                />
              </div>
            </ct-vstack>
          </ct-card>

          {/* Dietary Tags */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                Dietary Compatibility
              </h3>

              <div style={{ fontSize: "13px", color: "#666", marginBottom: "8px" }}>
                Add tags to indicate dietary compatibility (e.g., vegan, gluten-free, nut-free)
              </div>

              {/* Common tags quick-add */}
              <div>
                <div style={{ fontSize: "12px", fontWeight: "500", marginBottom: "4px", color: "#666" }}>
                  Common tags:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
                  {COMMON_TAGS.map((tag) => (
                    <button
                      onClick={quickAddDietaryTag({ dietaryTags, tag })}
                      style={{
                        padding: "2px 8px",
                        background: "#f3f4f6",
                        border: "1px solid #d1d5db",
                        borderRadius: "12px",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Current tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                {dietaryTags.map((tag) => (
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
                    <span>{tag}</span>
                    <button
                      onClick={removeDietaryTag({ dietaryTags, tag })}
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

              {/* Custom tag input */}
              <ct-message-input
                placeholder="Add custom dietary tag..."
                appearance="rounded"
                onct-send={addDietaryTag({ dietaryTags })}
              />
            </ct-vstack>
          </ct-card>

          {/* Primary Ingredients */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                Main Ingredients
              </h3>

              <div style={{ fontSize: "13px", color: "#666", marginBottom: "8px" }}>
                List main ingredients for "no-X" matching (e.g., chicken, mushrooms, cilantro)
              </div>

              {/* Current ingredients */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                {primaryIngredients.map((ingredient) => (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 8px",
                      background: "#fef3c7",
                      borderRadius: "12px",
                      fontSize: "13px",
                    }}
                  >
                    <span>{ingredient}</span>
                    <button
                      onClick={removeIngredient({ primaryIngredients, ingredient })}
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

              {/* Add ingredient input */}
              <ct-message-input
                placeholder="Add main ingredient..."
                appearance="rounded"
                onct-send={addIngredient({ primaryIngredients })}
              />
            </ct-vstack>
          </ct-card>

          {/* Prep Details */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600" }}>
                Prep Details (Optional)
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Prep Time (min)
                  </label>
                  <ct-input
                    type="number"
                    $value={str`${prepTime}`}
                    min="0"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "500" }}>
                    <ct-checkbox $checked={requiresReheating} />
                    Requires Reheating
                  </label>
                </div>
              </div>
            </ct-vstack>
          </ct-card>
        </ct-vstack>
      ),
      name,
      servings,
      category,
      dietaryTags,
      primaryIngredients,
      description,
      source,
      prepTime,
      requiresReheating,
      tags,
      dietaryCompatibility,
    };
  },
);

export default PreparedFood;
