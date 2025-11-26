# Food Recipe Pattern - Major Improvements

**Goal**: Enhance food-recipe pattern to support timing/scheduling, viewer mode, and image import - ultimately to support a thanksgiving-planner pattern that can schedule multiple recipes.

## Current Status

**Completed Phases:**
- ✅ Phase 1: Data Model + Basic UI - StepGroup interface, migration logic, notes at top, image upload, LLM extraction with stepGroups
- ✅ Phase 3: LLM Timing Tools - "Organize by Timing" and "Suggest Wait Times" buttons with modal UI
- ✅ Phase 4: Viewer Pattern - food-recipe-viewer.tsx with completion tracking

**Additional fields added:** `restTime`, `holdTime`, `category` input fields and `ovenRequirements` derived output field for meal scheduling and oven coordination.

## Remaining Work

### Phase 2: Step Group Management UI
- [ ] Add group creation/deletion UI (inline management)
- [ ] Add group editing (name, timing, duration, oven requirements)
- [ ] Add step management within groups (add/edit/delete steps)
- [ ] Add ability to move steps between groups
- [ ] Add group reordering (drag-drop or move buttons)
- [ ] Update LLM extraction preview to show groups
- [ ] Test with complex recipe (multiple groups)

**Visual Structure for Phase 2:**
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
│  [+ Add Group]                                    │
└───────────────────────────────────────────────────┘
```

### Phase 5: Polish & Future Enhancements
- [ ] Add parallel group support (parallelGroup field)
- [ ] PDF import support
- [ ] Current group highlighting in viewer based on time
- [ ] Scaling affects timing calculations
- [ ] Export to calendar/schedule format

## Data Model Reference

```typescript
interface StepGroup {
  id: string;
  name: string;
  nightsBeforeServing?: number;  // OR minutesBeforeServing (not both)
  minutesBeforeServing?: number;
  duration?: number;
  maxWaitMinutes?: number;
  requiresOven?: {
    temperature: number;
    duration: number;
    racksNeeded?: { heightSlots: number; width: "full" | "half"; };
  };
  steps: RecipeStep[];
}
```

## File Locations
- **Main pattern**: `patterns/jkomoros/food-recipe.tsx`
- **Viewer pattern**: `patterns/jkomoros/food-recipe-viewer.tsx`
