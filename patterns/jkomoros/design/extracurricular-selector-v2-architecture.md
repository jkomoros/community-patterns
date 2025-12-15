# Extracurricular Selector v2 - Architecture Design

**Status:** Draft for Framework Author Review
**Date:** 2025-12-15
**Author:** jkomoros + Claude

---

## Purpose

This document proposes an idiomatic architecture for rebuilding the extracurricular-selector pattern from scratch. The current implementation (v1) suffers from ConflictErrors and uses React-style patterns that don't fit the framework's design philosophy.

**Goal:** Get framework author feedback on this design before implementation.

---

## Use Case Summary

A pattern to help parents select compatible extracurricular activities for their child from multiple sources (afterschool programs, external classes).

### Core Features
1. **LLM Import** - Paste messy HTML/text, extract structured class data with eligibility triage
2. **Child Profile** - Grade/age-based automatic filtering during import
3. **Pinned Sets** - Compare multiple schedule alternatives side-by-side
4. **Conflict Detection** - Account for travel time between locations
5. **Status Tracking** - Track registration progress (Registered → Confirmed → Paid → On-Calendar)
6. **Friend Tracking** - Know which friends are interested in which classes

### User Workflow
```
1. Configure: Add locations, set child profile
2. Import: Paste schedule text → LLM extracts classes → Triage → Confirm import
3. Build: Pin classes to sets, see conflicts, compare schedules
4. Track: Mark registration status, see dashboard summary
```

---

## Current Problems (v1)

### 1. ConflictError on Page Load
The v1 pattern gets CAS (compare-and-swap) conflicts immediately on load, before any user interaction. Likely caused by:
- 17 separate `Default<>` input cells initializing concurrently
- Non-idempotent computed (uses `Date.now()` in ID generation)

### 2. React-y Anti-Patterns
Framework author feedback:
> "In our system you'd want to not have local IDs and accumulate state per object."

Current v1 patterns that violate this:
```typescript
// ❌ Separate ID map for selection state
stagedClassSelections: Record<string, boolean>;

// ❌ ID-based status tracking
interface ClassStatus {
  classId: string;
  statuses: Record<string, boolean>;
}

// ❌ Local ID generation
id: generateId(),  // Math.random()

// ❌ ID-based cross-references
interface Class {
  locationId: string;
  locationName: string;  // Denormalized
}
```

---

## Proposed Architecture

### Design Principles

1. **State lives ON objects** - No separate ID maps
2. **No local ID generation** - Use `Cell.equals()` for identity
3. **Embed references** - Store Location object, not locationId
4. **Fewer top-level cells** - Reduce concurrent Default<> initializations

### Data Model

```typescript
type Grade = "PK" | "TK" | "K" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type LocationType = "afterschool-onsite" | "afterschool-offsite" | "external";
type TriageStatus = "auto_kept" | "auto_discarded" | "needs_review";

// ============================================================================
// CORE ENTITIES
// ============================================================================

interface Location {
  name: string;
  type: LocationType;
  address: string;
  hasFlatDailyRate: boolean;
  dailyRate: number;
}

interface TimeSlot {
  day: DayOfWeek;
  startTime: string;  // "15:00"
  endTime: string;    // "16:30"
}

interface StatusFlags {
  registered: boolean;
  confirmed: boolean;
  waitlisted: boolean;
  paid: boolean;
  onCalendar: boolean;
}

// The main Class entity - ALL state embedded on the object
interface Class {
  // Core data
  name: string;
  description: string;
  location: Location;           // EMBEDDED reference, not ID
  categoryTags: string[];       // Tag names directly, not IDs
  timeSlots: TimeSlot[];
  cost: number;
  costPer: "semester" | "month" | "session";
  gradeMin: string;
  gradeMax: string;
  startDate: string;
  endDate: string;

  // STATE ON OBJECT (not in separate maps)
  pinnedInSets: string[];       // ["Set A", "Set B"] - which sets this class is pinned to
  statuses: StatusFlags;        // Registration status tracking
  statusNotes: string;          // User notes about this class
}

// Staged class during import (extends Class with triage info)
interface StagedClass extends Class {
  triageStatus: TriageStatus;
  eligibilityReason: string;
  eligibilityConfidence: number;
  selected: boolean;            // Import selection state ON object
}

interface ChildProfile {
  name: string;
  grade: Grade;
  birthDate: string;
  eligibilityNotes: string;
}

interface Friend {
  name: string;
  // Embedded class interests (not separate FriendClassInterest collection)
  classInterests: Array<{
    class: Class;               // Direct reference, not name string (use .equals() to compare)
    certainty: "confirmed" | "likely" | "maybe";
  }>;
}

// Travel time between location pairs
interface TravelTime {
  fromLocation: Location;       // EMBEDDED reference
  toLocation: Location;         // EMBEDDED reference
  minutes: number;
}

// ============================================================================
// PATTERN INPUT - Consolidated (fewer cells)
// ============================================================================

interface ExtracurricularInput {
  // Child profile - single nested object
  child: Default<ChildProfile, {
    name: "",
    grade: "K",
    birthDate: "",
    eligibilityNotes: ""
  }>;

  // Core data collections
  locations: Default<Location[], []>;
  classes: Default<Class[], []>;
  friends: Default<Friend[], []>;
  travelTimes: Default<TravelTime[], []>;
  categoryTags: Default<string[], ["Robotics", "Dance", "Art", "Music", "Sports"]>;

  // Pinned set configuration
  pinnedSetNames: Default<string[], ["Set A"]>;
  activeSetName: Default<string, "Set A">;

  // Import state (transient but useful to persist)
  importText: Default<string, "">;
  importLocation: Location | null;  // Direct reference to selected location
}

// Total: 10 top-level inputs (down from 17 in v1)
```

