# TODO: Improve Store Mapper Workflows

## 1. Vision LLM Photo Processing (Partially Working)

### Current State (Commit: 04a3e0c)

**Working**:
- ✅ ct-image-input button "📷 Scan Aisle Signs"
- ✅ Image upload with bidirectional binding ($images)
- ✅ Photo processing structure with generateText()
- ✅ Extraction results display

**Broken**:
- ❌ **Vision LLM API Error**: `image exceeds 5 MB maximum: 6279036 bytes > 5242880 bytes`
- ❌ **Root Cause**: Anthropic's API has hard 5MB limit per image
- ❌ Test images are 6.27MB (too large by ~1MB)
- ❌ Auto-add button blocked by closure limitation (can't pass aisles cell from derive/map/ifElse)

### Next Steps

1. **Image Compression Required**:
   - ct-image-input needs to compress images client-side before upload
   - Target: <4.5MB to leave headroom under 5MB limit
   - Options: Canvas API resize/recompress, or third-party lib
   - See: `recipes/alex/CT-IMAGE-INPUT-DESIGN.md` for compression strategy

2. **Auto-Add Feature**: Requires framework fix for closure limitation (see section 2 below)

3. **Phone-a-Berni**: Ask about:
   - Recommended image compression approach for ct-image-input
   - Whether component should auto-compress or require user configuration
   - Closure limitation workarounds for auto-add buttons

### Test Images
Location: `recipes/alex/WIP/test-images/andronicos-shattuck/`
- 13 real store photos (JPEG, ~4-5MB each)
- Capture aisle signage from Andronico's on Shattuck

---

## 2. Department Assignment Workflow (COMPLETED - Framework Fixed!)

### Status: IMPLEMENTED in store-mapper-v2.tsx

The desired unassigned→assigned workflow is now working! The framework closure limitation that blocked this has been resolved.

### Previous State (When Blocked)

The store-mapper currently uses this approach for perimeter departments:

```typescript
interface PerimeterSection {
  name: string;
  wall: "back" | "left" | "right";
  description: Default<string, "">;
}

interface StoreMapInput {
  perimeter: Default<PerimeterSection[], []>;
  notInStore: Default<string[], []>;
}
```

**UI**: Preset buttons with inline wall selectors (Back/Left/Right buttons for each preset)

## Desired Workflow (Blocked by Framework Limitation)

### Data Model
```typescript
interface DepartmentRecord {
  name: string;
  location: "back" | "left" | "right";
  description: Default<string, "">;
  icon: Default<string, "🏪">;
}

const DEFAULT_DEPARTMENTS: DepartmentPreset[] = [
  { name: "Bakery", icon: "🥖" },
  { name: "Deli", icon: "🥪" },
  { name: "Produce", icon: "🥬" },
  { name: "Dairy", icon: "🥛" },
  { name: "Frozen Foods", icon: "🧊" },
  { name: "Meat & Seafood", icon: "🥩" },
  { name: "Pharmacy", icon: "💊" },
  { name: "Bulk Bins", icon: "📦" },
  { name: "Fromagerie", icon: "🧀" },
  { name: "Eggs", icon: "🥚" },
  { name: "Seafood", icon: "🐟" },
  { name: "Butcher", icon: "🥩" },
];

interface StoreMapInput {
  specialDepartments: Default<DepartmentRecord[], []>;  // Assigned departments
  missingDepartments: Default<string[], typeof DEFAULT_DEPARTMENT_NAMES>;  // Unassigned
}
```

### Desired UX Flow

1. **Unassigned Departments Section**
   - Show each unassigned department with 4 buttons: Left / Right / Back / N/A
   - Clicking Left/Right/Back: Assigns department to that wall
   - Clicking N/A: Dismisses department (not in this store)

2. **Assigned Departments Section**
   - Group by wall location (Left Wall / Right Wall / Back Wall)
   - Show as chips with icons: "🥖 Bakery [×]"
   - Clicking × : Unassigns and moves back to unassigned list

3. **Custom Departments**
   - Input field to add non-standard departments
   - Adds to unassigned list

### Handlers (Index-Based)
```typescript
const assignDepartment = handler<unknown, {
  specialDepartments: Cell<DepartmentRecord[]>;
  missingDepartments: Cell<string[]>;
  index: number;  // Index in missingDepartments array
  location: "back" | "left" | "right";
}>(...)

const unassignDepartment = handler<unknown, {
  specialDepartments: Cell<Array<Cell<DepartmentRecord>>>;
  missingDepartments: Cell<string[]>;
  departmentName: string;  // Name to find and remove
}>(...)

const dismissDepartment = handler<unknown, {
  missingDepartments: Cell<string[]>;
  index: number;  // Index to remove
}>(...)
```

## Previous Blocking Issue (NOW RESOLVED)

**Framework Limitation** (FIXED as of November 2025):

The closure error that prevented passing cells into handlers from `.map()` iterations has been resolved in the framework.

**What was blocked:**
```
Error: Accessing an opaque ref via closure is not supported.
Wrap the access in a derive that passes the variable through.
```

**What now works:**
- Passing cells (like `specialDepartments`, `unassignedDepartments`) into handler closures from `.map()`
- Mapping over cell arrays with buttons that reference parent cells
- The exact pattern we wanted for department assignment

**Implementation**: See `store-mapper-v2.tsx` for working example

## Implementation Complete (November 2025)

All features implemented in `store-mapper-v2.tsx`:

✅ **Unassigned Departments List** - Shows departments not yet assigned
✅ **Granular Positions** - 9 positions: left-front/center/back, back-left/center/right, right-front/center/back
✅ **Assign to Wall** - Click position button → moves to assigned, grouped by wall
✅ **Unassign** - Click × → moves back to unassigned
✅ **Dismiss** - Click N/A → hides from visible list (adds to notInStore)
✅ **Custom Departments** - Input field to add arbitrary departments
✅ **Auto-add Extracted Aisles** - Photo extraction with "+ Add" buttons and conflict detection
✅ **Multiple Images** - Process up to 5 photos at once

No framework workarounds needed - the pattern works as originally designed!

## Benefits of Desired Workflow

- **Clearer mental model**: Unassigned → Assign → Assigned with easy undo
- **Better UX**: See all unassigned departments at once, clear wall grouping
- **Simpler code**: No duplicate preset list, cleaner state management
- **Custom support**: Users can add non-standard departments
- **Icon preservation**: Keeps icon metadata throughout workflow

## Implementation Attempts

Attempted implementation available in git commit `e5ba113` (reverted):
```bash
git show e5ba113:recipes/alex/WIP/store-mapper.tsx
```

All type checks passed but runtime deployment fails with closure error.
