# Food Recipe Pattern - Major Improvements

**Goal**: Enhance food-recipe pattern to support timing/scheduling, viewer mode, and image import - ultimately to support a thanksgiving-planner pattern that can schedule multiple recipes.

**Status**: Design phase - ready for implementation

---

## Overview

This document outlines major improvements to the food-recipe pattern:

1. **Restructure data model** around step groups with timing information
2. **Add image/PDF import** for recipe extraction
3. **Create food-recipe-viewer** pattern for cooking view (checkboxes, current group focus)
4. **LLM enhancements** for extracting timing and suggesting wait times
5. **UI improvements** - notes at top, better extraction flow

---

## Design Decisions Summary

### Step Groups with Timing
- All steps belong to named step groups (no default/special group)
- Groups have timing: `nightsBeforeServing` OR `minutesBeforeServing` (not both)
- Groups can overlap in timing (e.g., two groups both "30 min before")
- Groups have duration and oven requirements
- Groups have max wait time before next group
- Steps within groups are ordered sequentially
- Future: `parallelGroup` string for parallel execution (not implementing yet)

### Viewer Pattern
- Separate pattern: food-recipe-viewer
- Live-linked to source recipe (not snapshot)
- Shows all groups, with checkboxes for groups and steps
- Auto-named when created
- Completion tracking: try boxing pattern, fall back to name->boolean map

### Image Import
- Use `ct-image-input` component
- Transcribes to text, populates notes field
- Existing extraction flow handles the rest
- PDF support: future enhancement (likely requires special handling)

---

## Data Model Changes

### Current Model
```typescript
interface RecipeStep {
  order: number;
  description: string;
  duration?: number; // minutes
}

interface RecipeInput {
  // ... other fields
  steps: Default<RecipeStep[], []>;
  // ...
}
```

### New Model
```typescript
interface RecipeStep {
  description: string;
  // No order - order is implicit in array
  // No duration - moved to group level
}

interface StepGroup {
  id: string; // unique identifier
  name: string; // "Night Before", "Prep", "Cooking", "Finishing Touches"

  // Timing - exactly ONE of these should be set
  nightsBeforeServing?: number; // e.g., 1, 2 (for "night before" timing)
  minutesBeforeServing?: number; // e.g., 180, 30, 0 (for "3 hours before", "30 min", "at serving")

  // Group-level attributes
  duration?: number; // Total duration of this group in minutes
  maxWaitMinutes?: number; // How long can wait before next group starts

  requiresOven?: {
    temperature: number; // degrees F
    duration: number; // minutes in oven
    racksNeeded?: {
      heightSlots: number; // 1 for cookie sheet, 2 for casserole, 5 for turkey, etc.
      width: "full" | "half"; // full rack width or half rack
    };
  };

  // Future: for parallel execution
  // parallelGroup?: string; // Steps with same parallelGroup can run simultaneously

  steps: RecipeStep[]; // Ordered steps within this group
}

interface RecipeInput {
  name: Default<string, "">;
  cuisine: Default<string, "">;
  servings: Default<number, 4>;
  yield: Default<string, "">;
  difficulty: Default<"easy" | "medium" | "hard", "medium">;
  prepTime: Default<number, 0>; // minutes - KEEP for summary
  cookTime: Default<number, 0>; // minutes - KEEP for summary
  restTime: Default<number, 0>; // minutes - Time to rest after cooking before serving (ADDED for thanksgiving-planner)
  holdTime: Default<number, 0>; // minutes - Time dish can wait while maintaining quality (ADDED for thanksgiving-planner)
  category: Default<"appetizer" | "main" | "side" | "starch" | "vegetable" | "dessert" | "bread" | "other", "other">; // ADDED for thanksgiving-planner meal planning
  ingredients: Default<Ingredient[], []>; // No change
  stepGroups: Default<StepGroup[], []>; // NEW - replaces steps
  tags: Default<string[], []>;
  notes: Default<string, "">;
  source: Default<string, "">;
}

interface RecipeOutput extends RecipeInput {
  // Derived field for meal planning (ADDED for thanksgiving-planner)
  ovenRequirements: {
    needsOven: boolean; // Whether any step group requires oven
    temps: number[]; // All unique oven temperatures needed (sorted)
    tempChanges: boolean; // Whether temperature changes during cooking (more than one temp)
  };
}
```

