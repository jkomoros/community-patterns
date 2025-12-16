/// <cts-enable />
import { Cell, computed, Default, fetchData, handler, ifElse, lift, NAME, pattern, UI } from "commontools";

// ct-loader is a Web Component for showing loading spinners
// Properties: size="sm"|"md"|"lg", show-elapsed (boolean attr), show-stop (boolean attr)
// Events: ct-stop (fired when stop button clicked)

/**
 * Cheeseboard Pizza Schedule with Ingredient Preferences
 *
 * Fetches the Cheeseboard pizza schedule, parses ingredients,
 * allows thumbs up/down on each ingredient, tracks preferences,
 * and ranks pizzas based on liked/disliked ingredients.
 */

// ============================================================================
// TYPES
// ============================================================================

interface IngredientPreference {
  ingredient: string;  // Normalized name
  preference: "liked" | "disliked";
}

interface Ingredient {
  raw: string;
  normalized: string;
}

interface IngredientWithPref extends Ingredient {
  hasPreference: boolean;
}

interface Pizza {
  date: string;
  description: string;
  ingredients: Ingredient[];
}

interface PizzaWithPrefs {
  date: string;
  description: string;
  ingredients: IngredientWithPref[];
}

interface HistoricalPizza {
  date: string;
  description: string;
  ingredients: Ingredient[];
  ate: "yes" | "no" | "unknown";  // Track if user ate this pizza
  addedAt: string;  // ISO timestamp when added to history
}

// History is stored as object with date keys for idempotent updates
type PizzaHistory = Record<string, HistoricalPizza>;

interface CheeseboardScheduleInput {
  preferences?: Cell<Default<IngredientPreference[], []>>;
  history?: Cell<Default<PizzaHistory, {}>>;
}

/** Cheeseboard pizza schedule tracker. #cheeseboardSchedule */
interface CheeseboardScheduleOutput {
  preferences: Cell<IngredientPreference[]>;
  history: Cell<PizzaHistory>;
}

// ============================================================================
// WEB FETCH TYPES
// ============================================================================

type WebReadResult = {
  content: string;
  metadata: {
    title?: string;
    author?: string;
    date?: string;
    word_count: number;
  };
};

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

const DATE_LINE_REGEX = /^[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}$/;

/**
 * Extract pizza date/description pairs from web-read content
 * (Adapted from existing cheeseboard.tsx pattern)
 */
function extractPizzas(content: string): [date: string, description: string][] {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const pizzas: [string, string][] = [];

  for (let i = 0; i < lines.length; i++) {
    const dateLine = lines[i].trim();
    if (!DATE_LINE_REGEX.test(dateLine)) {
      continue;
    }

    let cursor = i + 1;
    while (cursor < lines.length && lines[cursor].trim() === "") {
      cursor++;
    }

    if (lines[cursor]?.trim() !== "### Pizza") {
      continue;
    }

    cursor++;
    while (cursor < lines.length && lines[cursor].trim() === "") {
      cursor++;
    }

    const descriptionLines: string[] = [];
    for (; cursor < lines.length; cursor++) {
      const current = lines[cursor].trim();
      if (
        current === "" ||
        current.startsWith("### ") ||
        DATE_LINE_REGEX.test(current)
      ) {
        break;
      }
      descriptionLines.push(current);
    }

    if (descriptionLines.length > 0) {
      pizzas.push([
        dateLine,
        descriptionLines.join(" "),
      ]);
    }
  }

  return pizzas;
}

/**
 * Normalize ingredient name for matching
 */
function normalizeIngredient(raw: string): string {
  let normalized = raw
    .toLowerCase()
    .trim()
    // Remove accents
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Strip ONLY "quality" adjectives (fresh, aged)
  normalized = normalized
    .replace(/\b(fresh|aged)\s+/g, '')
    .trim();

  // Handle specific synonyms
  const synonyms: Record<string, string> = {
    'parmigiano reggiano': 'parmesan',
    'parmesan cheese': 'parmesan',
    'sea salt': 'salt',
    'kosher salt': 'salt',
  };
  if (synonyms[normalized]) {
    normalized = synonyms[normalized];
  }

  // Singularize common plurals
  normalized = normalized
    .replace(/\b(tomato|onion|pepper|olive|mushroom|jalapeno)es\b/g, '$1')
    .replace(/\b(scallion|zucchini)s\b/g, '$1');

  return normalized;
}

