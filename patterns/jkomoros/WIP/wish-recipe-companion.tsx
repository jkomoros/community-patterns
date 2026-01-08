/// <cts-enable />
import {
  Writable,
  computed,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  wish,
} from "commontools";

/**
 * Adaptive Recipe Companion
 *
 * Demonstrates the new open-ended wish() capability.
 * Takes a food description and user preferences, then wishes for
 * a complementary recipe that pairs well with it.
 *
 * The wish() call uses AI to:
 * 1. Search the pattern index for food/recipe patterns
 * 2. Find and run an appropriate pattern
 * 3. Return the result dynamically
 */

interface IngredientPreference {
  ingredient: string;
  preference: "liked" | "disliked";
}

interface RecipeCompanionInput {
  foodDescription: Default<string, "a cheese pizza with tomatoes, basil, and mozzarella">;
  preferences: Default<IngredientPreference[], []>;
}

const updateFood = handler<
  { detail: { message: string } },
  { foodDescription: Writable<string> }
>((event, { foodDescription }) => {
  const newDesc = event.detail?.message?.trim();
  if (newDesc) {
    foodDescription.set(newDesc);
  }
});

const addPreference = handler<
  { detail: { message: string } },
  { preferences: Writable<IngredientPreference[]>; type: "liked" | "disliked" }
>((event, { preferences, type }) => {
  const ingredient = event.detail?.message?.trim().toLowerCase();
  if (ingredient) {
    const current = preferences.get();
    // Remove if exists, then add with new preference
    const filtered = current.filter(p => p.ingredient !== ingredient);
    preferences.set([...filtered, { ingredient, preference: type }]);
  }
});

const removePreference = handler<
  unknown,
  { preferences: Writable<IngredientPreference[]>; ingredient: string }
>((_event, { preferences, ingredient }) => {
  const current = preferences.get();
  preferences.set(current.filter(p => p.ingredient !== ingredient));
});

