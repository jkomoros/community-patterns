# Extracurricular Selector Pattern - Implementation Plan

## Acceptance Testing Feedback (2025-12-13)

**UX Issues to Address:**

1. **Settings as Dialog** - Settings panel at bottom is awkward. Should be a dialog that:
   - Auto-opens on first visit (when no locations configured)
   - Can be reopened later via a settings button/icon

2. **Location Types** - Current options (afterschool/private_school/external) are confusing. Better:
   - `afterschool-onsite` - At the school
   - `afterschool-offsite` - Requires travel from school
   - `external` - Standalone class location

3. **Add Location Button** - Too subtle, looks like text not a button. Make it a proper styled button.

4. **Travel Time Entry** - Need manual entry for travel times between location pairs, not just 15-min default. Add a travel time matrix UI in Settings.

5. **Image Import** - Add ability to upload an image (photo of schedule) and have LLM extract text from it before import processing.

6. **File Upload** - Add `ct-file-upload` component for importing schedule files (PDF, text, etc.)

## Acceptance Testing Feedback (2025-12-14)

**Future Enhancement:**

7. **Merge File/Photo Upload** - Currently there are separate "Upload File" and "Upload Photo" buttons. Ideally this would be a single upload that auto-detects if the file is an image (for OCR extraction) vs text/PDF. Lower priority - add to future phase.

---

## Overview

A pattern to help parents select compatible extracurricular activities from multiple sources (afterschool programs, private schools, external classes). Key features:
- LLM extraction from messy HTML/text with eligibility triage
- Child profile for automatic filtering
- Multiple "pinned sets" to compare schedule alternatives
- Conflict detection with travel time consideration
- Status tracking (Registered, Confirmed, Paid, On-Calendar)
- Friend co-enrollment tracking

## User Requirements Summary

| Requirement | Decision |
|-------------|----------|
| Data entry | Both LLM extraction AND manual entry |
| Selection UX | Pinned classes + suggested sets & individuals side-by-side |
| Friend logic | Named friends with specific classes |
| Status tracking | Configurable checkboxes (Registered, Confirmed, Waitlisted, Paid, On-Calendar) |
| Term model | Track dates per-source but treat as unified for scheduling |
| Import triage | Categorized: Auto-kept, Auto-discarded, Needs-Review |
| Child profile | Stored (grade K, eligibility rules reused across imports) |
| MVP priority | **Full import flow first**, then selection builder |

---

## Data Model

### Core Types

```typescript
// Child profile
interface ChildProfile {
  name: string;
  grade: "PK" | "TK" | "K" | "1" | "2" | "3" | "4" | "5";
  birthDate: string; // ISO for age calc
  eligibilityNotes: string; // Custom rules
}

// Location/Source
interface Location {
  id: string;
  name: string; // "TBS", "BAM", "Shawl-Anderson Dance"
  type: "afterschool" | "private_school" | "external";
  address?: string;
  hasFlatDailyRate: boolean;
  dailyRate?: number;
}

// Travel times (pairwise)
interface TravelTime {
  fromLocationId: string;
  toLocationId: string;
  minutes: number;
}

// Category tag (controlled vocabulary)
interface CategoryTag {
  id: string;
  name: string; // "Robotics", "Dance", "Art", "Music"
  color?: string; // for display
}

// Time slot (arbitrary start/end - no standard blocks)
interface TimeSlot {
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
  startTime: string; // "15:00" - arbitrary, classes have varied times
  endTime: string;   // "16:45" - no standard durations
}

// Class (after import)
interface Class {
  id: string;
  name: string;
  locationId: string;
  locationName: string; // cached
  timeSlots: TimeSlot[];
  cost: number;
  costPer: "semester" | "month" | "session";
  categoryTagIds: string[]; // 0-n tags from controlled vocabulary
  categoryTagNames: string[]; // cached for display
  gradeMin?: string;
  gradeMax?: string;
  description?: string;
  // Semester info
  startDate?: string;
  endDate?: string;
}

// Friend tracking
interface Friend {
  id: string;
  name: string;
}

interface FriendClassInterest {
  friendId: string;
  friendName: string;
  classId: string;
  className: string;
  certainty: "confirmed" | "likely" | "maybe";
}

// Preference priorities (ranked)
interface PreferencePriority {
  rank: number;
  type: "category" | "specific_class";
  categoryId?: string;
  classId?: string;
  displayName: string;
}

// Status tracking
interface ClassStatus {
  classId: string;
  statuses: Record<string, boolean>; // { registered: true, paid: false }
  notes?: string;
}

// Pinned set
interface PinnedSet {
  id: string;
  name: string;
  classIds: string[];
}

// Import staging
type TriageStatus = "auto_kept" | "auto_discarded" | "needs_review" | "user_kept" | "user_discarded";

interface StagedClass extends Class {
  triageStatus: TriageStatus;
  eligibilityReason: string;
  eligibilityConfidence: number;
}
```

