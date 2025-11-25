# Meal Orchestrator - LLM Recipe Linking Feature

## Overview
Add an LLM-powered button to analyze the `planningNotes` field and:
1. Find existing food-recipe and prepared-food charms that match text in the notes
2. Offer to create stubs for food items not found in the space
3. Show a preview modal where users can check/uncheck which links and stubs to apply
4. Automatically link selected items to the meal

## Requirements
- Analyze free-form `planningNotes` text field
- Fuzzy match against existing food-recipe (🍳) and prepared-food (🛒) charms
- Extract context from notes to populate stub fields (servings, category, description)
- Show modal preview with checkboxes for user to approve/reject each match/creation
- Create minimal charms for new items (with LLM-extracted details)
- Handle page refresh requirement for mentionables to populate (per superstition)

## Design Decisions

### Pattern Type Detection
**Decision:** Use emoji prefix in `[NAME]` field to identify pattern types
- `🍳` = food-recipe (line 1169 in food-recipe.tsx)
- `🛒` = prepared-food (line 147 in prepared-food.tsx)

**Rationale:** `MentionableCharm` type doesn't include pattern metadata. The emoji convention is consistent and reliable.

**Implementation:**
```typescript
const recipes = mentionable.filter(m => m[NAME]?.startsWith('🍳'));
const preparedFoods = mentionable.filter(m => m[NAME]?.startsWith('🛒'));
```

### Field to Analyze
**Decision:** Only analyze `planningNotes` field (not `notes` field)

**Rationale:** User specified planningNotes is the brainstorming space. The `notes` field at bottom is for final notes/instructions.

### Matching Strategy
**Decision:** LLM does fuzzy matching, prioritizes exact matches, returns single best match per item

**Rationale:**
- LLM is better at semantic matching than string distance algorithms
- Single best match keeps UI simple
- Can leverage LLM's understanding of food equivalence (e.g., "rotisserie chicken" matches "Costco Rotisserie Chicken")

### Stub Creation Strategy
**Decision:** Extract as many details as possible from notes context, mark clearly if placeholder

**Rationale:**
- Rich context in planning notes often includes servings, categories, sources
- LLM can infer reasonable defaults (e.g., "store-bought pie" → prepared-food)
- Future enhancement: If context is sparse, have LLM generate placeholder with warning

### UI Flow
**Decision:** Modal dialog (like food-recipe extraction preview at lines 1820-2040)

**Rationale:**
- Consistent with existing pattern UX
- Natural for review/approval workflow
- Can show detailed preview of changes

### State Management
**Decision:** Use trigger cell + generateObject pattern (like food-recipe extraction)

**Rationale:**
- Proven pattern in food-recipe.tsx (lines 897-1002)
- Keeps LLM call reactive and tied to user action
- Results stored in cell for modal display

## Architecture

### LLM Schema
```typescript
interface FoodItem {
  originalText: string;        // Raw text from planning notes
  normalizedName: string;      // Cleaned name for matching
  type: "recipe" | "prepared"; // LLM's classification
  contextSnippet: string;      // Surrounding text

  // Extracted details (optional)
  servings?: number;
  category?: string;
  description?: string;
  source?: string;             // For prepared foods
}

interface MatchResult {
  item: FoodItem;
  match: {
    existingCharmName: string;
    charmId: string;           // To reference the actual charm
    matchType: "exact" | "fuzzy";
    confidence: number;
  } | null;  // null = create new stub
}

interface AnalysisResult {
  matches: MatchResult[];
}
```

### Handler Flow
1. **Trigger Analysis Handler** (lines ~230, after removePreparedFood handler)
   - Gets current planningNotes text
   - Filters mentionables by emoji
   - Builds context string with existing items
   - Sets analysisTrigger cell

2. **LLM Processing** (pattern body, after line 348)
   - generateObject extracts items and matches
   - Returns structured AnalysisResult

3. **Apply Handler** (after analysis preview)
   - Creates stub charms for unmatched items
   - Adds matched/created charms to recipeMentioned or preparedFoodMentioned
   - Triggers page refresh (per superstition)

### Page Refresh Strategy
**Known Issue:** Per superstition in `community-docs/superstitions/2025-11-22-at-reference-opaque-ref-arrays.md`:
- BacklinksIndex requires page refresh to populate in dev
- After creating charms, mentionable list won't update until refresh

**Solution:** Document this clearly in UI:
- Show success message: "Items created! Refreshing page to update links..."
- Use `window.location.reload()` after charm creation
- Consider future enhancement: Ask user before refresh if they have unsaved changes

## Implementation Progress