/**
 * Clean up ingredient text (remove markdown, pizza names, long descriptions)
 */
function cleanIngredient(raw: string): string {
  let cleaned = raw.trim();

  // Remove markdown bolding
  cleaned = cleaned.replace(/\*\*/g, '');

  // Remove pizza name prefixes (e.g., "The Cheese Board Margherita: Organic tomato")
  cleaned = cleaned.replace(/^The Cheese Board [^:]+:\s*/i, '');

  // Remove parenthetical details (e.g., "(Golden Rule Organics)")
  cleaned = cleaned.replace(/\s*\([^)]+\)/g, '');

  // Truncate "made in..." descriptions (e.g., "fresh mozzarella made in Berkeley by Belfiore")
  cleaned = cleaned.replace(/\s+made in .*/i, '');

  return cleaned.trim();
}

/**
 * Parse pizza description into individual ingredients
 */
function parseIngredients(description: string): Ingredient[] {
  // Split on common delimiters: commas, "and", "with"
  // But be careful not to split on "and" within compound ingredients
  const parts = description
    .split(/,|\s+and\s+|\s+with\s+/)
    .map(part => cleanIngredient(part))
    .filter(part => part.length > 0);

  // If the first part has a colon, strip everything before and including the colon
  // This handles pizza name prefixes like "Our Annual Thanksgiving Mushroom Pizza: King Trumpet"
  if (parts.length > 0 && parts[0].includes(':')) {
    const colonIndex = parts[0].indexOf(':');
    parts[0] = parts[0].substring(colonIndex + 1).trim();
  }

  return parts.map(raw => ({
    raw,
    normalized: normalizeIngredient(raw),
  }));
}

/**
 * Transform fetched data into Pizza objects with parsed ingredients
 */
const createPizzaList = lift<{ result: WebReadResult }, Pizza[]>(
  ({ result }) => {
    const pairs = extractPizzas(result?.content ?? "");
    return pairs.map(([date, description]) => ({
      date,
      description,
      ingredients: parseIngredients(description),
    }));
  }
);

/**
 * Get emoji for pizza score
 */
function getScoreEmoji(score: number): string {
  if (score >= 4) return "😍";
  if (score >= 2) return "😊";
  if (score >= 0) return "😐";
  if (score >= -2) return "😕";
  return "🤢";
}

/**
 * Generate a consistent pastel color based on ingredient name hash
 * Does NOT account for preferences - use computed() inline for that
 */
function getIngredientHashColor(ingredient: string | undefined): string {
  // Fallback if ingredient is undefined
  if (!ingredient || typeof ingredient !== 'string') {
    return "#f0f0f0";
  }

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < ingredient.length; i++) {
    hash = ingredient.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate pastel colors (high lightness, medium saturation)
  const hue = Math.abs(hash % 360);
  const saturation = 45 + (Math.abs(hash) % 20); // 45-65%
  const lightness = 75 + (Math.abs(hash >> 8) % 15); // 75-90%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// ============================================================================
// HANDLERS
// ============================================================================

const togglePreference = handler<
  unknown,
  { preferences: Cell<IngredientPreference[]>; ingredient: string; preference: "liked" | "disliked" }
>((_event, { preferences, ingredient, preference }) => {
  const current = preferences.get();
  const existingIndex = current.findIndex(p => p.ingredient === ingredient);

  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    if (existing.preference === preference) {
      // Clicking same button - remove preference
      preferences.set(current.toSpliced(existingIndex, 1));
    } else {
      // Clicking opposite button - switch preference
      const updated = [...current];
      updated[existingIndex] = { ingredient, preference };
      preferences.set(updated);
    }
  } else {
    // New preference
    preferences.set([...current, { ingredient, preference }]);
  }
});

const removePreference = handler<
  unknown,
  { preferences: Cell<IngredientPreference[]>; ingredient: string }