### Migration Strategy
- Existing recipes have flat `steps` array
- On load, if `stepGroups` is empty but `steps` exists:
  - Create single group named "Main Steps"
  - Set `minutesBeforeServing: 0`
  - Move all steps into this group
  - Preserve step durations at group level (sum of step durations)

---

## UI Changes

### 1. Move Notes to Top (Most Prominent)

**Rationale**: The LLM extraction from notes is the primary way to create recipes, so it should be the first thing users see.

**New Layout Order**:
1. Header (name, total time)
2. **Notes Section** with image upload + extract button
3. Extraction results modal (when active)
4. Basic Info (name, cuisine, servings, etc.)
5. Scaling Controls
6. Ingredients
7. **Step Groups** (new - replaces Steps section)
8. Tags
9. Source

### 2. Notes Section Enhancement

```tsx
<ct-card>
  <ct-vstack gap={2} style="padding: 12px;">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h3>Recipe Input</h3>
      <div style={{ display: "flex", gap: "8px" }}>
        <ct-image-input
          onupload={handleImageUpload({ notes })}
        >
          Upload Image
        </ct-image-input>
        <ct-button onClick={triggerExtraction(...)}>
          Extract Recipe Data
        </ct-button>
      </div>
    </div>
    <ct-code-editor
      $value={notes}
      placeholder="Paste a recipe here, or upload an image, then click 'Extract Recipe Data'..."
    />
  </ct-vstack>
</ct-card>
```

### 3. Step Groups Section (New)

**Features**:
- Inline group management (create, rename, delete, reorder)
- Timing fields per group (nights OR minutes before serving)
- Duration and max wait time per group
- Oven requirements per group
- Steps nested within groups
- Ability to move steps between groups (drag-drop or move buttons)

**Visual Structure**:
```
┌─ Step Groups ────────────────────────────────────┐
│                                                   │
│  ┌─ Group: "Night Before" ──────────────────┐   │
│  │ Timing: 1 night before serving            │   │
│  │ Duration: 30 min  Max Wait: 12 hours      │   │
│  │                                            │   │
│  │  1. ☐ Prepare brine                       │   │
│  │  2. ☐ Submerge turkey                     │   │
│  │                                            │   │
│  │  [+ Add Step] [Edit Group] [Delete]       │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  ┌─ Group: "4 Hours Before" ────────────────┐   │
│  │ Timing: 240 minutes before serving        │   │
│  │ Duration: 195 min  Max Wait: 0 min        │   │
│  │ Oven: 325°F for 180 min                   │   │
│  │                                            │   │
│  │  1. ☐ Remove from brine, pat dry         │   │
│  │  2. ☐ Season turkey                       │   │
│  │  3. ☐ Preheat oven to 325°F               │   │
│  │  4. ☐ Start roasting                      │   │
│  │                                            │   │
│  │  [+ Add Step] [Edit Group] [Delete]       │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  [+ Add Group]                                    │
│                                                   │
└───────────────────────────────────────────────────┘
```

**Group Card UI Details**:
- Collapsible/expandable groups
- Group header shows: name, timing summary, duration, oven icon if applicable
- Edit button opens inline form for group properties
- Steps show checkboxes (non-functional in editor, functional in viewer)
- Reorder handles for both groups and steps

---

## New Pattern: food-recipe-viewer

### Purpose
A cooking-focused view of a recipe that:
- Shows all step groups with timing information
- Allows checking off completed steps and groups
- Tracks which steps/groups are done
- Live-linked to source recipe (updates when recipe changes)

