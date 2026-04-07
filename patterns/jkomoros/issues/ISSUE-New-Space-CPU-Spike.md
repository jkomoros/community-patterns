# Issue: Deno Process Pegs at 100% CPU for Minutes When Deploying Pattern to New Space

## Summary

When deploying a pattern to a **new space** and visiting it for the first time, the deno dev server process spikes to 100% CPU and stays there for **several minutes** before settling. The page itself loads and is interactive during this time. Subsequent page refreshes recover much faster (seconds, not minutes).

## Reproduction Steps

1. Deploy a pattern to a **new** space:
   ```bash
   deno task ct charm new pattern.tsx --space NEW-SPACE-NAME --api-url http://localhost:8000 --identity claude.key
   ```

2. Navigate to the pattern URL in browser

3. Observe: Deno process pegs at 100% CPU for 2-5 minutes

4. After settling, refresh the page - recovery is much faster (seconds)

## Pattern Used for Reproduction

`patterns/jkomoros/WIP/cheeseboard-schedule.tsx` (an older WIP version, not the current tracked one).

<details>
<summary>Full pattern source (click to expand)</summary>

```tsx
/// <cts-enable />
import {
  Cell,
  computed,
  Default,
  fetchData,
  handler,
  ifElse,
  lift,
  NAME,
  pattern,
  UI,
} from "commontools";

// ============================================================================
// Types (from spec's Interface section)
// ============================================================================

interface IngredientPreference {
  ingredient: string; // normalized ingredient name
  status: "liked" | "disliked";
}

interface Ingredient {
  raw: string;
  normalized: string;
}

interface HistoricalPizza {
  date: string;
  description: string;
  ingredients: Ingredient[];
  ate: "yes" | "no" | "unknown";
}

interface Pizza {
  date: string;
  description: string;
  ingredients: Ingredient[];
}

interface CheeseboardInput {
  preferences: Cell<Default<IngredientPreference[], []>>;
  history: Cell<Default<HistoricalPizza[], []>>;
}

interface CheeseboardOutput {
  preferences: Cell<IngredientPreference[]>;
  history: Cell<HistoricalPizza[]>;
}

// Web-read API response type
interface WebReadResult {
  content: string;
  metadata: {
    title?: string;
    word_count: number;
  };
}

// ============================================================================
// Parsing Functions
// ============================================================================

const DATE_LINE_REGEX = /^[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}$/;

// Extract pizza date/description pairs from web-read content
function extractPizzas(content: string): [date: string, description: string][] {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const pizzas: [string, string][] = [];

  for (let i = 0; i < lines.length; i++) {
    const dateLine = lines[i].trim();
    if (!DATE_LINE_REGEX.test(dateLine)) continue;

    let cursor = i + 1;
    while (cursor < lines.length && lines[cursor].trim() === "") cursor++;

    if (lines[cursor]?.trim() !== "### Pizza") continue;

    cursor++;
    while (cursor < lines.length && lines[cursor].trim() === "") cursor++;

    const descriptionLines: string[] = [];
    for (; cursor < lines.length; cursor++) {
      const current = lines[cursor].trim();
      if (current === "" || current.startsWith("### ") || DATE_LINE_REGEX.test(current)) break;
      descriptionLines.push(current);
    }

    if (descriptionLines.length > 0) {
      pizzas.push([dateLine, descriptionLines.join(" ")]);
    }
  }

  return pizzas;
}

// Normalize ingredient name for matching (from spec: strips prefixes, handles plurals)
function normalizeIngredient(raw: string): string {
  let normalized = raw
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Strip quality adjectives (fresh, aged)
  normalized = normalized.replace(/\b(fresh|aged)\s+/g, "").trim();

  // Handle synonyms
  const synonyms: Record<string, string> = {
    "parmigiano reggiano": "parmesan",
    "parmesan cheese": "parmesan",
    "sea salt": "salt",
    "kosher salt": "salt",
  };
  if (synonyms[normalized]) normalized = synonyms[normalized];

  // Singularize common plurals
  normalized = normalized
    .replace(/\b(tomato|onion|pepper|olive|mushroom|jalapeno)es\b/g, "$1")
    .replace(/\b(scallion|zucchini)s\b/g, "$1");

  return normalized;
}

// Clean ingredient text
function cleanIngredient(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/\*\*/g, "");
  cleaned = cleaned.replace(/^The Cheese Board [^:]+:\s*/i, "");
  cleaned = cleaned.replace(/\s*\([^)]+\)/g, "");
  cleaned = cleaned.replace(/\s+made in .*/i, "");
  return cleaned.trim();
}

// Parse pizza description into individual ingredients
function parseIngredients(description: string): Ingredient[] {
  const parts = description
    .split(/,|\s+and\s+|\s+with\s+/)
    .map((part) => cleanIngredient(part))
    .filter((part) => part.length > 0);

  if (parts.length > 0 && parts[0].includes(":")) {
    const colonIndex = parts[0].indexOf(":");
    parts[0] = parts[0].substring(colonIndex + 1).trim();
  }

  return parts.map((raw) => ({
    raw,
    normalized: normalizeIngredient(raw),
  }));
}

// Transform fetched data into Pizza objects
const createPizzaList = lift<{ result: WebReadResult }, Pizza[]>(({ result }) => {
  const pairs = extractPizzas(result?.content ?? "");
  return pairs.map(([date, description]) => ({
    date,
    description,
    ingredients: parseIngredients(description),
  }));
});

// ============================================================================
// Helper Functions
// ============================================================================

// Get score emoji based on score value (from spec)
function getScoreEmoji(score: number): string {
  if (score >= 4) return "😍";
  if (score >= 2) return "😊";
  if (score >= 0) return "😐";
  if (score >= -2) return "😕";
  return "🤢";
}

// Generate pastel color from ingredient name hash
function getIngredientHashColor(ingredient: string): string {
  if (!ingredient) return "#f0f0f0";
  let hash = 0;
  for (let i = 0; i < ingredient.length; i++) {
    hash = ingredient.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const saturation = 45 + (Math.abs(hash) % 20);
  const lightness = 75 + (Math.abs(hash >> 8) % 15);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// ============================================================================
// Handlers
// ============================================================================

const togglePreference = handler<
  unknown,
  { preferences: Cell<IngredientPreference[]>; ingredient: string; status: "liked" | "disliked" }
>((_event, { preferences, ingredient, status }) => {
  const current = preferences.get();
  const existingIndex = current.findIndex((p) => p.ingredient === ingredient);

  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    if (existing.status === status) {
      // Same status - remove preference (toggle off)
      preferences.set(current.toSpliced(existingIndex, 1));
    } else {
      // Different status - switch preference
      const updated = [...current];
      updated[existingIndex] = { ingredient, status };
      preferences.set(updated);
    }
  } else {
    // New preference
    preferences.set([...current, { ingredient, status }]);
  }
});

const removePreference = handler<
  unknown,
  { preferences: Cell<IngredientPreference[]>; ingredient: string }
>((_event, { preferences, ingredient }) => {
  const current = preferences.get();
  preferences.set(current.filter((p) => p.ingredient !== ingredient));
});

const addToHistory = handler<
  unknown,
  { history: Cell<HistoricalPizza[]>; pizza: Pizza }
>((_event, { history, pizza }) => {
  const current = history.get();
  if (current.some((p) => p.date === pizza.date)) return;

  history.set([
    {
      date: pizza.date,
      description: pizza.description,
      ingredients: [...pizza.ingredients],
      ate: "unknown",
    },
    ...current,
  ]);
});

const markAte = handler<
  unknown,
  { history: Cell<HistoricalPizza[]>; date: string; ate: "yes" | "no" }
>((_event, { history, date, ate }) => {
  const current = history.get();
  history.set(current.map((p) => (p.date === date ? { ...p, ate } : p)));
});

const removeFromHistory = handler<
  unknown,
  { history: Cell<HistoricalPizza[]>; date: string }
>((_event, { history, date }) => {
  const current = history.get();
  history.set(current.filter((p) => p.date !== date));
});

// ============================================================================
// Pattern
// ============================================================================

export default pattern<CheeseboardInput, CheeseboardOutput>(({ preferences, history }) => {
  // Fetch pizza schedule via web-read API
  const cheeseBoardUrl = "https://cheeseboardcollective.coop/home/pizza/pizza-schedule/";
  const { result, pending } = fetchData<WebReadResult>({
    url: "/api/agent-tools/web-read",
    mode: "json",
    options: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { url: cheeseBoardUrl, max_tokens: 4000 },
    },
  });

  // Parse pizzas with ingredients
  const pizzaList = createPizzaList({ result });

  // Create lists for liked and disliked preferences
  const likedPrefs = computed(() => preferences.get().filter((p) => p.status === "liked"));
  const dislikedPrefs = computed(() => preferences.get().filter((p) => p.status === "disliked"));

  return {
    [NAME]: "Cheeseboard Pizza Schedule",
    [UI]: (
      <div style={{ padding: "1rem", maxWidth: "800px", fontFamily: "system-ui, sans-serif" }}>
        {/* Header */}
        <h2>Cheeseboard Pizza Schedule</h2>
        <p>
          <a href={cheeseBoardUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#007bff" }}>
            View source website
          </a>
        </p>

        {/* Loading State */}
        <div style={{ marginTop: "1.5rem" }}>
          {ifElse(
            pending,
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem", justifyContent: "center" }}>
              <ct-loader show-elapsed></ct-loader>
              <span style={{ color: "#666" }}>Fetching pizza schedule...</span>
            </div>,
            null
          )}

          {/* Pizza List */}
          {pizzaList.map((pizza) => {
            // Calculate score for this pizza
            const score = computed(() => {
              const prefs = preferences.get();
              const likedSet = new Set(prefs.filter((p) => p.status === "liked").map((p) => p.ingredient));
              const dislikedSet = new Set(prefs.filter((p) => p.status === "disliked").map((p) => p.ingredient));
              let total = 0;
              for (const ing of pizza.ingredients) {
                if (likedSet.has(ing.normalized)) total += 1;
                if (dislikedSet.has(ing.normalized)) total -= 2;
              }
              return total;
            });

            const emoji = computed(() => getScoreEmoji(score));

            return (
              <div style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid #ddd", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                {/* Date header with score */}
                <h3 style={{ margin: "0 0 0.5rem 0" }}>
                  {pizza.date}
                  <span style={{ marginLeft: "0.5rem", fontSize: "1.2rem" }}>
                    {emoji} ({score >= 0 ? "+" : ""}{score})
                  </span>
                </h3>

                {/* Description */}
                <p style={{ margin: "0 0 0.5rem 0", color: "#666" }}>{pizza.description}</p>

                {/* Ingredient chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {pizza.ingredients.map((ing) => {
                    const hasPreference = computed(() => preferences.get().some((p) => p.ingredient === ing.normalized));

                    const badgeStyle = computed(() => {
                      const prefs = preferences.get();
                      const pref = prefs.find((p) => p.ingredient === ing.normalized);
                      let backgroundColor: string;
                      let color: string;
                      if (pref) {
                        backgroundColor = pref.status === "liked" ? "#28a745" : "#dc3545";
                        color = "#ffffff";
                      } else {
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
                        gap: "0.25rem",
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
                              onClick={togglePreference({ preferences, ingredient: ing.normalized, status: "liked" })}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "0", fontSize: "1rem" }}
                            >
                              👍
                            </button>
                            <button
                              onClick={togglePreference({ preferences, ingredient: ing.normalized, status: "disliked" })}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "0", fontSize: "1rem" }}
                            >
                              👎
                            </button>
                          </>
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* Add to History button */}
                <div style={{ marginTop: "0.5rem" }}>
                  {computed(() => {
                    const inHistory = history.get().some((p) => p.date === pizza.date);
                    return inHistory ? (
                      <span style={{ fontSize: "0.85rem", color: "#28a745", fontWeight: "bold" }}>✓ In history</span>
                    ) : (
                      <button
                        onClick={addToHistory({ history, pizza })}
                        style={{ background: "#007bff", color: "white", border: "none", borderRadius: "4px", padding: "0.25rem 0.5rem", fontSize: "0.85rem", cursor: "pointer" }}
                      >
                        Add to History
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Preferences Section */}
        <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid #ddd", borderRadius: "8px", backgroundColor: "#f9f9f9" }}>
          <h3 style={{ margin: "0 0 1rem 0" }}>Your Preferences</h3>

          {/* Liked ingredients */}
          <div style={{ marginBottom: "1rem" }}>
            <strong style={{ display: "block", marginBottom: "0.5rem", color: "#155724" }}>Liked:</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {likedPrefs.map((pref) => (
                <span style={{ padding: "0.25rem 0.5rem", backgroundColor: "#d4edda", borderRadius: "4px", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "#155724" }}>
                  <span>{pref.ingredient}</span>
                  <button
                    onClick={removePreference({ preferences, ingredient: pref.ingredient })}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "0", fontSize: "0.9rem", color: "#721c24", fontWeight: "bold" }}
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

          {/* Disliked ingredients */}
          <div>
            <strong style={{ display: "block", marginBottom: "0.5rem", color: "#721c24" }}>Disliked:</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {dislikedPrefs.map((pref) => (
                <span style={{ padding: "0.25rem 0.5rem", backgroundColor: "#f8d7da", borderRadius: "4px", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "#721c24" }}>
                  <span>{pref.ingredient}</span>
                  <button
                    onClick={removePreference({ preferences, ingredient: pref.ingredient })}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "0", fontSize: "0.9rem", color: "#721c24", fontWeight: "bold" }}
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

        {/* History Section (collapsible) */}
        <details style={{ marginTop: "2rem", padding: "1rem", border: "1px solid #ddd", borderRadius: "8px", backgroundColor: "#f9f9f9" }}>
          <summary style={{ cursor: "pointer", fontWeight: "600", fontSize: "1.1rem" }}>
            Pizza History ({computed(() => history.get().length)} pizzas)
          </summary>

          <div style={{ marginTop: "1rem" }}>
            {computed(() => {
              const historyList = history.get();
              if (historyList.length === 0) {
                return (
                  <p style={{ color: "#666", fontStyle: "italic" }}>
                    No pizzas in history yet. Click "Add to History" on current pizzas to track them.
                  </p>
                );
              }

              return historyList.map((pizza) => {
                const score = computed(() => {
                  const prefs = preferences.get();
                  const likedSet = new Set(prefs.filter((p) => p.status === "liked").map((p) => p.ingredient));
                  const dislikedSet = new Set(prefs.filter((p) => p.status === "disliked").map((p) => p.ingredient));
                  let total = 0;
                  for (const ing of pizza.ingredients) {
                    if (likedSet.has(ing.normalized)) total += 1;
                    if (dislikedSet.has(ing.normalized)) total -= 2;
                  }
                  return total;
                });

                const emoji = computed(() => getScoreEmoji(score));

                return (
                  <div style={{ marginBottom: "1rem", padding: "0.75rem", border: "1px solid #ddd", borderRadius: "6px", backgroundColor: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <h4 style={{ margin: "0", fontSize: "1rem" }}>
                        {pizza.date}
                        <span style={{ marginLeft: "0.5rem", fontSize: "1rem" }}>
                          {emoji} ({score >= 0 ? "+" : ""}{score})
                        </span>
                      </h4>
                      <button
                        onClick={removeFromHistory({ history, date: pizza.date })}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem", color: "#dc3545", fontWeight: "bold" }}
                      >
                        ✕
                      </button>
                    </div>

                    <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "#666" }}>{pizza.description}</p>

                    {/* Ingredients */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
                      {pizza.ingredients.map((ing) => {
                        const badgeStyle = computed(() => {
                          const prefs = preferences.get();
                          const pref = prefs.find((p) => p.ingredient === ing.normalized);
                          let backgroundColor: string;
                          let color: string;
                          if (pref) {
                            backgroundColor = pref.status === "liked" ? "#28a745" : "#dc3545";
                            color = "#ffffff";
                          } else {
                            backgroundColor = getIngredientHashColor(ing.normalized);
                            color = "#000000";
                          }
                          return { padding: "0.2rem 0.4rem", backgroundColor, color, borderRadius: "3px", fontSize: "0.8rem" };
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
                          fontWeight: pizza.ate === "yes" ? "bold" : "normal",
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
                          fontWeight: pizza.ate === "no" ? "bold" : "normal",
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
});
```

