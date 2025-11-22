# Meal Orchestrator Design Document

**Version:** 1.0
**Date:** 2024-11-22
**Status:** Design Phase

---

## Overview

**meal-orchestrator** is an ambitious pattern for planning large multi-dish meals (e.g., Thanksgiving dinner, dinner parties). It coordinates timing, equipment usage, and dietary requirements across multiple recipes to produce an optimized, printable production schedule for the kitchen.

### Key Features

1. **Multi-Recipe Coordination**: Reference multiple food-recipe patterns via @mentions
2. **Equipment Timeline Visualization**: Visual gantt charts showing oven and stovetop usage
3. **Dietary Requirement Checking**: Automatic analysis against guest dietary needs
4. **Meal Balance Analysis**: LLM-powered analysis of menu composition
5. **Production Schedule**: Print-friendly chronological checklist with timing
6. **Optimization Algorithm**: Intelligent scheduling considering constraints

---

## Architecture

### Component Structure

```
meal-orchestrator.tsx
├─ Uses: food-recipe.tsx (via @ references)
│   └─ Embeds: recipe-analyzer.tsx (dietary analysis)
├─ Scheduling Engine (derive + optimization)
├─ Oven Timeline Visualizer (UI component)
├─ Balance Analyzer (LLM via generateObject)
└─ Schedule Generator (derived output)
```

---

## Data Models

### 1. meal-orchestrator Input

```typescript
interface OvenConfig {
  rackPositions: number;  // 3-7 vertical positions in oven
  physicalRacks: number;  // 2-3 actual racks user owns
}

interface GuestDietaryProfile {
  guestName: Default<string, "">;  // Optional: "Sarah" or blank
  requirements: string[];          // Mix of standard + custom "no-X" tags
}

interface MealOrchestratorInput {
  // Event Info
  mealName: Default<string, "">;
  mealDate: Default<string, "">;  // ISO date: "2024-11-28"
  mealTime: Default<string, "">;  // 24hr time: "18:00"
  guestCount: Default<number, 4>;

  // Equipment
  ovens: Default<OvenConfig[], [{
    rackPositions: 5,
    physicalRacks: 2
  }]>;
  stovetopBurners: Default<number, 4>;

  // Dietary Requirements
  dietaryProfiles: Default<GuestDietaryProfile[], []>;

  // Recipes
  recipes: Default<OpaqueRef<Recipe>[], []>;  // @ referenced food-recipes

  notes: Default<string, "">;
}
```

**Standard Dietary Tags:**
```typescript
// Allergies: "nut-free", "dairy-free", "gluten-free", "shellfish-free",
//            "egg-free", "soy-free", "nightshade-free"
// Lifestyle: "vegan", "vegetarian", "pescatarian", "kosher", "halal"
// Health:    "diabetic-friendly", "low-sodium", "keto", "low-FODMAP"
// Custom:    "no-cilantro", "no-mushrooms", "no-INGREDIENT_NAME"
```

### 2. food-recipe Enhancements

**Already implemented in food-recipe-improvements branch:**
- `restTime: number` - Minutes to rest after cooking before serving
- `holdTime: number` - Minutes dish can wait while maintaining quality
- `category: string` - "appetizer" | "main" | "side" | "starch" | "vegetable" | "dessert" | "bread" | "other"
- `stepGroups: StepGroup[]` - Groups of steps with timing and oven requirements

**StepGroup structure:**
```typescript
interface StepGroup {
  id: string;
  name: string;
  nightsBeforeServing?: number;      // 1, 2 for overnight prep
  minutesBeforeServing?: number;     // 240, 60, 30, 0 for day-of timing
  duration?: number;                 // How long this group takes
  maxWaitMinutes?: number;           // Flexibility for scheduling
  requiresOven?: {
    temperature: number;             // Fahrenheit
    duration: number;                // Minutes
    racksNeeded?: {
      heightSlots: number;           // 1=sheet, 2=casserole, 5=turkey
      width: "full" | "half";        // Full or half rack width
    };
  };
  steps: RecipeStep[];
}
```

**New output field:**
```typescript
interface RecipeOutput extends RecipeInput {
  ovenRequirements: {
    needsOven: boolean;
    temps: number[];
    tempChanges: boolean;
  };

  dietaryCompatibility: {          // From embedded recipe-analyzer
    compatible: string[];
    incompatible: string[];
    warnings: string[];
    primaryIngredients: string[];
  };
}
```

### 3. recipe-analyzer.tsx (New Pattern)

**Purpose:** Reusable dietary analysis component embedded in food-recipe