### Data Model
```typescript
interface ViewerInput {
  sourceRecipe: Cell<RecipeOutput>; // Live link to food-recipe
  completedSteps: Default<Record<string, boolean>, {}>; // groupId:stepIndex -> true/false
  completedGroups: Default<Record<string, boolean>, {}>; // groupId -> true/false
}
```

**Note**: Completion tracking will use boxing pattern if possible:
```typescript
// Ideal approach (if boxing works):
interface BoxedStep extends RecipeStep {
  completed: boolean;
}
interface BoxedGroup extends StepGroup {
  completed: boolean;
  steps: BoxedStep[];
}
```

If boxing doesn't work with live-linked cells, fall back to the Record approach.

### UI Features
1. **All groups visible** (not accordion/single-view)
2. **Group checkbox** checks all steps within group
3. **Step checkboxes** for individual completion
4. **Current group highlighting** (based on timing and current time - future enhancement)
5. **Timing display** shows when each group should start
6. **Ingredients list** at top (read-only, from source recipe)
7. **Link back to source recipe** for editing

### Creation Flow
1. In food-recipe, add button "Create Cooking View"
2. Button creates new food-recipe-viewer charm
3. Links viewer to current recipe
4. Navigates to viewer
5. Multiple viewers can exist for same recipe

### Example Viewer UI
```
┌─ 🍳 Roast Turkey (Cooking View) ────────────────┐
│                                                  │
│  [← Edit Recipe]                                 │
│                                                  │
│  Ingredients:                                    │
│  • 12 lb turkey                                  │
│  • 1 cup kosher salt                             │
│  • ...                                           │
│                                                  │
│  ┌─ Night Before (1 night before) ──────────┐  │
│  │ ☐ Group Complete                          │  │
│  │                                            │  │
│  │  ☐ 1. Prepare brine                       │  │
│  │  ☐ 2. Submerge turkey                     │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌─ 4 Hours Before (240 min before) ────────┐  │
│  │ ☐ Group Complete                          │  │
│  │ 🔥 325°F for 180 min                       │  │
│  │                                            │  │
│  │  ☐ 1. Remove from brine, pat dry         │  │
│  │  ☐ 2. Season turkey                       │  │
│  │  ☐ 3. Preheat oven to 325°F               │  │
│  │  ☐ 4. Start roasting                      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## LLM Enhancements

### 1. Enhanced Extraction Schema

Update `generateObject` schema to extract step groups:

```typescript
schema: {
  type: "object",
  properties: {
    // ... existing fields (name, cuisine, servings, etc.)
    stepGroups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          nightsBeforeServing: { type: "number" },
          minutesBeforeServing: { type: "number" },
          duration: { type: "number" },
          maxWaitMinutes: { type: "number" },
          requiresOven: {
            type: "object",
            properties: {
              temperature: { type: "number" },
              duration: { type: "number" },
              racksNeeded: {
                type: "object",
                properties: {
                  heightSlots: { type: "number" },
                  width: { type: "string", enum: ["full", "half"] }
                }
              }
            }
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" }
              }
            }
          }
        }
      }
    },
    // ... existing fields (ingredients, tags, etc.)
  }
}
```

**Updated System Prompt**:
```
You are a recipe extraction assistant. Extract structured recipe information from unstructured text.

Extract the following fields if present:
- name, cuisine, servings, difficulty, prepTime, cookTime, source, ingredients, tags
- stepGroups: Organize steps into logical groups based on timing:
  * Group similar prep/cooking phases together
  * Assign timing: use nightsBeforeServing (1, 2) for overnight tasks,
    minutesBeforeServing (e.g. 240, 60, 30, 0) for day-of timing
  * Estimate duration for each group
  * Identify oven requirements (temperature, duration, and racksNeeded):
    - temperature: oven temp in Fahrenheit
    - duration: time in oven in minutes
    - racksNeeded.heightSlots: 1 for thin items (cookie sheet), 2 for medium (casserole), 5 for tall items (turkey)
    - racksNeeded.width: "full" for full rack width, "half" for half rack
  * Common group names: "Night Before", "Prep", "Cooking", "Finishing"
  * Most recipes will have 2-5 groups