>((_event, { preferences, ingredient }) => {
  const current = preferences.get();
  preferences.set(current.filter(p => p.ingredient !== ingredient));
});

// Handler to mark if user ate a pizza (works with object-based history)
const markAte = handler<
  unknown,
  { history: Cell<PizzaHistory>; date: string; ate: "yes" | "no" }
>((_event, { history, date, ate }) => {
  const pizza = history.key(date).get();
  if (pizza) {
    history.key(date).set({ ...pizza, ate });
  }
});

// Handler to remove a pizza from history (works with object-based history)
const removeFromHistory = handler<
  unknown,
  { history: Cell<PizzaHistory>; date: string }
>((_event, { history, date }) => {
  // Set to undefined to remove the key
  history.key(date).set(undefined as any);
});

// ============================================================================
// PATTERN
// ============================================================================

const CheeseboardSchedule = pattern<CheeseboardScheduleInput, CheeseboardScheduleOutput>(
  ({ preferences, history }) => {
    // Fetch pizza schedule
    const cheeseBoardUrl = "https://cheeseboardcollective.coop/home/pizza/pizza-schedule/";
    const { result, pending } = fetchData<WebReadResult>({
      url: "/api/agent-tools/web-read",
      mode: "json",
      options: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          url: cheeseBoardUrl,
          max_tokens: 4000,
        },
      },
    });

    // Parse pizzas with ingredients
    const pizzaList = createPizzaList({ result });

    // Auto-sync fetched pizzas to history (idempotent side effect)
    // This computed has a side effect but is safe because:
    // 1. We check if key exists before writing (skip if already present)
    // 2. We use history.key(date).set() for individual updates (preserves tracking)
    // 3. The operation is idempotent - running N times = same result as once
    computed(() => {
      // pizzaList is from lift() - use directly, not .get()
      if (!pizzaList || pizzaList.length === 0) return;

      for (const pizza of pizzaList) {
        const key = pizza.date;

        // CRITICAL: Check if already exists - skip to maintain idempotency
        if (history.key(key).get()) continue;

        // Only set on first encounter
        history.key(key).set({
          date: pizza.date,
          description: pizza.description,
          ingredients: [...pizza.ingredients],
          ate: "unknown",
          addedAt: new Date().toISOString(),
        });
      }
    });

    // Create lists for liked and disliked preferences
    const likedPrefs = computed(() => {
      return preferences.get().filter(p => p.preference === "liked");
    });

    const dislikedPrefs = computed(() => {
      return preferences.get().filter(p => p.preference === "disliked");
    });

    return {
      [NAME]: "Cheeseboard Schedule",
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "800px" }}>
          <h2>Cheeseboard Pizza Schedule</h2>
          <p>
            <a
              href={cheeseBoardUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {cheeseBoardUrl}
            </a>
          </p>

          <div style={{ marginTop: "1.5rem" }}>
            {ifElse(
              pending,
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem", justifyContent: "center" }}>
                <ct-loader show-elapsed></ct-loader>
                <span style={{ color: "#666" }}>Fetching pizza schedule...</span>
              </div>,
              null
            )}
            {pizzaList.map((pizza) => {
              // Calculate score for this pizza
              const score = computed(() => {
                const prefs = preferences.get();
                const likedSet = new Set(prefs.filter(p => p.preference === "liked").map(p => p.ingredient));
                const dislikedSet = new Set(prefs.filter(p => p.preference === "disliked").map(p => p.ingredient));

                let total = 0;
                for (const ing of pizza.ingredients) {
                  if (likedSet.has(ing.normalized)) total += 1;
                  if (dislikedSet.has(ing.normalized)) total -= 2;
                }
                return total;
              });

              const emoji = computed(() => getScoreEmoji(score));

              return (
                <div style={{
                  marginBottom: "1.5rem",
                  padding: "1rem",
                  border: "1px solid #ddd",
                  borderRadius: "8px"
                }}>
                  <h3 style={{ margin: "0 0 0.5rem 0" }}>
                    {pizza.date}
                    <span style={{ marginLeft: "0.5rem", fontSize: "1.2rem" }}>
                      {emoji} ({score >= 0 ? "+" : ""}{score})
                    </span>
                  </h3>
                <p style={{ margin: "0 0 0.5rem 0", color: "#666" }}>
                  {pizza.description}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {pizza.ingredients.map((ing) => {
                    // Check if this ingredient has a preference
                    const hasPreference = computed(() => {
                      const prefs = preferences.get();
                      return prefs.some(p => p.ingredient === ing.normalized);
                    });

                    // Compute entire style object based on preferences
                    const badgeStyle = computed(() => {
                      const prefs = preferences.get();
                      const pref = prefs.find(p => p.ingredient === ing.normalized);

                      let backgroundColor: string;
                      let color: string;

                      if (pref) {
                        // Bright green for liked, bright red for disliked (with white text)
                        backgroundColor = pref.preference === "liked" ? "#28a745" : "#dc3545";
                        color = "#ffffff";
                      } else {
                        // Otherwise use hash-based pastel color (with black text)
                        backgroundColor = getIngredientHashColor(ing.normalized);
                        color = "#000000";
                      }

                      return {
                        padding: "0.25rem 0.5rem",
                        backgroundColor,
                        color,
                        borderRadius: "4px",
                        fontSize: "0.9rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem"
                      };
                    });

                    return (
                      <span style={badgeStyle}>
                        <span>{ing.raw}</span>
                        {ifElse(
                          hasPreference,
                          null,
                          <>
                            <button
                              onClick={togglePreference({ preferences, ingredient: ing.normalized, preference: "liked" })}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: "0",
                                fontSize: "1rem"
                              }}
                            >
                              👍
                            </button>
                            <button
                              onClick={togglePreference({ preferences, ingredient: ing.normalized, preference: "disliked" })}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: "0",
                                fontSize: "1rem"
                              }}
                            >
                              👎
                            </button>
                          </>
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* Pizzas are automatically added to history on fetch */}
              </div>
              );
            })}
          </div>

          {/* Preferences List */}
          <div style={{
            marginTop: "2rem",
            padding: "1rem",
            border: "1px solid #ddd",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9"
          }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>Your Preferences</h3>

            {/* Liked Ingredients */}
            <div style={{ marginBottom: "1rem" }}>
              <strong style={{ display: "block", marginBottom: "0.5rem" }}>Liked:</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {likedPrefs.map(pref => (
                  <span style={{
                    padding: "0.25rem 0.5rem",
                    backgroundColor: "#d4edda",
                    borderRadius: "4px",
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    color: "#155724"
                  }}>
                    <span>{pref.ingredient}</span>
                    <button
                      onClick={removePreference({ preferences, ingredient: pref.ingredient })}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "0",
                        fontSize: "0.9rem",
                        color: "#721c24",
                        fontWeight: "bold"
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {ifElse(
                  likedPrefs.length === 0,
                  <span style={{ color: "#999", fontStyle: "italic" }}>No liked ingredients yet</span>,
                  null
                )}
              </div>
            </div>

            {/* Disliked Ingredients */}
            <div>
              <strong style={{ display: "block", marginBottom: "0.5rem" }}>Disliked:</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {dislikedPrefs.map(pref => (
                  <span style={{
                    padding: "0.25rem 0.5rem",
                    backgroundColor: "#f8d7da",
                    borderRadius: "4px",
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    color: "#721c24"
                  }}>
                    <span>{pref.ingredient}</span>
                    <button
                      onClick={removePreference({ preferences, ingredient: pref.ingredient })}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "0",
                        fontSize: "0.9rem",
                        color: "#721c24",
                        fontWeight: "bold"
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {ifElse(
                  dislikedPrefs.length === 0,
                  <span style={{ color: "#999", fontStyle: "italic" }}>No disliked ingredients yet</span>,
                  null
                )}
              </div>
            </div>
          </div>

          {/* Pizza History */}
          <details style={{
            marginTop: "2rem",
            padding: "1rem",
            border: "1px solid #ddd",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9"
          }}>
            <summary style={{ cursor: "pointer", fontWeight: "600", fontSize: "1.1rem" }}>
              Pizza History ({computed(() => Object.keys(history.get()).length)} pizzas)
            </summary>

            <div style={{ marginTop: "1rem" }}>
              {computed(() => {
                const historyObj = history.get();
                const historyList = Object.values(historyObj).filter((p): p is HistoricalPizza => p != null);

                if (historyList.length === 0) {
                  return (
                    <p style={{ color: "#666", fontStyle: "italic" }}>
                      No pizzas in history yet. Pizzas are automatically added when fetched.
                    </p>
                  );
                }

                // Sort by date (newest first) for display
                const sorted = [...historyList].sort((a, b) => {
                  // Parse dates like "Wed Dec 4" - compare by addedAt as fallback
                  return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
                });

                return sorted.map((pizza) => {
                  // Calculate score for historical pizza
                  const score = computed(() => {
                    const prefs = preferences.get();
                    const likedSet = new Set(prefs.filter(p => p.preference === "liked").map(p => p.ingredient));
                    const dislikedSet = new Set(prefs.filter(p => p.preference === "disliked").map(p => p.ingredient));

                    let total = 0;
                    for (const ing of pizza.ingredients) {
                      if (likedSet.has(ing.normalized)) total += 1;
                      if (dislikedSet.has(ing.normalized)) total -= 2;
                    }
                    return total;
                  });

                  const emoji = computed(() => getScoreEmoji(score));

                  return (
                    <div style={{
                      marginBottom: "1rem",
                      padding: "0.75rem",
                      border: "1px solid #ddd",
                      borderRadius: "6px",
                      backgroundColor: "#fff"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <h4 style={{ margin: "0", fontSize: "1rem" }}>
                          {pizza.date}
                          <span style={{ marginLeft: "0.5rem", fontSize: "1rem" }}>
                            {emoji} ({score >= 0 ? "+" : ""}{score})
                          </span>
                        </h4>
                        <button
                          onClick={removeFromHistory({ history, date: pizza.date })}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "1rem",
                            color: "#dc3545",
                            fontWeight: "bold"
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "#666" }}>
                        {pizza.description}
                      </p>

                      {/* Ingredients */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
                        {pizza.ingredients.map((ing) => {
                          const badgeStyle = computed(() => {
                            const prefs = preferences.get();
                            const pref = prefs.find(p => p.ingredient === ing.normalized);

                            let backgroundColor: string;
                            let color: string;

                            if (pref) {
                              backgroundColor = pref.preference === "liked" ? "#28a745" : "#dc3545";
                              color = "#ffffff";
                            } else {
                              backgroundColor = getIngredientHashColor(ing.normalized);
                              color = "#000000";
                            }

                            return {
                              padding: "0.2rem 0.4rem",
                              backgroundColor,
                              color,
                              borderRadius: "3px",
                              fontSize: "0.8rem"
                            };
                          });

                          return <span style={badgeStyle}>{ing.raw}</span>;
                        })}
                      </div>

                      {/* Did you eat this? */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.85rem", color: "#666" }}>Did you eat this?</span>
                        <button
                          onClick={markAte({ history, date: pizza.date, ate: "yes" })}
                          style={{
                            padding: "0.2rem 0.5rem",
                            fontSize: "0.8rem",
                            border: "1px solid #28a745",
                            borderRadius: "4px",
                            background: pizza.ate === "yes" ? "#28a745" : "white",
                            color: pizza.ate === "yes" ? "white" : "#28a745",
                            cursor: "pointer",
                            fontWeight: pizza.ate === "yes" ? "bold" : "normal"
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={markAte({ history, date: pizza.date, ate: "no" })}
                          style={{
                            padding: "0.2rem 0.5rem",
                            fontSize: "0.8rem",
                            border: "1px solid #dc3545",
                            borderRadius: "4px",
                            background: pizza.ate === "no" ? "#dc3545" : "white",
                            color: pizza.ate === "no" ? "white" : "#dc3545",
                            cursor: "pointer",
                            fontWeight: pizza.ate === "no" ? "bold" : "normal"
                          }}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  );
                });
              })}
            </div>
          </details>
        </div>
      ),
      preferences,
      history,
    };
  }
);

export default CheeseboardSchedule;