```typescript
interface RecipeAnalyzerInput {
  recipeName: Default<string, "">;
  ingredients: Default<Ingredient[], []>;
  category: Default<string, "">;
  tags: Default<string[], []>;
}

interface RecipeAnalyzerOutput {
  dietaryCompatibility: {
    compatible: string[];           // Tags recipe IS compatible with
    incompatible: string[];         // Tags recipe is NOT compatible with
    warnings: string[];             // Human-readable warnings
    primaryIngredients: string[];   // 5-10 main ingredients
  };
}
```

**Implementation:** Uses `generateObject` with comprehensive dietary tag list to analyze ingredients and generate compatibility data.

---

## UI Components

### 1. Oven Timeline Visualization

**Purpose:** Visual gantt chart showing equipment usage over time

```
Oven 1 (375°F)
Pos 7: |         [Rolls ████]               |
Pos 6: |                                    |
Pos 5: |    [Turkey ████████████████████]   |
Pos 4: |    [Turkey ████████████████████]   | ← Turkey uses 5 slots
Pos 3: |    [Turkey ████████████████████]   |
Pos 2: |    [Turkey ████████████████████]   |
Pos 1: |    [Turkey ████████████████████]   |
       |____________________________________|
       3pm          4pm          5pm      6pm

After turkey is done:
Pos 7: |                [Rolls ████]        |
Pos 6: |                                    |
Pos 5: |                                    |
Pos 4: |                [Casserole ████]    |
Pos 3: |                [Casserole ████]    |
Pos 2: |                                    |
Pos 1: |                                    |
```

**Features:**
- Color-coded blocks per recipe
- Temperature zones (conflicts shown in RED)
- Rack height visualization
- Time axis (hourly ticks)
- Hover tooltips with recipe details

**Constraints Visualized:**
- Only `physicalRacks` dishes at once (e.g., 2)
- Total height must fit in `rackPositions` (e.g., 5)
- Temperature conflicts highlighted
- Overlapping dishes flagged

### 2. Meal Balance Analysis

**Purpose:** LLM-powered menu composition analysis

**Display:**
```
=== Meal Balance ===

Categories:
  🍗 Main:      2 dishes  (Turkey, Ham)
  🥔 Starch:    1 dish   (Mashed Potatoes)
  🥕 Vegetable: 1 dish   (Green Beans)
  🥖 Bread:     1 dish   (Rolls)
  🍰 Dessert:   2 dishes (Pumpkin Pie, Apple Pie)

Portions:
  Total servings: 32
  Guests: 8
  Servings/guest: 4.0 ✓ Good

⚠️ Warnings:
  • No appetizer - guests may arrive hungry
  • 2 desserts for 8 guests might be excessive

💡 Suggestions:
  • Consider adding a side salad

Dietary Compatibility:
  ✓ 2 vegan guests: 1 main option available
  ⚠️ Gluten-free guest: No dessert options
  ⚠️ Nut allergy: Check pie crust ingredients
```

**Implementation:** Uses `generateObject` with:
- Recipe list (names, categories, servings, dietary compatibility)
- Guest count
- Dietary requirements
- LLM generates warnings and suggestions

### 3. Production Schedule

**Purpose:** Printable, chronological checklist for kitchen team

**Format:**
```
========================================
    THANKSGIVING DINNER 2024
    Thursday, Nov 28 • Serving at 6:00 PM
    8 Guests
========================================

TIMELINE

Night Before (Wed, Nov 27)
─────────────────────────────
  8:00 PM  □ Prep Pie Dough (15 min)
              → Can wait up to 24 hrs
              Recipe: Pumpkin Pie

Day Of (Thu, Nov 28)
─────────────────────────────
  2:00 PM  □ Start Turkey Prep (30 min)
              → Oven 1 at 325°F, rack positions 1-5
              Recipe: Roast Turkey

  2:30 PM  □ Turkey in Oven (180 min)
              → Cooking until 5:30 PM

  4:45 PM  □ Start Casserole (45 min)
              ⚠️ WAIT for turkey to finish!
              → Oven 1 at 375°F, rack positions 3-4
              Recipe: Green Bean Casserole

  5:30 PM  □ Turkey Done - REST 20 min
              → Remove from oven, let rest

  5:50 PM  □ Carve Turkey & Prep Serving

  6:00 PM  🍽️ SERVE!

========================================
EQUIPMENT SUMMARY
========================================
Oven 1: 2h45m active time
  • 2:30-5:30 PM: 325°F (Turkey)
  • 4:45-6:00 PM: 375°F (Casserole, Rolls)

Stovetop: 1 burner, 20 min
  • 5:30-5:50 PM: Potatoes

========================================
CONFLICTS & NOTES
========================================
✓ All dishes fit in timeline
✓ No oven conflicts
⚠️ Turkey must rest 20 min - plan accordingly
```