- remainingNotes: Any text that was NOT extracted into structured fields

Be thoughtful about timing. If recipe doesn't specify timing, make reasonable assumptions.
```

### 2. New LLM Tool: Suggest Step Group Timing

**Button**: "Organize by Timing" (in step groups section)

**Purpose**: For recipes with unorganized step groups, automatically suggest timing and organization.

**Implementation**:
```typescript
const suggestTiming = handler<...>((_event, { stepGroups }) => {
  timingSuggestionTrigger.set(`${JSON.stringify(stepGroups)}\n---TIMING-${Date.now()}---`);
});

const { result: timingSuggestion } = generateObject({
  system: `Analyze these recipe step groups and suggest appropriate timing.

  For each group, determine:
  - Should it use nightsBeforeServing or minutesBeforeServing?
  - What's the appropriate timing value?
  - Estimate total duration
  - Does it need an oven? If so, what temp and duration?

  Return the same structure with timing fields populated.`,
  prompt: timingSuggestionTrigger,
  schema: { /* stepGroups schema */ }
});
```

### 3. New LLM Tool: Suggest Max Wait Times

**Button**: "Suggest Wait Times" (in step groups section)

**Purpose**: For each step group, suggest how long it can safely wait before the next group.

**Implementation**:
```typescript
const suggestWaitTimes = handler<...>((_event, { stepGroups }) => {
  waitTimeSuggestionTrigger.set(`${JSON.stringify(stepGroups)}\n---WAIT-${Date.now()}---`);
});

const { result: waitTimeSuggestion } = generateObject({
  system: `Analyze these recipe step groups and suggest maximum wait times.

  For each group, determine how long the food can safely wait before the next step.
  Consider food safety, quality, and texture.

  Examples:
  - Cut vegetables can wait 24 hours refrigerated
  - Baked items should be served immediately (0 min wait)
  - Resting meat can wait 10-15 minutes

  Return maxWaitMinutes for each group.`,
  prompt: waitTimeSuggestionTrigger,
  schema: { /* simplified schema with just id and maxWaitMinutes per group */ }
});
```

---

## Image/PDF Import

### Phase 1: Image Import (Implement First)

**Component**: `ct-image-input`

**Flow**:
1. User clicks "Upload Image" button in Notes section
2. File picker opens, user selects image
3. Image is transcribed to text (happens automatically with ct-image-input)
4. Transcribed text is inserted into notes field
5. User clicks "Extract Recipe Data" to run existing extraction

**Implementation**:
```typescript
const handleImageUpload = handler<
  { detail: { content: string } }, // Transcribed text from image
  { notes: Cell<string> }