export default pattern<RecipeCompanionInput>(({ foodDescription, preferences }) => {
  // Filter preferences into liked and disliked for display
  // Use preferences directly (framework unwraps) and derive for reactive filtering
  const likedPrefs = derive(preferences, (prefs) =>
    prefs.filter(p => p.preference === "liked")
  );

  const dislikedPrefs = derive(preferences, (prefs) =>
    prefs.filter(p => p.preference === "disliked")
  );

  // Build the wish query dynamically using derive
  // Note: Inside derive callback, we get plain JS values, so avoid .map() to prevent framework transformation
  const wishQuery = derive({ foodDescription, preferences }, ({ foodDescription: food, preferences: prefs }) => {
    // Use reduce instead of filter().map() to avoid framework .mapWithPattern transformation
    const liked: string[] = [];
    const disliked: string[] = [];
    for (const p of prefs) {
      if (p.preference === "liked") liked.push(p.ingredient);
      else if (p.preference === "disliked") disliked.push(p.ingredient);
    }

    let query = `Suggest a recipe that complements: "${food}"`;
    if (liked.length > 0) {
      query += `. I especially like: ${liked.join(", ")}`;
    }
    if (disliked.length > 0) {
      query += `. Please avoid: ${disliked.join(", ")}`;
    }
    return query;
  });

  // The magic: wish() with an open-ended query
  // This will launch suggestion.tsx which uses AI to find/run appropriate patterns
  const companionRecipe = wish<{ cell: Writable<any> }>({
    query: wishQuery,
    context: {
      mainDish: foodDescription,
      preferences: preferences,
    },
  });

  return {
    [NAME]: derive(foodDescription, (food) => `Recipe Companion: ${food.slice(0, 30)}...`),
    [UI]: (
      <div style={{ padding: "1rem", maxWidth: "800px" }}>
        <h2>Adaptive Recipe Companion</h2>
        <p style={{ color: "#666", marginBottom: "1rem" }}>
          Describe what you're eating, and I'll suggest a complementary recipe using AI-powered pattern discovery.
        </p>

        {/* Main dish input */}
        <div style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          border: "1px solid #ddd",
          borderRadius: "8px",
        }}>
          <h3 style={{ margin: "0 0 0.5rem 0" }}>What are you eating?</h3>
          <ct-message-input
            placeholder="Describe your main dish..."
            onct-send={updateFood({ foodDescription })}
          />
          <div style={{
            marginTop: "0.5rem",
            padding: "0.5rem",
            backgroundColor: "#f5f5f5",
            borderRadius: "4px",
          }}>
            <strong>Current:</strong> {foodDescription}
          </div>
        </div>

        {/* Preferences */}
        <div style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          border: "1px solid #ddd",
          borderRadius: "8px",
        }}>
          <h3 style={{ margin: "0 0 0.5rem 0" }}>Your Preferences</h3>

          <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "0.25rem", color: "#28a745" }}>
                Add liked ingredient:
              </label>
              <ct-message-input
                placeholder="e.g., garlic"
                onct-send={addPreference({ preferences, type: "liked" })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "0.25rem", color: "#dc3545" }}>
                Add disliked ingredient:
              </label>
              <ct-message-input
                placeholder="e.g., cilantro"
                onct-send={addPreference({ preferences, type: "disliked" })}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "2rem" }}>
            {/* Liked */}
            <div>
              <strong style={{ color: "#28a745" }}>Liked:</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.25rem" }}>
                {likedPrefs.map(pref => (
                  <span style={{
                    padding: "0.25rem 0.5rem",
                    backgroundColor: "#d4edda",
                    borderRadius: "4px",
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}>
                    {pref.ingredient}
                    <button
                      onClick={removePreference({ preferences, ingredient: pref.ingredient })}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#721c24",
                        fontWeight: "bold",
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {ifElse(
                  derive(likedPrefs, (prefs) => prefs.length === 0),
                  <span style={{ color: "#999", fontStyle: "italic" }}>None</span>,
                  null
                )}
              </div>
            </div>

            {/* Disliked */}
            <div>
              <strong style={{ color: "#dc3545" }}>Disliked:</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.25rem" }}>
                {dislikedPrefs.map(pref => (
                  <span style={{
                    padding: "0.25rem 0.5rem",
                    backgroundColor: "#f8d7da",
                    borderRadius: "4px",
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}>
                    {pref.ingredient}
                    <button
                      onClick={removePreference({ preferences, ingredient: pref.ingredient })}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#721c24",
                        fontWeight: "bold",
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {ifElse(
                  derive(dislikedPrefs, (prefs) => prefs.length === 0),
                  <span style={{ color: "#999", fontStyle: "italic" }}>None</span>,
                  null
                )}
              </div>
            </div>
          </div>
        </div>

        {/* The wish query being sent */}
        <div style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          backgroundColor: "#e7f3ff",
          border: "1px solid #b3d7ff",
          borderRadius: "8px",
        }}>
          <h3 style={{ margin: "0 0 0.5rem 0" }}>AI Query</h3>
          <p style={{ margin: 0, fontStyle: "italic", color: "#0056b3" }}>
            {wishQuery}
          </p>
        </div>

        {/* Companion Recipe Result */}
        <div style={{
          padding: "1rem",
          border: "2px solid #28a745",
          borderRadius: "8px",
          backgroundColor: "#f8fff8",
        }}>
          <h3 style={{ margin: "0 0 1rem 0", color: "#28a745" }}>
            Suggested Companion Recipe
          </h3>
          <ct-cell-context $cell={companionRecipe} label="Companion Recipe">
            {derive(companionRecipe, (r) => {
              if (!r) return <span style={{ color: "#666" }}>Searching for recipes...</span>;
              if (r.error) return <span style={{ color: "#dc3545" }}>Error: {r.error}</span>;
              // The result should contain the dynamically created/found pattern
              return r.result ?? r;
            })}
          </ct-cell-context>
        </div>
      </div>
    ),
    foodDescription,
    preferences,
    companionRecipe,
    wishQuery,
  };
});