</details>

## Observed Behavior

### During Initial Load (New Space)
- **CPU:** Deno process at 100% for several MINUTES
- **Page:** Loads and is interactive despite CPU spike
- **WebSockets:** Two connections - one with ~95 messages, one with ~5
- **Console:** Storage ConflictErrors (see below)

### After Settlement
- CPU returns to normal
- Interactions are reasonably fast

### On Page Refresh (Same Space)
- Deno spikes but recovers in **seconds**, not minutes
- Much faster than initial new-space load

## Console Errors

```
[WARN][storage.cache] storage Transaction failed
{name: 'ConflictError', message: 'The application/json of did:key:z6Mk...'}

[INFO][storage.cache] storage Transaction failed (already exists)
{name: 'ConflictError', message: 'The application/json of of:baedrei...'}

[WARN][storage.cache] storage Transaction failed
{name: 'ConflictError', message: 'The application/json of of:baedreic...'}
```

Multiple ConflictErrors occur during the CPU spike period.

## WebSocket Activity

Two websocket connections observed:
- **Primary:** ~95 messages (some very long - will attach separately)
- **Secondary:** ~5 messages

See: `ISSUE-New-Space-CPU-Spike-websocket-log.txt` (583KB)

## Key Observation

The difference between:
- **New space first visit:** Minutes of 100% CPU
- **Same space refresh:** Seconds of elevated CPU

Suggests the issue is related to **new space initialization**, not the pattern itself or general page rendering.

## Environment

- CommonTools framework (local dev)
- `deno task ct` commands
- localhost:8000 toolshed
- macOS

## Questions

1. What work is happening during new space initialization that causes this?
2. Is this related to the ConflictErrors in the storage layer?
3. Is there excessive retry/reconciliation happening?
4. Could this be related to websocket message volume?

---

**Any guidance on what's causing this CPU spike would be appreciated!**
