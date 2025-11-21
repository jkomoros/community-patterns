# Cheeseboard Schedule with Ingredient Preferences

## Overview
Build a pattern that fetches the Cheeseboard pizza schedule, splits ingredients, allows thumbs up/down on each ingredient, tracks liked/disliked ingredients, ranks pizzas, and exports the data.

## Requirements
1. Fetch webpage from https://cheeseboardcollective.coop/home/pizza/pizza-schedule/
2. Parse upcoming pizzas with dates and ingredients
3. Split pizza descriptions into individual ingredients
4. Display each ingredient with thumbs up/down chips
5. Maintain persistent list of liked/disliked ingredients
6. Color-code ingredients: green for liked, red for disliked
7. Rank pizzas based on liked ingredients (2x negative multiplier for disliked)
8. Export liked/disliked ingredients for other patterns
9. Export ranked pizza list with scores

## Technical Approach

### Data Structures

```typescript
interface Ingredient {
  name: string;
  normalized: string;  // Lowercase, trimmed for matching
}

interface IngredientPreference {
  ingredient: string;  // Normalized name
  preference: "liked" | "disliked";
}

interface Pizza {
  date: string;
  description: string;
  ingredients: Ingredient[];
}

interface RankedPizza {
  date: string;
  description: string;
  score: number;
  ingredients: Ingredient[];
}

interface CheeseboardScheduleInput {
  preferences: Cell<IngredientPreference[]>;  // Persistent preferences
}

interface CheeseboardScheduleOutput {
  preferences: Cell<IngredientPreference[]>;
  likedIngredients: string[];     // Exported
  dislikedIngredients: string[];  // Exported
  rankedPizzas: RankedPizza[];    // Exported
}
```

### Implementation Steps

#### Step 1: Fetch and Parse Data
- Use `fetchData` from commontools (like existing cheeseboard.tsx)
- Fetch from `/api/agent-tools/web-read` endpoint
- Parse response using existing `extractPizzas` function as reference
- Extract date and pizza description pairs

#### Step 2: Split Ingredients
- Parse pizza descriptions to extract ingredients
- Use heuristics: split on commas, "and", "with"
- Normalize ingredient names (lowercase, trim)
- Handle common patterns like:
  - "tomatoes, red onions, and goat cheese"
  - "mushrooms with garlic"
  - "corn tomato salsa"

#### Step 3: Display with Interaction
- For each pizza:
  - Show date and description
  - Display ingredients as chips
  - Each chip has thumbs up/down buttons
  - Color-code based on preferences: green (liked), red (disliked), gray (neutral)

#### Step 4: Manage Preferences
- Store preferences in `Cell<IngredientPreference[]>`
- When user clicks thumbs up/down:
  - Add to preferences if new
  - Update if exists
  - Remove if clicking same button again (toggle)

#### Step 5: Rank Pizzas
- Use `computed()` to calculate scores reactively
- Scoring algorithm:
  - +1 point for each liked ingredient
  - -2 points for each disliked ingredient
- Sort pizzas by score (highest first)
- Display score next to each pizza

#### Step 6: Export Data
- Export `preferences` (Cell for other patterns to link)
- Export `likedIngredients` (derived array of liked ingredient names)
- Export `dislikedIngredients` (derived array of disliked ingredient names)
- Export `rankedPizzas` (sorted array with scores)

### Key Framework Features to Use

1. **fetchData** - Web fetching
   ```typescript
   const { result } = fetchData<WebReadResult>({
     url: "/api/agent-tools/web-read",
     mode: "json",
     options: { method: "POST", headers: {...}, body: {...} }
   });
   ```

2. **lift** - Transform fetched data
   ```typescript
   const parsedPizzas = lift<{ result: WebReadResult }, Pizza[]>(
     ({ result }) => parsePizzasAndIngredients(result?.content ?? "")
   );
   ```

3. **computed** - Reactive calculations
   ```typescript
   const rankedPizzas = computed(() => {
     return pizzas
       .map(pizza => ({...pizza, score: calculateScore(pizza)}))
       .sort((a, b) => b.score - a.score);
   });
   ```

4. **Cell and handlers** - State management
   ```typescript
   const togglePreference = handler<
     { detail: { ingredient: string; preference: "liked" | "disliked" } },
     { preferences: Cell<IngredientPreference[]> }
   >(({ detail }, { preferences }) => {
     // Toggle logic
   });
   ```

5. **Bidirectional binding** - For inline interactions (if needed)

### UI Structure