### Pattern Input/Output

```typescript
interface ExtracurricularSelectorInput {
  childProfile: Default<ChildProfile, { name: "", grade: "K", birthDate: "" }>;
  locations: Default<Location[], []>;
  travelTimes: Default<TravelTime[], []>;
  categoryTags: Default<CategoryTag[], []>; // Controlled vocabulary for class categories
  classes: Default<Class[], []>;
  friends: Default<Friend[], []>;
  friendInterests: Default<FriendClassInterest[], []>;
  preferencePriorities: Default<PreferencePriority[], []>;
  classStatuses: Default<ClassStatus[], []>;
  pinnedSets: Default<PinnedSet[], []>;
  activePinnedSetId: Default<string, "">;
  // Import state
  stagedClasses: Default<StagedClass[], []>;
  importText: Default<string, "">;
  importLocationId: Default<string, "">;
}
```

---

## Implementation Phases

### Phase 1: MVP - Import Flow (Priority)

**Goal**: Get classes into the system via LLM extraction with triage

#### 1.1 Basic Structure
- Create pattern file at `patterns/jkomoros/WIP/extracurricular-selector.tsx`
- Set up 4-tab layout: Dashboard | Import | Selection | Settings
- Implement child profile form in Settings tab

#### 1.2 Location Management
- Add/edit/delete locations
- Pairwise travel time matrix (simple table UI for now)
- Mark locations with flat daily rate (TBS constraint)

#### 1.3 LLM Import Flow
- Large textarea for pasting HTML/text
- Location dropdown to select source
- `generateObject` extraction with schema:

```typescript
interface ExtractionSchema {
  classes: Array<{
    name: string;
    dayOfWeek: string;
    startTime: string;  // Arbitrary times like "15:15", "16:45" - no standard blocks
    endTime: string;
    cost: number | null;
    suggestedTags: string[];  // LLM suggests tag names from existing + new
    gradeRange: string | null;
    eligibility: {
      eligible: boolean | "uncertain";
      reason: string;
      confidence: number;
    };
  }>;
  suggestedNewTags: string[];  // Tags not in existing vocabulary - user approves adding
}
```

**Category tag workflow during import:**
1. LLM sees existing `categoryTags` vocabulary in prompt
2. LLM assigns existing tags where they fit, suggests new tag names where needed
3. `suggestedNewTags` lists any new tags LLM wants to create
4. User reviews and approves new tags before import finalizes
5. Ensures consistency: "Robotics" not "Lego Robotics" vs "lego-robotics"

#### 1.4 Triage UI
- Three sections with backgrounds:
  - Green: Auto-kept (eligible=true, confidence≥0.8)
  - Yellow: Needs-review (uncertain or low confidence)
  - Gray/collapsed: Auto-discarded (eligible=false)
- Checkboxes to include/exclude
- "Confirm Import" button moves selected to main classes list

#### 1.5 Manual Entry
- Quick form: name, location, day, start/end time, cost, category
- Add single class directly to pool

### Phase 2: Selection Builder

**Goal**: Build schedules with pinned sets and suggestions

#### 2.1 Pinned Sets
- Tabs for multiple sets (Set A, Set B, etc.)
- Add/remove/rename sets
- Classes in a set shown as day-grouped list

#### 2.2 Conflict Detection
- Pre-compute conflict graph from all classes
- Account for travel time between locations
- Visual indicators (red border) for conflicts

#### 2.3 Suggestions Panel (Side-by-side)
- **Left column**: Suggested sets (2-3 coherent groupings)
  - Group by category focus or friend overlap
  - "Add All" button per set
- **Right column**: Individual ranked classes
  - Score by: preference rank + friend bonus - travel penalty
  - Show marginal value if added