### Phase 1: Setup and Filtering ✅ COMPLETED
- [x] Add analysisTrigger cell (linkingAnalysisTrigger)
- [x] Add result cell (linkingAnalysisResult)
- [x] Implement mentionable filtering by emoji (recipes vs prepared foods)
- [x] Create triggerRecipeLinking handler with context building
- [x] Create cancelLinking handler

**Status:** Committed in 1307e3b. Handler filters mentionables, builds context with existing items, triggers LLM analysis.

### Phase 2: LLM Integration ✅ COMPLETED
- [x] Design comprehensive LLM system prompt
- [x] Implement generateObject call with AnalysisResult schema
- [x] Add "🔗 Link Recipes" button with pending state
- [x] Wire button to triggerRecipeLinking handler
- [x] Fix prompt format (natural language vs JSON)
- [x] Fix schema to allow null match values (oneOf pattern)
- [x] Test with sample planning notes in Playwright

**Status:** Committed in 106d325.
- Initial implementation: 53a3290
- Fixes: 106d325 (prompt format + schema validation)
- Tested successfully in Playwright - both LLM calls return 200 OK
- Extracted 4 food items correctly: roast chicken, roasted vegetables, Caesar salad, apple pie (Costco)
- All items correctly classified (3 recipes, 1 prepared food)
- Context extraction working (servings, category, description, source)

### Phase 3: Modal UI
- [ ] Create modal structure (based on food-recipe pattern)
- [ ] Display matched items with confidence indicators
- [ ] Display create-stub items with extracted details
- [ ] Add checkboxes for each match/creation
- [ ] Add "Apply" and "Cancel" buttons

### Phase 4: Apply Handler
- [ ] Implement stub creation logic
- [ ] Handle prepared-food stub creation (simpler structure)
- [ ] Handle food-recipe stub creation (more complex)
- [ ] Add matched/created items to appropriate arrays
- [ ] Implement page refresh flow

### Phase 5: Testing & Refinement
- [ ] Test with real planning notes
- [ ] Test fuzzy matching quality
- [ ] Test stub creation with various contexts
- [ ] Verify page refresh behavior
- [ ] Check for edge cases (empty notes, no matches, etc.)

## Technical Notes

### MentionableCharm Structure
```typescript
export type MentionableCharm = {
  [NAME]?: string;
  mentioned: MentionableCharm[];
  backlinks: MentionableCharm[];
}
```
- No built-in pattern type field
- Must infer from [NAME] string
- Contains forward and back references

### Current Mentionable Usage
- Line 246: `const mentionable = schemaifyWish<any[]>("#mentionable")`
- Used for ct-code-editor @ references
- Already working for recipes and prepared foods sections

### Stub Creation Approaches
**For prepared-food (simpler):**
```typescript
PreparedFood({
  name: item.normalizedName,
  servings: item.servings || 4,
  category: item.category || "other",
  description: item.description || "",
  source: item.source || "",
  // ... other defaults
})
```

**For food-recipe (more complex):**
```typescript
FoodRecipe({
  name: item.normalizedName,
  servings: item.servings || 4,
  category: item.category || "other",
  ingredients: [],  // Empty, user fills later
  stepGroups: [],   // Empty, user fills later
  // ... other defaults
})
```

### Refresh Superstition Details
From `community-docs/superstitions/2025-11-22-at-reference-opaque-ref-arrays.md`:
- BacklinksIndex created automatically but requires page refresh
- `wish("#mentionable")` returns empty until refresh
- Known behavior in dev environments
- After refresh, @ mention dropdown appears with all charms

## Button Placement
**Decision:** Add button in Planning Notes card (lines 662-677)

**Rationale:**
- Makes it clear the button analyzes planning notes specifically
- Natural placement near the field being analyzed
- Consistent with food-recipe's "Extract Recipe Data" button placement

**UI Layout:**
```tsx
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
  <h3>📝 Planning Notes</h3>
  <ct-button onClick={triggerAnalysis} disabled={analysisPending}>
    {analysisPending ? "Analyzing..." : "🔗 Link Recipes"}
  </ct-button>
</div>
```

## Next Steps

1. **Start Phase 1**: Add state cells and filtering logic
2. **Design LLM prompt**: Critical for good extraction and matching
3. **Test pattern type detection**: Verify emoji filtering works correctly
4. **Build minimal modal**: Get UI structure working before filling in details

## Questions for User
- None currently - user confirmed all requirements

## Blockers
- None currently

## Related Patterns
- `food-recipe.tsx` - Extraction modal pattern (lines 1820-2040)
- `prepared-food.tsx` - Stub creation reference
- `lib/backlinks-index.tsx` - Mentionable system understanding
- Community docs superstition on mentionable refresh