**Features:**
- Checkbox format for tracking progress
- Time estimates and duration
- Equipment and temperature notes
- Visual separators for readability
- Conflict warnings highlighted
- Summary sections at bottom

---

## Optimization Algorithm (High-Level Requirements)

### Goal
Schedule all recipe stepGroups to finish at mealTime while respecting equipment, timing, and quality constraints.

### Constraints

**Hard Constraints (must satisfy):**
1. **Timing**: All dishes ready by `mealTime` (accounting for restTime, holdTime)
2. **Equipment**: No oven conflicts (temperature, rack space, physical rack count)
3. **Stovetop**: Don't exceed available burners
4. **Dependencies**: StepGroups within a recipe must execute in order
5. **Overnight**: StepGroups with `nightsBeforeServing` scheduled accordingly

**Soft Constraints (optimize):**
1. **Freshness**: Minimize wait time between cooking and serving (respect `maxWaitMinutes`)
2. **Efficiency**: Minimize idle equipment time
3. **Practicality**: Avoid too many simultaneous tasks (human bandwidth)

### Algorithm Approach (Hand-Wavy Sketch)

**Phase 1: Backward Scheduling**
- Start from `mealTime` and work backward
- For each recipe:
  - Latest finish time = mealTime - holdTime
  - Latest start time = finish - cookTime - restTime
  - Prep must finish before cook starts

**Phase 2: Oven Bin Packing**
- Group stepGroups by required temperature
- Pack into available oven time slots
- Use rack space as 2D bin packing:
  - Vertical: heightSlots must fit in rackPositions
  - Horizontal: only physicalRacks dishes at once
  - Width: "full" dishes block row, "half" can share

**Phase 3: Conflict Resolution**
- Detect conflicts (temperature mismatches, insufficient space)
- Apply flexibility via `maxWaitMinutes`:
  - Shift flexible tasks earlier
  - Prioritize time-sensitive items (low maxWait)
- Flag unresolvable conflicts for user

**Phase 4: Human Optimization**
- Spread prep tasks to avoid overload
- Cluster similar tasks when possible
- Flag periods of high activity for user awareness

**Future Enhancements:**
- Use constraint solver (e.g., Google OR-Tools via WebAssembly)
- Multi-objective optimization (Pareto frontier)
- Interactive schedule adjustment (drag to reschedule)
- AI-powered suggestions ("Start turkey 30 min earlier to reduce stress")

### MVP Implementation
For initial version, use simpler heuristics:
1. Sort recipes by: inflexibility (low maxWait first), duration (longest first)
2. Schedule greedily backward from mealTime
3. Flag conflicts, don't auto-resolve (manual adjustment)
4. Display schedule even if suboptimal

---

## Implementation Plan

### Phase 1: Foundation (Week 1-2)
**Goal:** Get basic structure working

- [ ] Create `recipe-analyzer.tsx`
  - Implement dietary compatibility LLM analysis
  - Test with various ingredient lists
  - Validate tag coverage

- [ ] Integrate `recipe-analyzer` into `food-recipe.tsx`
  - Embed as sub-pattern
  - Export `dietaryCompatibility` output
  - Add optional UI card to display results

- [ ] Create `meal-orchestrator.tsx` skeleton
  - Define input schema
  - Basic UI layout (sections for inputs)
  - Recipe @ reference system

### Phase 2: Analysis Features (Week 3)
**Goal:** Non-scheduling features working

- [ ] Meal Balance Analysis
  - Implement LLM call with recipe summary
  - Display category breakdown
  - Show portion analysis
  - Dietary warnings

- [ ] Equipment Configuration
  - Oven config inputs (positions, racks)
  - Stovetop burners
  - Save/load equipment presets (future)

- [ ] Dietary Profiles
  - Add guest profile inputs
  - Standard tag dropdown
  - Custom "no-X" tag support
  - Match against recipe compatibility

### Phase 3: Scheduling Engine (Week 4-5)
**Goal:** Basic scheduling algorithm

- [ ] Parse stepGroups from recipes
  - Extract timing (nights/minutes before serving)
  - Extract oven requirements
  - Build dependency graph