#### 2.4 "What becomes incompatible"
- On hover/select of unpinned class, highlight what would be blocked
- Tooltip showing conflict reason

### Phase 3: Status & Polish

#### 3.1 Status Tracking
- Per-class checkbox row: Registered, Confirmed, Waitlisted, Paid, On-Calendar
- Dashboard summary cards showing completion counts

#### 3.2 Friend Tracking
- Add friends with names
- Link friends to classes they're interested in
- Show friend badges on classes in selection UI

#### 3.3 TBS Constraint
- Warn when partial TBS day selected
- Show cost impact of TBS day decisions

---

## UI Layout

### Tab 1: Dashboard
```
+------------------------------------------+
| Child: Adeline (Grade K)                 |
+------------------------------------------+
| WEEKLY SCHEDULE (active set)             |
| [Visual week grid with pinned classes]   |
+------------------------------------------+
| STATUS SUMMARY                           |
| [5 registered] [3 confirmed] [2 paid]    |
+------------------------------------------+
```

### Tab 2: Import
```
+------------------------------------------+
| Source: [Location dropdown]              |
| [Large textarea for pasting]             |
| [Extract Classes] button                 |
+------------------------------------------+
| TRIAGE RESULTS                           |
| ✅ Ready to Import (3)                   |
|    □ Ballet 1 - Mon 3:00                 |
|    □ Art Class - Tue 4:00                |
| ⚠️ Needs Review (2)                      |
|    □ Drama - grade unclear               |
| ❌ Auto-Discarded (5) [expand]           |
+------------------------------------------+
| [Confirm Import]                         |
+------------------------------------------+
```

### Tab 3: Selection Builder
```
+------------------+------------------------+
| PINNED SCHEDULE  | SUGGESTIONS            |
| [Set A][Set B][+]|                        |
+------------------+ SUGGESTED SETS         |
| Monday           | "STEM Focus" [Add All] |
|  Chess 3:00-4:00 | "Active" [Add All]     |
| Tuesday          +------------------------+
|  (empty)         | AVAILABLE CLASSES      |
| Wednesday        | □ Robotics  +15 pts    |
|  Art 3:30-5:00   | □ Soccer    +12 pts    |
+------------------+ ⚠️ Piano (conflict)    |
| Cost: $450/sem   |                        |
| Conflicts: None  |                        |
+------------------+------------------------+
```

### Tab 4: Settings
```
+------------------------------------------+
| CHILD PROFILE                            |
| Name: [________] Grade: [K ▼]            |
| Notes: [________________________]        |
+------------------------------------------+
| LOCATIONS                                |
| [TBS] [BAM] [Dance Studio] [+ Add]       |
+------------------------------------------+
| TRAVEL TIMES                             |
| [Matrix table]                           |
+------------------------------------------+
| PREFERENCES                              |
| 1. Robotics  2. Dance  3. Art [Edit]     |
+------------------------------------------+
| FRIENDS                                  |
| Sofia, Emma [+ Add]                      |
+------------------------------------------+
```

---

## Scoring Algorithm

```typescript
function scoreClass(cls: Class, currentPins: Set<string>): number {
  let score = 0;

  // Preference rank (priority 1 = 100pts, priority 2 = 70pts, etc.)
  const prefRank = preferencePriorities.findIndex(p => p.categoryId === cls.category);
  if (prefRank >= 0) score += 100 * Math.pow(0.7, prefRank);

  // Friend bonus (+15 per friend)
  const friendsInClass = friendInterests.filter(fi => fi.classId === cls.id);
  score += friendsInClass.length * 15;

  // Travel penalty (-10 per new location transition)
  const transitions = countNewTransitions(cls, currentPins);
  score -= transitions * 10;

  // TBS partial day penalty (-25)
  if (wouldCreatePartialTBSDay(cls, currentPins)) score -= 25;

  return score;
}
```

---

## Critical Reference Files

| File | What to Reference |
|------|-------------------|
| `patterns/jkomoros/person.tsx` | LLM extraction with triage, apply/cancel pattern |
| `patterns/jkomoros/hosting-tracker.tsx` | Multi-entity relationships, tabbed layout, status tracking |
| `patterns/jkomoros/cozy-poll.tsx` | Multi-criterion ranking with derive() |
| `patterns/jkomoros/cheeseboard-schedule.tsx` | Preference UI, badge styling |
| `patterns/jkomoros/calendar-event-manager.tsx` | Staged confirmation flow |
| `labs/docs/common/LLM.md` | generateObject schema requirements |