>(({ detail }, { notes }) => {
  const currentNotes = notes.get();
  const newNotes = currentNotes
    ? `${currentNotes}\n\n---\n\n${detail.content}`
    : detail.content;
  notes.set(newNotes);
});
```

### Phase 2: PDF Import (Future Enhancement)

**Challenge**: Most LLM APIs don't accept PDF directly, would need:
- PDF parsing library to extract text
- Or multi-page image conversion
- Special handling for recipe books with photos/formatting

**Decision**: Defer until Phase 1 is working. Users can use external tools to convert PDF to images for now.

---

## Implementation Phases

### Phase 1: Data Model + Basic UI ✅ COMPLETED
- [x] Create design doc (this file)
- [x] Create feature branch
- [x] Update data model (StepGroup interface)
- [x] Add migration logic for old recipes
- [x] Update UI - move notes to top
- [x] Add image upload to notes section
- [x] Update step section to show groups (basic)
- [x] Update LLM extraction to handle stepGroups
- [x] Test with simple recipe
- [x] Commit and push

**Additional fields added (2025-11-22)**: Added `restTime`, `holdTime`, `category` input fields and `ovenRequirements` derived output field as requested by thanksgiving-planner pattern for meal scheduling and oven coordination.

### Phase 2: Step Group Management (Second PR)
- [ ] Add group creation/deletion UI
- [ ] Add group editing (name, timing, duration, oven)
- [ ] Add step management within groups
- [ ] Add ability to move steps between groups
- [ ] Add group reordering
- [ ] Update LLM extraction preview to show groups
- [ ] Test with complex recipe (multiple groups)
- [ ] Commit and push

### Phase 3: LLM Timing Tools (Third PR) ✅ COMPLETED
- [x] Add "Organize by Timing" button + LLM tool
- [x] Add "Suggest Wait Times" button + LLM tool
- [x] Test timing suggestions - LLM generates suggestions correctly
- [x] Investigate auto-apply - **FOUND ROOT CAUSE: derives cannot mutate cells**
- [x] Commit findings and cleanup
- [x] Add Apply button UI for timing suggestions (similar to extraction modal)
- [x] Add Apply button UI for wait time suggestions
- [x] Test both modals in Playwright - verified working
- [x] Commit and push complete solution

**Implementation Status (2025-11-22) - COMPLETE**:

**Working Solution**:
- Implemented modal UI with Apply/Cancel buttons for timing and wait time suggestions (commit ca0aa90)
- Modals appear automatically when LLM completes analysis
- Show diff view (current → suggested values) for each step group
- Apply button calls `applyTimingSuggestions` or `applyWaitTimeSuggestions` handlers
- Cancel button dismisses modal without applying changes
- Tested successfully in Playwright - both modals work correctly

**Technical Implementation**:
- Fixed cell serialization bug in trigger handlers (lines 565-628)
  - Unwrap Cells before JSON.stringify: `stepGroups.get().map(g => g.get ? g.get() : g)`
  - LLM now receives correct JSON data
- Timing suggestions modal (lines 1733-1849)
  - Shows nightsBeforeServing, minutesBeforeServing, duration with diff view
  - Uses derive() to access both stepGroups and timingSuggestions reactively
  - Cancel handler clears timingSuggestions cell to hide modal
- Wait time suggestions modal (lines 1851-1933)
  - Shows maxWaitMinutes with diff view
  - Same reactive pattern as timing modal
- Both handlers properly mutate cells (lines 576-667)

**CRITICAL FINDING - Why Auto-Apply Failed**:
- Attempted to use `derive()` for auto-apply (commit 7a4d6f1)
- **Root cause**: Derives are READ-ONLY - they cannot call `.set()` on cells
- Console logs confirmed: `group has .set? undefined undefined`
- Calling `.set()` in a derive silently fails
- Solution: Use handlers (which CAN mutate) with Apply button UI

**Key Learning**:
- CommonTools pattern: derives are pure (read-only), handlers can mutate
- Always use handlers for `.set()` operations, never derives
- This is a fundamental constraint of the reactive system
- Modal + handler pattern works well for user-approved mutations

### Phase 4: Viewer Pattern (Fourth PR) - PARTIALLY COMPLETE
- [x] Create food-recipe-viewer.tsx
- [x] Implement completion tracking (boxing pattern with arrays)
- [x] Deploy viewer pattern (charm ID: baedreiety5mgwt2rgtrtysd7ab6xj5sf42f2ewgfoysksl6zycfaticbsi)
- [x] Commit and push Phase 4 (commits c6c2da5, 596db3c, aeef4c4)
- [x] Viewer pattern fully functional (navigation, completion tracking, timing display)
- [ ] **BLOCKED**: "Create Cooking View" button removed due to self-reference issue
- [ ] **BLOCKED**: Cannot link viewer to recipe on creation
- [ ] **TODO**: Research CommonTools self-reference pattern OR add manual linking UI

**Implementation Status (2025-11-22) - PARTIALLY COMPLETE**:

**What Works**:
- Viewer pattern created and deployed successfully
- Uses `wish()` to read recipe data from sourceRecipeRef
- Completion tracking with arrays: `StepCompletion[]` and `GroupCompletion[]`
- Group checkbox toggles all steps in that group
- Navigation back to recipe with "← Back to Recipe" button
- Timing information display (nights/hours/minutes before serving)
- All viewer UI features functional

**Blocking Issue - Self-Reference**:
Cannot pass current recipe charm reference to viewer on creation. Attempted:
1. Handler with `RecipeOutput` state - handler doesn't receive pattern's full output
2. Pattern return with `self` field - would create circular reference
3. Empty viewer creation `FoodRecipeViewer({})` - TypeScript requires Opaque params
4. Passing `null` - Type error: missing required fields

**Root Cause**: No built-in way in CommonTools to get "self" reference from within pattern

**Potential Solutions**:
1. Research CommonTools docs/examples for self-reference pattern
2. Add manual linking UI to viewer (user pastes recipe URL/charm ID)
3. Use global #mentionable system to find recipes
4. Ask CommonTools community for guidance
5. Defer viewer-recipe linking to Phase 5

**Current Workaround**: Viewer can be deployed standalone and works correctly if sourceRecipeRef
is manually set (would need manual linking UI added to viewer)

### Phase 5: Polish & Future Enhancements
- [ ] Add parallel group support (parallelGroup field)
- [ ] PDF import support
- [ ] Current group highlighting in viewer based on time
- [ ] Scaling affects timing calculations
- [ ] Export to calendar/schedule format

---

## Open Questions / Future Work

### Thanksgiving Planner Integration
The thanksgiving-planner pattern will:
- Import multiple food-recipe patterns
- Create viewers for each recipe
- Coordinate timing across recipes
- Handle oven scheduling (multiple recipes needing oven)
- Show critical path and timeline

**Requirements from food-recipe**:
- ✅ Step groups with timing information
- ✅ Oven requirements (temp, duration)
- ✅ Duration estimates per group
- ✅ Max wait times between groups
- ✅ Rest time (time to rest after cooking)
- ✅ Hold time (time dish can wait while maintaining quality)
- ✅ Category (for meal planning and course organization)
- ✅ Derived ovenRequirements (needsOven, temps, tempChanges)

### Boxing Pattern for Completion Tracking
Need to test if we can extend live-linked recipe data with completion flags:
```typescript
// Can we do this?
const boxedGroups = derive(sourceRecipe.stepGroups, (groups) =>
  groups.map(group => ({ ...group, completed: false }))
);
```

If not, fall back to:
```typescript
completedGroups: Record<string, boolean>
```

### Parallel Execution
Future enhancement: `parallelGroup: string` on steps/groups
- Steps with same parallelGroup can run simultaneously
- Viewer shows them side-by-side or marked with "⚡ Can do together"
- Thanksgiving planner uses this for optimization

### Scaling + Timing
Should scaling servings affect timing?
- Probably not for most cases
- But very large batches might need longer cooking times
- Leave for future enhancement

---

## Testing Strategy

### Test Cases

**Simple Recipe (Phase 1)**:
- Recipe with 1-2 groups
- Basic timing (minutes before serving)
- No oven requirements
- Test extraction from notes
- Test image upload + extraction

**Complex Recipe (Phase 2)**:
- Recipe with 4-5 groups
- Mix of nights before + minutes before timing
- Multiple oven requirements at different temps
- Test group creation/editing/deletion
- Test moving steps between groups
- Test reordering groups

**LLM Timing (Phase 3)**:
- Recipe with unclear timing
- Test "Organize by Timing" tool
- Test "Suggest Wait Times" tool
- Verify suggestions are reasonable

**Viewer (Phase 4)**:
- Create viewer from recipe
- Test completion tracking
- Test live updates when recipe changes
- Test multiple viewers for same recipe
- Test navigation between recipe and viewer

**Thanksgiving Recipe (Integration)**:
- Large turkey recipe (multiple groups, overnight timing)
- Test oven scheduling display
- Test wait time suggestions
- Verify timing makes sense for coordination

---

## Example: Roast Turkey Recipe

This example shows how the new data model represents a complex recipe:

```json
{
  "name": "Classic Roast Turkey",
  "cuisine": "American",
  "servings": 8,
  "difficulty": "medium",
  "prepTime": 30,
  "cookTime": 240,
  "ingredients": [
    { "item": "turkey", "amount": "12", "unit": "lb" },
    { "item": "kosher salt", "amount": "1", "unit": "cup" },
    { "item": "herbs", "amount": "0.25", "unit": "cup" }
  ],
  "stepGroups": [
    {
      "id": "group-1",
      "name": "Up to 2 Days Before",
      "nightsBeforeServing": 2,
      "duration": 30,
      "maxWaitMinutes": 2880,
      "steps": [
        { "description": "Thaw turkey in refrigerator" }
      ]
    },
    {
      "id": "group-2",
      "name": "Night Before",
      "nightsBeforeServing": 1,
      "duration": 30,
      "maxWaitMinutes": 720,
      "steps": [
        { "description": "Prepare brine with salt and herbs" },
        { "description": "Submerge turkey in brine, refrigerate" }
      ]
    },
    {
      "id": "group-3",
      "name": "4 Hours Before Serving",
      "minutesBeforeServing": 240,
      "duration": 195,
      "maxWaitMinutes": 0,
      "requiresOven": {
        "temperature": 325,
        "duration": 180,
        "racksNeeded": {
          "heightSlots": 5,
          "width": "full"
        }
      },
      "steps": [
        { "description": "Remove turkey from brine, pat dry" },
        { "description": "Season with herbs and pepper" },
        { "description": "Preheat oven to 325°F" },
        { "description": "Place turkey in roasting pan, roast until 165°F internal temp" }
      ]
    },
    {
      "id": "group-4",
      "name": "30 Minutes Before Serving",
      "minutesBeforeServing": 30,
      "duration": 30,
      "maxWaitMinutes": 10,
      "steps": [
        { "description": "Remove turkey, tent with foil" },
        { "description": "Let rest while making gravy" },
        { "description": "Make gravy from pan drippings" }
      ]
    },
    {
      "id": "group-5",
      "name": "At Serving",
      "minutesBeforeServing": 0,
      "duration": 10,
      "steps": [
        { "description": "Carve turkey" },
        { "description": "Serve with gravy" }
      ]
    }
  ],
  "tags": ["holiday", "main dish", "poultry"],
  "notes": "",
  "source": "Family recipe"
}
```

---

## File Locations

- **Main pattern**: `patterns/jkomoros/food-recipe.tsx`
- **Viewer pattern**: `patterns/jkomoros/food-recipe-viewer.tsx` (new)
- **Design doc**: `patterns/jkomoros/design/todo/food-recipe-improvements.md` (this file)
- **Work branch**: `food-recipe-improvements` (to be created)

---

## Success Criteria

- [ ] Recipes can be organized into timed step groups
- [ ] LLM extraction creates reasonable step groups automatically
- [ ] Image upload + extraction works smoothly
- [ ] Viewer pattern shows cooking view with checkboxes
- [ ] Viewer stays in sync with source recipe
- [ ] All existing recipes migrate cleanly to new model
- [ ] Ready for thanksgiving-planner pattern to consume

---

**Last Updated**: 2025-11-22
**Status**: Ready to implement