```
┌─ Cheeseboard Schedule ────────────────────┐
│                                            │
│  [Filter: All | Upcoming | Ranked]        │
│                                            │
│  ┌─ Mon Dec 23 ─────────────────────┐    │
│  │ Score: +3                         │    │
│  │ Tomatoes, mozzarella, basil       │    │
│  │ [tomatoes 👍] [mozzarella 👎]     │    │
│  │ [basil 👍]                         │    │
│  └───────────────────────────────────┘    │
│                                            │
│  ┌─ Tue Dec 24 ─────────────────────┐    │
│  │ Score: -1                         │    │
│  │ Mushrooms, onions, peppers        │    │
│  │ [mushrooms 👍] [onions 👎]        │    │
│  │ [peppers ⚪]                       │    │
│  └───────────────────────────────────┘    │
│                                            │
│  ┌─ Your Preferences ───────────────┐    │
│  │ Liked: tomatoes, basil, mushrooms │    │
│  │ Disliked: mozzarella, onions      │    │
│  └───────────────────────────────────┘    │
└────────────────────────────────────────────┘
```

### Edge Cases to Handle

1. **Ingredient parsing ambiguity**
   - Use simple heuristics first
   - May need refinement based on actual data
   - Consider using LLM (generateObject) if parsing is too complex

2. **Empty or malformed responses**
   - Handle null/undefined result
   - Show error message or loading state

3. **Preference conflicts**
   - Same ingredient can't be both liked and disliked
   - Toggle behavior: clicking same button removes preference

4. **Duplicate ingredients**
   - Normalize names to avoid duplicates
   - Handle variations (e.g., "tomato" vs "tomatoes")

### Testing Strategy

1. Deploy pattern to test space
2. Verify web fetch works
3. Check ingredient parsing
4. Test preference toggling
5. Verify ranking algorithm
6. Test exports (can be read by other patterns)

## FINALIZED DESIGN DECISIONS

### Ingredient Normalization (FINAL)

**Normalization Rules:**
```typescript
function normalizeIngredient(raw: string): string {
  let normalized = raw
    .toLowerCase()
    .trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents

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
```

**What matches:**
- Singular/plural: "tomato" = "tomatoes", "onion" = "onions"
- Quality adjectives: "fresh mozzarella" = "mozzarella", "aged gouda" = "gouda"
- Cheese names: "parmesan" = "parmesan cheese" = "parmigiano reggiano"
- Salt: "salt" = "sea salt" = "kosher salt"

**What stays different:**
- Type modifiers: "red onion" ≠ "onion" ≠ "sweet onion"
- Variety: "red pepper" ≠ "bell pepper" ≠ "pepper"
- Tomato types: "cherry tomato" ≠ "sun-dried tomato" ≠ "tomato"
- Preparation: "roasted garlic" ≠ "garlic", "caramelized onions" ≠ "onions"
- Compound ingredients: "goat cheese" ≠ "cheese", "olive oil" ≠ "oil"
- Herbs: "fresh basil" = "basil" but "thai basil" ≠ "basil"

### UI Design (FINAL)

```
┌─ Cheeseboard Schedule ────────────────────────────┐
│                                                    │
│  ┌─ Mon Dec 23 ──────────────────── Score: 😍 ┐  │
│  │ Tomatoes, mozzarella, basil, red onions     │  │
│  │ [tomatoes ⚪👍👎] [mozzarella ⚪👍👎]         │  │
│  │ [basil] ← already in preferences (no buttons)│  │
│  │ [red onions ⚪👍👎]                           │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  ┌─ Tue Dec 24 ──────────────────── Score: 😐 ┐  │
│  │ Mushrooms, roasted garlic, goat cheese      │  │
│  │ [mushrooms ⚪👍👎] [roasted garlic]          │  │
│  │ [goat cheese ⚪👍👎]                          │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  ┌─ Your Preferences ─────────────────────────┐   │
│  │ Liked: [basil ✕] [roasted garlic ✕]        │   │
│  │ Disliked: [mozzarella ✕] [onions ✕]        │   │
│  └─────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

**Score Bins:**
- Score >= 4: 😍 (Amazing)
- Score 2-3: 😊 (Great)
- Score 0-1: 😐 (Okay)
- Score -1 to -2: 😕 (Meh)
- Score <= -3: 🤢 (Avoid)

**Behavior:**
- Pizzas shown in chronological order (not sorted by score)
- Ingredients already in preferences list don't show 👍👎 buttons
- Click thumbs on pizza → adds to preferences list
- Click ✕ on preference → removes from list, thumbs reappear on pizzas
- Preferences persist (exported as Cell)

## Implementation Order

1. ✅ Research and planning (DONE)
2. Start with basic fetch and display (reuse existing cheeseboard pattern)
3. Add ingredient parsing (start simple, can upgrade to LLM later)
4. Add thumbs up/down UI
5. Implement preference storage
6. Add ranking logic
7. Add color coding
8. Export data
9. Test and refine

## Notes

- Found existing cheeseboard.tsx pattern in labs that fetches from same URL
- Can reuse parsing logic and adapt for ingredient extraction
- Framework supports all needed features (fetchData, lift, computed, Cell)
- Pattern should be in jkomoros/WIP/ during development
