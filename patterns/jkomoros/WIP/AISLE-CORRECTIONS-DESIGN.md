# Aisle Corrections Feature Design

## Overview
Allow users to report incorrect aisle categorizations and provide corrections, which will improve future LLM categorization by including these corrections in the store layout context.

## User Flow
1. User sees an item categorized to the wrong aisle in sorted view
2. User clicks "Wrong Aisle" button next to the item
3. UI shows dropdown/selection for correct aisle (all aisles + departments + "I don't know")
4. User selects correct aisle or "I don't know"
5. System stores correction in storeData
6. Next time any item is categorized, the LLM sees these corrections in context
7. Item is immediately re-categorized with new context

## Data Structure

### StoreData Type Extension
```typescript
interface ItemLocation {
  itemName: string;           // e.g., "coffee"
  correctAisle: string;       // e.g., "Aisle 9 - Coffee & Snacks"
  incorrectAisle?: string;    // e.g., "Aisle 5 - Condiments" (optional)
  timestamp: number;          // When correction was made
}

interface StoreData {
  aisles: StoreAisle[];
  departments: StoreDepartment[];
  itemLocations: ItemLocation[];  // NEW FIELD
}
```

### Markdown Format Enhancement
The `storeDataToMarkdown()` function will include a new section:

```markdown
# Known Item Locations

- coffee: Found in Aisle 9 - Coffee & Snacks (NOT in Aisle 5 - Condiments)
- milk: Found in Dairy
- bread: Found in Bakery
```

## Implementation Tasks

### Phase 1: Data Structure & Storage ✅ COMPLETE
- [x] Add `itemLocations` field to `StoreData` interface in shopping-list-launcher.tsx
- [x] Update `ANDRONICOS_DATA` to include empty `itemLocations: []`
- [x] Make `storeData` input cell mutable (needs to be Cell not just Default)
- [x] Update `storeDataToMarkdown()` to embed items in aisle descriptions (NOT separate section)

### Phase 2: Correction Handler ✅ COMPLETE
- [x] Create `submitCorrection` handler that:
  - Takes: item name, current (incorrect) aisle, new (correct) aisle
  - Adds/updates entry in storeData.itemLocations
  - Increments item.aisleSeed to force re-categorization
- [x] Ensure corrections persist (stored in mutableStoreData cell)
- [x] Add `startCorrection` and `cancelCorrection` handlers for UI state

### Phase 3: UI Components ✅ COMPLETE
- [x] Add "⚠️ Wrong Aisle" button next to each item in sorted view
- [x] Simple button approach (avoids complex conditional rendering issues)
- [x] Button currently hardcoded to "Produce" for proof of concept
- [x] Tested successfully in Playwright

### Phase 4: LLM Context Enhancement ✅ COMPLETE & TESTED
- [x] Corrected markdown is passed to LLM (via mutableStoreData)
- [x] Debug logging confirms corrections in LLM context
- [x] Verified corrections count increases after submission
- [x] Confirmed new items see accumulated corrections

### Phase 5: UI Polish - NOT STARTED
- [ ] Show corrections count in header (e.g., "3 corrections learned")
- [ ] Add way to view/manage all corrections
- [ ] Add ability to remove incorrect corrections
- [ ] Show indicator if item has been manually corrected (e.g., "✏️" badge)
- [ ] Show "last corrected" timestamp

## Current Status: WORKING ✅

Core correction feature is fully functional:
- ✅ Data structures complete (ItemLocation, itemLocations array)
- ✅ Markdown generation enhanced (embeds items inline per user feedback)
- ✅ All handlers implemented and tested (submitCorrection working)
- ✅ Simple UI implemented ("Wrong Aisle" button)
- ✅ LLM integration working (corrections visible in context)
- ✅ Playwright testing confirms end-to-end functionality

**What Works**:
- Users can report wrong aisle categorizations
- Corrections are stored in mutableStoreData
- Items automatically re-categorize after correction
- LLM sees corrections in enhanced markdown
- New items benefit from accumulated corrections

**Known Limitations**:
- Button currently hardcoded to "Produce" (proof of concept)
- No UI for selecting correct aisle (Phase 5 enhancement)
- mutableStoreData initialized with ANDRONICOS_DATA only (not input storeData)

## Technical Considerations

### Correction Storage
- Corrections should be stored in the storeData cell
- Since shopping-list-launcher receives storeData as input with Default, need to ensure it's a mutable cell
- May need to change from `storeData: Default<StoreData | null, null>` to `storeData: Cell<StoreData | null>`

### LLM Context
- Current prompt uses `storeDataToMarkdown(storeData)` or `ANDRONICOS_OUTLINE`
- Enhanced markdown will include corrections section
- LLM prompt already asks for specific aisle/department, so corrections should be naturally incorporated

### Re-categorization
- After correction, increment `item.aisleSeed` to force fresh LLM call
- Item should immediately move to correct aisle in sorted view
- Show brief "✨ Recategorizing..." indicator

### Deduplication
- If user reports same item multiple times, update existing correction rather than adding duplicate
- Use lowercase itemName for matching to handle case variations

## Example User Experience

**Before Correction:**
```
📍 AISLE 5 - CONDIMENTS           0/1 • 0%
  ☐ coffee  [⚠️ Wrong Aisle]
```

**User clicks "Wrong Aisle":**
```
📍 AISLE 5 - CONDIMENTS           0/1 • 0%
  ☐ coffee

  Where is coffee actually located?
  [Dropdown: All aisles...]
  [Select: Aisle 9 - Coffee & Snacks]
  [Cancel] [Save Correction]
```

**After Correction:**
```
📍 AISLE 9 - COFFEE & SNACKS      0/1 • 0%
  ☐ coffee ✏️  [✓ Corrected]
```

**Next Session:**
When user adds "coffee" again, it's immediately categorized to Aisle 9 because the LLM sees:
```
# Known Item Locations
- coffee: Found in Aisle 9 - Coffee & Snacks (NOT in Aisle 5 - Condiments)
```

## Future Enhancements
- Community sharing of corrections (crowdsourced item locations)
- Auto-suggest corrections based on other users' data
- Bulk import of common item locations
- Export corrections to share with others shopping at same store
- Learn from patterns (e.g., if user corrects 5 baking items, suggest checking other baking items)

## Success Metrics
- Reduction in "Wrong Aisle" reports for corrected items
- User satisfaction with categorization accuracy
- Number of corrections made per user session
- Time saved shopping with improved routing