---

## Key Implementation Notes

1. **Use derive() for conflict graph** - Compute once, update reactively
2. **Cell references within collections** - Use `.equals()` and pass Cell refs, not IDs, when working within a single array
3. **IDs for cross-entity relationships** - For relationships between different entity types (e.g., Class → Location), use string IDs since Cell refs aren't JSON-serializable across collections
4. **Cached display names** - Store locationName on Class for display (denormalize for convenience)
5. **generateObject schema must be object** - Wrap arrays in object root
6. **Use handlers for mutations** - All state changes through handlers
7. **TBS constraint** - Check `location.hasFlatDailyRate` when scoring
8. **Category tags as controlled vocabulary** - Classes have 0-n tags from a managed set; LLM can suggest new tags during import

---

## Future Enhancements

### Phase 4: Person.tsx Integration for Child Profile (RESEARCHED)

**Goal**: Auto-populate child profile from an existing person.tsx charm

**Research Summary (2025-12-13)**:

Wish **cannot query charms by content** (like "find person where name = X"). It only supports:
- Hashtag lookups in favorites (`#person`, `#child-adeline`)
- Direct cell paths (`/some/path`)
- Generic queries (launches interactive suggestion UI)

**Recommended Approaches (in order of preference)**:

#### Option A: Charm Linking (Recommended - Zero Code)

Link an existing person.tsx charm to extracurricular-selector at deploy time:

```bash
# 1. Create person.tsx for child
deno task ct charm new ... patterns/jkomoros/person.tsx
# Returns: person-charm-id

# 2. Create extracurricular-selector
deno task ct charm new ... patterns/jkomoros/WIP/extracurricular-selector.tsx
# Returns: selector-charm-id

# 3. Link person's profile to selector's childProfile
deno task ct charm link \
  --identity your-key \
  --api-url http://localhost:8000 \
  --space myspace \
  person-charm-id/profile \
  selector-charm-id/childProfile
```

**Pros**: Fully reactive sync, zero code needed
**Cons**: Manual one-time setup per child

#### Option B: Favorites with Hashtags (User-Driven)

User favorites their person.tsx with hashtag like `#child-adeline`, then wish looks it up:

```typescript
const wishedPerson = wish<PersonOutput>({
  query: derive(childNameInput, (name) => `#child-${name.toLowerCase().replace(/\s+/g, '-')}`),
});

const childProfileFromWish = derive(wishedPerson, (wr) => {
  if (wr?.result) {
    return {
      name: wr.result.displayName || "",
      grade: "K", // Can't reliably infer grade from birthday
      birthDate: wr.result.birthday || "",
    };
  }
  return null;
});
```

**Pros**: Discoverable, fallback UI if not found
**Cons**: User must maintain hashtags in favorites

#### Option C: Button-Triggered UI Modal

A "Find Child Profile" button that launches wish's interactive suggestion UI:

```typescript
const showFinder = cell<boolean>(false);
const wishedPerson = wish<PersonOutput>({
  query: derive(
    { name: childNameInput, triggered: showFinder },
    ({ name, triggered }) => triggered ? `Find person for "${name}"` : ""
  ),
});

// In UI:
<ct-button onClick={() => showFinder.set(true)}>Find Child Profile</ct-button>
{ifElse(showFinder, <div>{wishedPerson?.$UI}</div>, null)}
```

**Pros**: User sees selection UI for ambiguous queries
**Cons**: Requires user interaction, not automatic

**Limitations to Note**:
- person.tsx disabled `"#person": true` due to infinite loop bug (line 1289)
- Wish is a discovery tool, not a database query system
- No content-based querying exists in the framework

**Decision**: For MVP, keep manual input. Document Option A (charm linking) for power users who want to sync with existing person.tsx charms. This is a "nice to have" feature, not required for the pattern to be useful.

---

## Generalization Notes

To make this pattern work for other users (not just TBS/BAM):
- Location names and types are user-configurable
- Travel times are user-entered (future: Google Maps API)
- Status checkboxes are configurable set
- Categories are user-defined strings
- No hard-coded references to specific schools