---

## Key Workflows

### 1. Adding a Location

```typescript
// User fills form, clicks Add
const addLocation = () => {
  locations.push({
    name: formName,
    type: formType,
    address: formAddress,
    hasFlatDailyRate: false,
    dailyRate: 0,
  });
};
```

### 2. Import Flow

```typescript
// 1. User selects location from dropdown
// importLocation binds directly to the selected Location object

// 2. User pastes text and clicks "Extract"
const extractionResult = generateObject<ExtractionResponse>({
  prompt: computed(() => `Extract classes from: ${importText}\nChild: ${child.name}, Grade: ${child.grade}`),
});

// 3. Computed transforms extraction to StagedClass[] with selection state
const stagedClasses = computed(() => {
  const result = extractionResult?.classes ?? [];
  if (!importLocation) return [];  // Direct reference, no lookup needed

  return result.map(cls => ({
    ...cls,
    location: importLocation,  // Embed the actual Location object
    selected: cls.triageStatus === "auto_kept",  // Default selection ON object
    pinnedInSets: [],
    statuses: { registered: false, confirmed: false, waitlisted: false, paid: false, onCalendar: false },
    statusNotes: "",
  }));
});

// 4. Triage UI - $checked binds directly to object property
{stagedClasses.map(cls => (
  <ct-checkbox $checked={cls.selected}>
    {cls.name}
  </ct-checkbox>
))}

// 5. Confirm import - filter by property, push to classes
const confirmImport = () => {
  const toImport = stagedClasses.filter(c => c.selected);
  // Remove triage fields when converting to Class
  const newClasses = toImport.map(({ triageStatus, eligibilityReason, eligibilityConfidence, selected, ...cls }) => cls);
  classes.push(...newClasses);
  importText.set("");
};
```

### 3. Pinned Sets

```typescript
// Pin a class to the active set
const togglePin = (cls: Class) => {
  const sets = cls.pinnedInSets;
  if (sets.includes(activeSetName)) {
    // Unpin - remove from set
    const updated = sets.filter(s => s !== activeSetName);
    // Need to update the class in the array
    const idx = classes.findIndex(c => Cell.equals(c, cls));
    if (idx >= 0) {
      classes.set(classes.get().toSpliced(idx, 1, { ...cls, pinnedInSets: updated }));
    }
  } else {
    // Pin - add to set
    const idx = classes.findIndex(c => Cell.equals(c, cls));
    if (idx >= 0) {
      classes.set(classes.get().toSpliced(idx, 1, { ...cls, pinnedInSets: [...sets, activeSetName] }));
    }
  }
};

// Get classes in active set
const pinnedClasses = computed(() =>
  classes.filter(c => c.pinnedInSets.includes(activeSetName))
);
```

### 4. Status Tracking

```typescript
// Toggle a status flag on a class
const toggleStatus = (cls: Class, statusKey: keyof StatusFlags) => {
  const idx = classes.findIndex(c => Cell.equals(c, cls));
  if (idx >= 0) {
    const updated = {
      ...cls,
      statuses: { ...cls.statuses, [statusKey]: !cls.statuses[statusKey] }
    };
    classes.set(classes.get().toSpliced(idx, 1, updated));
  }
};

// Or with $checked binding if framework supports nested property paths
<ct-checkbox $checked={cls.statuses.registered}>Registered</ct-checkbox>
```

### 5. Conflict Detection

