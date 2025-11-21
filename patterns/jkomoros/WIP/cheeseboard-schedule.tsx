/// <cts-enable />
import { Cell, computed, Default, fetchData, handler, lift, NAME, pattern, UI } from "commontools";

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

interface Pizza {
  date: string;
  description: string;
  ingredients: Ingredient[];
}

interface CheeseboardScheduleInput {
  preferences: Cell<Default<IngredientPreference[], []>>;
}

interface CheeseboardScheduleOutput {
  preferences: Cell<IngredientPreference[]>;
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
 * Parse pizza description into individual ingredients
 */
function parseIngredients(description: string): Ingredient[] {
  // Split on common delimiters: commas, "and", "with"
  // But be careful not to split on "and" within compound ingredients
  const parts = description
    .split(/,|\s+and\s+|\s+with\s+/)
    .map(part => part.trim())
    .filter(part => part.length > 0);

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

// ============================================================================
// PATTERN
// ============================================================================

export default pattern<CheeseboardScheduleInput, CheeseboardScheduleOutput>(
  ({ preferences }) => {
    // Fetch pizza schedule
    const cheeseBoardUrl = "https://cheeseboardcollective.coop/home/pizza/pizza-schedule/";
    const { result } = fetchData<WebReadResult>({
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
            {pizzaList.map((pizza) => (
              <div style={{
                marginBottom: "1.5rem",
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px"
              }}>
                <h3 style={{ margin: "0 0 0.5rem 0" }}>{pizza.date}</h3>
                <p style={{ margin: "0 0 0.5rem 0", color: "#666" }}>
                  {pizza.description}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {pizza.ingredients.map((ing) => (
                    <span style={{
                      padding: "0.25rem 0.5rem",
                      backgroundColor: "#f0f0f0",
                      borderRadius: "4px",
                      fontSize: "0.9rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem"
                    }}>
                      <span>{ing.raw}</span>
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
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
      preferences,
    };
  }
);
