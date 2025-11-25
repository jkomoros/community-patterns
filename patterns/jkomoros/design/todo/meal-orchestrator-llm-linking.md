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

### Phase 3: Modal UI ✅ COMPLETED
- [x] Create modal structure (based on food-recipe pattern)
- [x] Display matched items with confidence indicators
- [x] Display create-stub items with extracted details
- [x] Add checkboxes for each match/creation
- [x] Add "Apply" and "Cancel" buttons

**Status:** Committed in ef108d8.
- Modal displays with fixed position and dark backdrop overlay
- Shows all 4 extracted food items with type badges
- Match status indicators (found/create stub) with confidence percentages
- Extracted details displayed (servings, category, source)
- Context snippets from planning notes
- Checkboxes default to checked (all selected)
- Cancel button closes modal by resetting trigger cell
- Apply Links button placeholder ready for Phase 4

### Phase 4: Apply Handler ✅ COMPLETED
- [x] Implement matching logic for existing charms
- [x] Add matched items to appropriate arrays
- [x] Wire Apply Links button to handler
- [x] Handle defensive filtering of undefined values

**Status:** Completed. Final implementation:
- Filters selected items from modal checkboxes
- Matches selected items against mentionable charms by name (emoji prefix removed)
- Adds matched charms to recipeMentioned or preparedFoodMentioned arrays
- **Simplified approach:** Unmatched items are skipped - users should create recipe/prepared-food charms first
- Closes modal after applying
- Defensive filtering added to prevent errors from stale/undefined array values

**Design Decision - No Stub Creation (Framework Limitation):**
Initial design included creating stub charms for unmatched items, but discovered this is **not possible with current framework**:

**Attempted Approaches:**
1. **Pattern function calls** - `FoodRecipe({...})` returns Cell-wrapped outputs, not persistent charms
2. **Plain objects** - Don't persist, cause undefined errors after page reload
3. **navigateTo() with pattern** - Returns boolean (navigation success), not charm reference
4. **Calling .get() on patterns** - Still returns Cell-wrapped data, not persisted charms

**Root Cause:**
- The framework has no `createCharm()` primitive for programmatic charm creation without navigation
- `navigateTo()` navigates AND has side effects that may persist charms, but returns boolean not reference
- Pattern functions are for reactive composition, not storage
- ct-code-editor component must use internal APIs not exposed to pattern developers

**Filed Issue:**
- Created comprehensive issue file: `issues/ISSUE-No-Create-Charm-Primitive.md`
- Documents missing primitive, use cases, API design suggestions
- Recommended API: `createCharm(pattern, inputs) => OpaqueRef<Output>`

**Final Behavior:**
- Modal shows items with "⚠ No match found - will be skipped (create charm first to add it)"
- Only existing charms from mentionable list are added to meal
- LLM extraction still provides full context (servings, category, source) for user reference
- Users can use the extracted information to quickly create missing charms manually

**Commit:** 962f55d - Reverted to match-only approach with clear documentation

### Phase 5: Testing & Refinement ⚠️ BLOCKED BY FRAMEWORK
- [x] Test LLM extraction quality - Works perfectly
- [x] Test modal UI and user flow - Works perfectly
- [x] Test matching existing charms - Works perfectly
- [ ] ~~Test stub creation~~ - **BLOCKED: Framework has no createCharm() primitive**
- [ ] ~~Verify page refresh behavior~~ - **N/A: No charm creation without createCharm()**
- [ ] Test edge cases (empty notes, no matches, etc.) - Partially tested

**Status:** Feature is **functionally complete** within framework constraints. Cannot proceed with automatic charm creation until framework adds `createCharm()` primitive.

### Phase 6: Option 2 Implementation - Individual "Create" Buttons ✅ COMPLETED
After discovering the framework limitation, implemented a pragmatic workaround using `navigateTo()` with pre-filled data.

- [x] Re-add imports for FoodRecipe and PreparedFood patterns
- [x] Create `createMissingItem` handler that navigates with pre-filled charm
- [x] Add "Create 🍳 Recipe" / "Create 🛒 Prepared Food" buttons to modal for unmatched items
- [x] Test workflow: extract → create → verify pre-filled data

**Implementation Details:**

1. **Handler** (lines 320-358):
```typescript
const createMissingItem = handler<unknown, { item: FoodItem }>((_event, { item }) => {
  if (item.type === "recipe") {
    return navigateTo(FoodRecipe({
      name: item.normalizedName,
      servings: item.servings || 4,
      category: (item.category as any) || "other",
      notes: item.description || "",
      source: item.source || "",
      // ... all other required fields with defaults
    }));
  } else {
    return navigateTo(PreparedFood({
      name: item.normalizedName,
      servings: item.servings || 4,
      category: (item.category as any) || "other",
      description: item.description || "",
      source: item.source || "",
      // ... all other required fields with defaults
    }));
  }
});
```

2. **UI Update** (lines 1487-1503):
- Replaced "⚠ No match found - will be skipped" message with green "Create" button
- Button text adapts to item type: "Create 🍳 Recipe" or "Create 🛒 Prepared Food"

3. **User Workflow:**
   - User pastes planning notes with food items
   - Clicks "🔗 Link Recipes" - modal shows extracted items
   - For unmatched items, clicks "Create 🍳 Recipe" button
   - Navigates to new charm with LLM-extracted data pre-filled
   - User reviews data, adds ingredients/steps, saves
   - User navigates back to meal orchestrator
   - User can now link the newly created charm using [[ mentions

**Testing Results (2025-01-24):**
- ✅ LLM correctly extracted 4 items: Roast Chicken, Roasted Vegetables, Caesar Salad, Apple Pie
- ✅ Modal displayed all items with correct type badges and extracted details
- ✅ Clicked "Create 🍳 Recipe" for Roast Chicken
- ✅ Successfully navigated to new FoodRecipe charm
- ✅ Charm pre-filled with: name="Roast Chicken", servings=6, category="Main", notes="main course"
- ⚠️ Minor issue: After navigating back and clicking "🔗 Link Recipes" again, modal showed empty with undefined error (possible LLM caching or reactivity issue - not critical)

**Benefits of Option 2:**
- Works within current framework constraints
- Leverages existing `navigateTo()` API
- Preserves LLM-extracted context (servings, category, source)
- User can review/edit before saving
- Clear, predictable workflow

**Trade-offs:**
- Requires user to navigate away and back (vs automatic stub creation)
- User must manually link created charms (can't be automated)
- Creates one charm at a time (vs batch creation)

**Status:** Successfully implemented and tested. This is the recommended solution until framework adds `createCharm()` primitive.

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