```typescript
// Compute conflicts between all class pairs
const conflicts = computed(() => {
  const result: Array<{ class1: Class; class2: Class; reason: string }> = [];

  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const a = classes[i];
      const b = classes[j];
      const conflict = checkConflict(a, b, travelTimes);
      if (conflict) {
        result.push({ class1: a, class2: b, reason: conflict });
      }
    }
  }
  return result;
});

function checkConflict(a: Class, b: Class, travelTimes: TravelTime[]): string | null {
  // Check each time slot pair
  for (const slotA of a.timeSlots) {
    for (const slotB of b.timeSlots) {
      if (slotA.day !== slotB.day) continue;

      // Get travel time if different locations
      let buffer = 0;
      if (!Cell.equals(a.location, b.location)) {
        const travel = travelTimes.find(t =>
          (Cell.equals(t.fromLocation, a.location) && Cell.equals(t.toLocation, b.location)) ||
          (Cell.equals(t.fromLocation, b.location) && Cell.equals(t.toLocation, a.location))
        );
        buffer = travel?.minutes ?? 15;
      }

      // Check overlap with buffer
      if (timesOverlap(slotA, slotB, buffer)) {
        return `${slotA.day}: ${a.name} and ${b.name} overlap`;
      }
    }
  }
  return null;
}
```

---

## Framework Author Feedback (Resolved)

**Reviewer:** seefeldb (2025-12-15)

### 1. Cross-Collection References ✅

**Answer:** Yes, embedding is correct. Use direct object references.
```typescript
interface Class {
  location: Location;  // ✅ Correct - direct reference
}
```

### 2. Friend Class Interests ✅

**Answer:** Use object reference, not name string.
```typescript
// ❌ Wrong
classInterests: Array<{ className: string; ... }>;

// ✅ Correct
classInterests: Array<{ class: Class; ... }>;
```

### 3. generateObject Syntax ✅

**Answer:** Can use type parameter instead of schema:
```typescript
// ✅ Shorter form
generateObject<ExtractionResponse>({ prompt: ... })

// Also valid
generateObject({ prompt: ..., schema: toSchema<ExtractionResponse>() })
```

### 4. Use .equals() Not Name Matching ✅

**Answer:** Always use `.equals()` for object comparison, not string names.
```typescript
// ❌ Wrong
locations.find(l => l.name === importLocationName)

// ✅ Correct - use direct reference, no lookup needed
if (!importLocation) return [];
// importLocation is already the Location object
```

### 5. String-Based Sets ✅

**Answer:** Using strings for set names (like tags) is fine.
```typescript
pinnedInSets: string[];  // ✅ OK - sets by name like tags
pinnedSetNames: string[];  // ✅ OK
```

### 6. Boxing Selected/Active State (NEW GUIDANCE)

**Important pattern for selected state:**

> "Let's make sure to add guidance to box active/selected/etc selections. So write into something of type `Cell<{ selected: Cell<...> }>`. Then this will be `active.selected` or so. This avoids the `Cell<Cell<...>>` stuff that is brittle."

```typescript
// ❌ Avoid Cell<Cell<...>>
const selected = cell<Cell<Class> | null>(null);

// ✅ Better - box the selection
interface Selection {
  selected: Cell<Class | null>;
}
const active = cell<Selection>({ selected: null });

// Access via:
active.selected  // The selected class
```

This pattern is cleaner for tracking which item is currently active/selected.

---

## Implementation Phases (After Review)

### Phase 1: Core Data Model
- Create new pattern file with idiomatic types
- Implement location CRUD
- Implement manual class entry
- Verify no ConflictError

### Phase 2: Import Flow
- LLM extraction with triage
- Selection state on staged classes
- Confirm import

### Phase 3: Selection Builder
- Pinned sets
- Conflict detection
- Weekly schedule view

### Phase 4: Status & Polish
- Status tracking
- Friend tracking
- Dashboard summary

---

## Reference Patterns

| Pattern | What to Learn |
|---------|---------------|
| `patterns/examples/todo-list.tsx` | State-on-object (`done: boolean`), `$checked` binding |
| `patterns/jkomoros/cozy-poll.tsx` | Arrays without ID maps |
| `patterns/jkomoros/shopping-list-launcher.tsx` | `Cell.equals()` for identity |
| `patterns/jkomoros/food-recipe.tsx` | Nested arrays, embedded state |

---

## Feedback Requested

1. Does this architecture look idiomatic?
2. Are the open questions the right ones to be asking?
3. Any patterns or approaches I'm missing?
4. Is there a simpler design that achieves the same goals?
