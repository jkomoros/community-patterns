# Meal Orchestrator - LLM Recipe Linking Feature

## Overview
LLM-powered button to analyze the `planningNotes` field and:
1. Find existing food-recipe and prepared-food charms that match text in the notes
2. Automatically create stubs for food items not found in the space
3. Show a preview modal where users can check/uncheck which links and stubs to apply
4. Automatically link selected items to the meal

## Status: ✅ COMPLETE

All phases completed and working:

- ✅ **Phase 1**: Setup and Filtering - Handler filters mentionables, builds context with existing items
- ✅ **Phase 2**: LLM Integration - generateObject extracts food items and matches
- ✅ **Phase 3**: Modal UI - Shows extracted items with match/create status
- ✅ **Phase 4**: Apply Handler - Matches and links existing charms
- ✅ **Phase 5**: Testing - LLM extraction, modal, matching all working
- ✅ **Phase 6**: Individual Create Buttons - navigateTo() with pre-filled data
- ✅ **Phase 7**: Automatic Charm Creation - Creates charms via pattern function calls and exports via mentionable

## Key Technical Solution

**OpaqueRef Property Access Limitation:** When OpaqueRefs are stored in Cell arrays, their properties are NOT directly accessible (`Object.keys()` returns `[]`).

**Workaround:** Store wrapper objects containing both display data AND the charm reference:
```typescript
const wrapper = {
  charm: newCharm,      // OpaqueRef for framework features
  name: "...",          // Display data duplicated
  servings: 4,
  category: "main",
};
```

## File Location
`patterns/jkomoros/meal-orchestrator.tsx`