- [ ] Simple Backward Scheduler
  - Calculate ideal times for each stepGroup
  - Account for restTime, holdTime
  - No conflict resolution yet

- [ ] Timeline Data Structure
  - Time-indexed schedule representation
  - Equipment allocation tracking
  - Support for multi-day timelines

### Phase 4: Visualization (Week 6)
**Goal:** Visual timeline displays

- [ ] Oven Timeline Component
  - Horizontal time axis
  - Vertical rack positions
  - Colored blocks for recipes
  - Temperature zones

- [ ] Schedule Display
  - Chronological checklist format
  - Checkboxes for completion tracking
  - Equipment notes
  - Print-friendly CSS

- [ ] Conflict Indicators
  - Highlight oven conflicts in RED
  - Show insufficient rack space
  - Flag impossible schedules

### Phase 5: Optimization (Week 7-8)
**Goal:** Intelligent scheduling

- [ ] Conflict Detection
  - Oven temperature conflicts
  - Rack space validation
  - Stovetop burner limits
  - Human bandwidth warnings

- [ ] Flexibility-Based Rescheduling
  - Use `maxWaitMinutes` to shift tasks
  - Heuristic ordering (inflexible first)
  - Iterative improvement

- [ ] Schedule Validation
  - Check all constraints
  - Generate warnings/errors
  - Suggest manual adjustments

### Phase 6: Polish (Week 9+)
**Goal:** Production ready

- [ ] Error Handling
  - Graceful degradation
  - Helpful error messages
  - Recovery suggestions

- [ ] Performance
  - Optimize for many recipes (10+)
  - Lazy computation where possible
  - Debounce schedule recalculation

- [ ] UX Improvements
  - Loading states
  - Interactive timeline editing
  - Export schedule as PDF/print
  - Save/load meal plans

- [ ] Testing
  - Test with real Thanksgiving menu
  - Validate complex scenarios
  - Edge case handling

---

## Example Use Cases

### Example 1: Small Thanksgiving (4 people)

**Inputs:**
- Meal: Thanksgiving 2024, Nov 28, 6:00 PM
- Guests: 4 (1 vegetarian)
- Equipment: 1 oven (5 positions, 2 racks), 4 burners
- Recipes:
  - Turkey (12 lb)
  - Mashed Potatoes
  - Green Beans
  - Rolls
  - Pumpkin Pie

**Expected Output:**
- Schedule starting ~2:30 PM
- Pie baked early, finishes by 4:00 PM
- Turkey 2:30-5:30 PM (with rest)
- Sides 5:00-6:00 PM (after turkey out)
- Warning: "Vegetarian guest has limited main options"

### Example 2: Large Dinner Party (12 people)

**Inputs:**
- Meal: Dinner Party, Dec 15, 7:30 PM
- Guests: 12 (2 vegan, 1 gluten-free, 1 nut allergy)
- Equipment: 2 ovens (5 pos/2 racks each), 6 burners
- Recipes: 8 dishes across all categories

**Expected Output:**
- Multi-oven coordination
- Dietary warnings for each restricted guest
- Complex timeline with parallel cooking
- Potential conflicts flagged

---

## Open Questions / Future Work

1. **Multi-day events**: Wedding weekends, meal prep sessions
2. **Scaling recipes**: Auto-scale to guest count
3. **Shopping lists**: Aggregate ingredients across recipes
4. **Equipment presets**: Save kitchen configuration
5. **Recipe substitutions**: "Swap for gluten-free version"
6. **Interactive rescheduling**: Drag timeline blocks to adjust
7. **Real-time timers**: Browser notifications (needs timer support)
8. **Collaboration**: Multiple people coordinating
9. **Historical data**: Learn from past events
10. **AI suggestions**: "This schedule is ambitious - consider starting earlier"

---

## Success Criteria

**MVP is successful if:**
- [ ] User can plan Thanksgiving dinner for 8 people
- [ ] Schedule is reasonable and practical
- [ ] Oven conflicts are detected
- [ ] Dietary warnings are accurate
- [ ] Production schedule is printable and usable

**Full success if:**
- [ ] Handles complex scenarios (12+ guests, multiple ovens)
- [ ] Optimization meaningfully improves schedules
- [ ] Users report reduced stress during meal execution
- [ ] Pattern is reusable for other events (dinner parties, potlucks)

---

## References

- `food-recipe.tsx` (food-recipe-improvements branch)
- `food-recipe-viewer.tsx` (viewing/cooking mode)
- Pattern composition examples in labs/docs
- LLM integration: `generateObject` documentation

---

**End of Design Document**
