/// <cts-enable />
/**
 * Extracurricular Selector
 *
 * Helps parents select compatible extracurricular activities for their child
 * from multiple sources (afterschool programs, private schools, external classes).
 *
 * Features:
 * - LLM extraction from messy HTML/text with eligibility triage
 * - Child profile for automatic filtering
 * - Multiple "pinned sets" to compare schedule alternatives
 * - Conflict detection with travel time consideration
 * - Status tracking (Registered, Confirmed, Paid, On-Calendar)
 * - Friend co-enrollment tracking
 */
import {
  Cell,
  cell,
  computed,
  Default,
  derive,
  generateObject,
  handler,
  ifElse,
  NAME,
  pattern,
  str,
  toSchema,
  UI,
} from "commontools";

// ============================================================================
// TYPES
// ============================================================================

type Grade = "PK" | "TK" | "K" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type LocationType = "afterschool" | "private_school" | "external" | "other";

type TriageStatus = "auto_kept" | "auto_discarded" | "needs_review" | "user_kept" | "user_discarded";

interface ChildProfile {
  name: string;
  grade: Grade;
  birthDate: string;
  eligibilityNotes: string;
}

interface CategoryTag {
  id: string;
  name: string;
  color: string;
}

interface Location {
  id: string;
  name: string;
  type: LocationType;
  address: string;
  hasFlatDailyRate: boolean;
  dailyRate: number;
}

interface TravelTime {
  fromLocationId: string;
  toLocationId: string;
  minutes: number;
}

interface TimeSlot {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
}

interface Class {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  timeSlots: TimeSlot[];
  cost: number;
  costPer: "semester" | "month" | "session";
  categoryTagIds: string[];
  categoryTagNames: string[];
  gradeMin: string;
  gradeMax: string;
  description: string;
  startDate: string;
  endDate: string;
}

interface StagedClass extends Class {
  triageStatus: TriageStatus;
  eligibilityReason: string;
  eligibilityConfidence: number;
}

// Types for LLM extraction response - at module scope for toSchema<T>()
interface ExtractedClassInfo {
  name: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  gradeMin: string;
  gradeMax: string;
  suggestedTags: string[];
  eligibility: {
    eligible: "true" | "false" | "uncertain";
    reason: string;
    confidence: number;
  };
  cost: number;
  costPer: "session" | "semester" | "month";
  notes: string;
}

interface ExtractionResponse {
  classes: ExtractedClassInfo[];
  suggestedNewTags: string[];
}

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

interface PreferencePriority {
  rank: number;
  type: "category" | "specific_class";
  categoryId: string;
  classId: string;
  displayName: string;
}

interface ClassStatus {
  classId: string;
  statuses: Record<string, boolean>;
  notes: string;
}

interface PinnedSet {
  id: string;
  name: string;
  classIds: string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

const DAYS_OF_WEEK: DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const GRADE_OPTIONS: Grade[] = ["PK", "TK", "K", "1", "2", "3", "4", "5", "6", "7", "8"];

const DEFAULT_CATEGORY_TAGS: CategoryTag[] = [
  { id: "robotics", name: "Robotics", color: "#3b82f6" },
  { id: "dance", name: "Dance", color: "#ec4899" },
  { id: "art", name: "Art", color: "#f59e0b" },
  { id: "music", name: "Music", color: "#8b5cf6" },
  { id: "sports", name: "Sports", color: "#22c55e" },
  { id: "drama", name: "Drama", color: "#ef4444" },
  { id: "stem", name: "STEM", color: "#06b6d4" },
  { id: "language", name: "Language", color: "#6366f1" },
];

const DEFAULT_STATUS_TYPES = ["registered", "confirmed", "waitlisted", "paid", "onCalendar"];

const STATUS_LABELS: Record<string, string> = {
  registered: "Registered",
  confirmed: "Confirmed",
  waitlisted: "Waitlisted",
  paid: "Paid",
  onCalendar: "On Calendar",
};

// ============================================================================
// HANDLERS
// ============================================================================

// Location handlers
const addLocation = handler<
  unknown,
  { locations: Cell<Location[]>; newLocationForm: Cell<{ name: string; type: LocationType; address: string; hasFlatDailyRate: boolean; dailyRate: number }> }
>((_, { locations, newLocationForm }) => {
  const form = newLocationForm.get();
  if (!form.name.trim()) return;

  const newLocation: Location = {
    id: generateId(),
    name: form.name.trim(),
    type: form.type,
    address: form.address.trim(),
    hasFlatDailyRate: form.hasFlatDailyRate,
    dailyRate: form.dailyRate,
  };

  locations.push(newLocation);
  newLocationForm.set({ name: "", type: "afterschool", address: "", hasFlatDailyRate: false, dailyRate: 0 });
});

const removeLocation = handler<
  unknown,
  { locations: Cell<Location[]>; locationId: string }
>((_, { locations, locationId }) => {
  const current = locations.get();
  const index = current.findIndex((loc) => loc.id === locationId);
  if (index >= 0) {
    locations.set(current.toSpliced(index, 1));
  }
});

// Category tag handlers
const addCategoryTag = handler<
  unknown,
  { categoryTags: Cell<CategoryTag[]>; newTagName: Cell<string> }
>((_, { categoryTags, newTagName }) => {
  const name = newTagName.get().trim();
  if (!name) return;

  const existing = categoryTags.get();
  // Check for duplicate (case-insensitive)
  if (existing.some(t => t.name.toLowerCase() === name.toLowerCase())) return;

  const newTag: CategoryTag = {
    id: generateId(),
    name,
    color: "#6b7280", // default gray
  };

  categoryTags.push(newTag);
  newTagName.set("");
});

const removeCategoryTag = handler<
  unknown,
  { categoryTags: Cell<CategoryTag[]>; tagId: string }
>((_, { categoryTags, tagId }) => {
  const current = categoryTags.get();
  const index = current.findIndex((t) => t.id === tagId);
  if (index >= 0) {
    categoryTags.set(current.toSpliced(index, 1));
  }
});

// Friend handlers
const addFriend = handler<
  unknown,
  { friends: Cell<Friend[]>; newFriendName: Cell<string> }
>((_, { friends, newFriendName }) => {
  const name = newFriendName.get().trim();
  if (!name) return;

  const newFriend: Friend = {
    id: generateId(),
    name,
  };

  friends.push(newFriend);
  newFriendName.set("");
});

const removeFriend = handler<
  unknown,
  { friends: Cell<Friend[]>; friendId: string }
>((_, { friends, friendId }) => {
  const current = friends.get();
  const index = current.findIndex((f) => f.id === friendId);
  if (index >= 0) {
    friends.set(current.toSpliced(index, 1));
  }
});

// Travel time handler - set or update travel time between two locations
const setTravelTime = handler<
  unknown,
  { travelTimes: Cell<TravelTime[]>; fromLocationId: string; toLocationId: string; minutes: number }
>((_, { travelTimes, fromLocationId, toLocationId, minutes }) => {
  if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) return;

  const current = travelTimes.get();
  // Check for existing entry (either direction)
  const existingIndex = current.findIndex(
    (t) =>
      (t.fromLocationId === fromLocationId && t.toLocationId === toLocationId) ||
      (t.fromLocationId === toLocationId && t.toLocationId === fromLocationId)
  );

  if (existingIndex >= 0) {
    // Update existing
    const updated = [...current];
    updated[existingIndex] = { fromLocationId, toLocationId, minutes };
    travelTimes.set(updated);
  } else {
    // Add new
    travelTimes.push({ fromLocationId, toLocationId, minutes });
  }
});

// Confirm import handler - moves staged classes to main classes list
const confirmImport = handler<
  unknown,
  {
    classes: Cell<Class[]>;
    stagedClasses: Cell<StagedClass[]>;
    processedStagedClasses: Cell<StagedClass[]>;
    importText: Cell<string>;
  }
>((_, { classes, stagedClasses, processedStagedClasses, importText }) => {
  // Get staged classes that should be imported (auto_kept or user_kept)
  const staged = processedStagedClasses.get();
  const toImport = staged.filter(
    (c) => c.triageStatus === "auto_kept" || c.triageStatus === "user_kept"
  );

  if (toImport.length === 0) return;

  // Convert StagedClass to Class (remove triage fields)
  const newClasses: Class[] = toImport.map((staged) => ({
    id: generateId(), // Generate fresh IDs to avoid duplicates
    name: staged.name,
    locationId: staged.locationId,
    locationName: staged.locationName,
    timeSlots: staged.timeSlots,
    cost: staged.cost,
    costPer: staged.costPer,
    categoryTagIds: staged.categoryTagIds,
    categoryTagNames: staged.categoryTagNames,
    gradeMin: staged.gradeMin,
    gradeMax: staged.gradeMax,
    description: staged.description,
    startDate: staged.startDate,
    endDate: staged.endDate,
  }));

  // Add all imported classes to the main classes list
  const currentClasses = classes.get();
  classes.set([...currentClasses, ...newClasses]);

  // Clear the import text to reset the triage UI
  importText.set("");

  // Clear staged classes
  stagedClasses.set([]);
});

// Manual class entry handler
const addManualClass = handler<
  unknown,
  {
    classes: Cell<Class[]>;
    manualClassForm: Cell<{
      name: string;
      day: DayOfWeek;
      startTime: string;
      endTime: string;
      cost: number;
      costPer: "semester" | "month" | "session";
      gradeMin: string;
      gradeMax: string;
      description: string;
    }>;
    importLocationId: Cell<string>;
    locations: Cell<Location[]>;
  }
>((_, { classes, manualClassForm, importLocationId, locations }) => {
  const form = manualClassForm.get();
  const locId = importLocationId.get();
  const locs = locations.get();

  if (!form.name.trim()) return;
  if (!locId) return;

  const locationName = locs.find((l) => l.id === locId)?.name || "";

  const newClass: Class = {
    id: generateId(),
    name: form.name.trim(),
    locationId: locId,
    locationName,
    timeSlots: [{
      day: form.day,
      startTime: form.startTime,
      endTime: form.endTime,
    }],
    cost: form.cost,
    costPer: form.costPer,
    categoryTagIds: [],
    categoryTagNames: [],
    gradeMin: form.gradeMin,
    gradeMax: form.gradeMax,
    description: form.description,
    startDate: "",
    endDate: "",
  };

  classes.push(newClass);

  // Reset form
  manualClassForm.set({
    name: "",
    day: "monday",
    startTime: "15:00",
    endTime: "16:00",
    cost: 0,
    costPer: "session",
    gradeMin: "",
    gradeMax: "",
    description: "",
  });
});

// ============================================================================
// PINNED SET HANDLERS
// ============================================================================

// Create a new pinned set
const createPinnedSet = handler<
  unknown,
  { pinnedSets: Cell<PinnedSet[]>; activePinnedSetId: Cell<string> }
>((_, { pinnedSets, activePinnedSetId }) => {
  const sets = pinnedSets.get();
  const newId = generateId();
  const newSet: PinnedSet = {
    id: newId,
    name: `Set ${String.fromCharCode(65 + sets.length)}`, // A, B, C...
    classIds: [],
  };
  pinnedSets.set([...sets, newSet]);
  activePinnedSetId.set(newId);
});

// Delete a pinned set
const deletePinnedSet = handler<
  unknown,
  { pinnedSets: Cell<PinnedSet[]>; activePinnedSetId: Cell<string>; setId: string }
>((_, { pinnedSets, activePinnedSetId, setId }) => {
  const sets = pinnedSets.get();
  const newSets = sets.filter((s) => s.id !== setId);
  pinnedSets.set(newSets);

  // If we deleted the active set, switch to first remaining or clear
  const activeId = activePinnedSetId.get();
  if (activeId === setId) {
    activePinnedSetId.set(newSets.length > 0 ? newSets[0].id : "");
  }
});

// Rename a pinned set
const renamePinnedSet = handler<
  unknown,
  { pinnedSets: Cell<PinnedSet[]>; setId: string; newName: string }
>((_, { pinnedSets, setId, newName }) => {
  const sets = pinnedSets.get();
  pinnedSets.set(
    sets.map((s) => (s.id === setId ? { ...s, name: newName } : s))
  );
});

// Add a class to the active pinned set
const addClassToSet = handler<
  unknown,
  { pinnedSets: Cell<PinnedSet[]>; activePinnedSetId: Cell<string>; classId: string }
>((_, { pinnedSets, activePinnedSetId, classId }) => {
  const activeId = activePinnedSetId.get();
  if (!activeId) return;

  const sets = pinnedSets.get();
  pinnedSets.set(
    sets.map((s) => {
      if (s.id !== activeId) return s;
      if (s.classIds.includes(classId)) return s; // Already in set
      return { ...s, classIds: [...s.classIds, classId] };
    })
  );
});

// Remove a class from the active pinned set
const removeClassFromSet = handler<
  unknown,
  { pinnedSets: Cell<PinnedSet[]>; activePinnedSetId: Cell<string>; classId: string }
>((_, { pinnedSets, activePinnedSetId, classId }) => {
  const activeId = activePinnedSetId.get();
  if (!activeId) return;

  const sets = pinnedSets.get();
  pinnedSets.set(
    sets.map((s) => {
      if (s.id !== activeId) return s;
      return { ...s, classIds: s.classIds.filter((id) => id !== classId) };
    })
  );
});

// Switch active pinned set
const switchActiveSet = handler<
  unknown,
  { activePinnedSetId: Cell<string>; setId: string }
>((_, { activePinnedSetId, setId }) => {
  activePinnedSetId.set(setId);
});

// Add all classes from a suggested set
const addSuggestedSet = handler<
  unknown,
  { pinnedSets: Cell<PinnedSet[]>; activePinnedSetId: Cell<string>; classIds: string[] }
>((_, { pinnedSets, activePinnedSetId, classIds }) => {
  const activeId = activePinnedSetId.get();
  if (!activeId) return;

  const sets = pinnedSets.get();
  pinnedSets.set(
    sets.map((s) => {
      if (s.id !== activeId) return s;
      // Add all classes that aren't already in the set
      const newIds = classIds.filter((id) => !s.classIds.includes(id));
      return { ...s, classIds: [...s.classIds, ...newIds] };
    })
  );
});

// ============================================================================
// CONFLICT DETECTION HELPERS
// ============================================================================

// Parse time string (e.g., "14:30") to minutes since midnight
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Get travel time between two locations (in minutes)
function getTravelTime(
  fromLocationId: string,
  toLocationId: string,
  travelTimes: TravelTime[]
): number {
  // Same location = no travel time
  if (fromLocationId === toLocationId) return 0;

  // Look for explicit travel time entry
  const entry = travelTimes.find(
    (t) =>
      (t.fromLocationId === fromLocationId && t.toLocationId === toLocationId) ||
      (t.fromLocationId === toLocationId && t.toLocationId === fromLocationId)
  );

  // Return found time or default of 15 minutes between different locations
  return entry?.minutes ?? 15;
}

// Check if two time ranges overlap, considering travel time between locations
function timeSlotsOverlapWithTravel(
  slot1: TimeSlot,
  slot2: TimeSlot,
  loc1Id: string,
  loc2Id: string,
  travelTimes: TravelTime[]
): boolean {
  if (slot1.day !== slot2.day) return false;

  const start1 = parseTimeToMinutes(slot1.startTime);
  const end1 = parseTimeToMinutes(slot1.endTime);
  const start2 = parseTimeToMinutes(slot2.startTime);
  const end2 = parseTimeToMinutes(slot2.endTime);

  // Get travel time between the two locations
  const travel = getTravelTime(loc1Id, loc2Id, travelTimes);

  // Check if ranges overlap accounting for travel time
  // class1 ends, travel, then class2 starts: need end1 + travel <= start2
  // class2 ends, travel, then class1 starts: need end2 + travel <= start1
  return (start1 < end2 + travel) && (start2 < end1 + travel);
}

// Check if two classes conflict (simple overlap, no travel time)
function classesConflict(class1: Class, class2: Class): boolean {
  for (const slot1 of class1.timeSlots) {
    for (const slot2 of class2.timeSlots) {
      if (slot1.day === slot2.day) {
        const start1 = parseTimeToMinutes(slot1.startTime);
        const end1 = parseTimeToMinutes(slot1.endTime);
        const start2 = parseTimeToMinutes(slot2.startTime);
        const end2 = parseTimeToMinutes(slot2.endTime);
        if (start1 < end2 && start2 < end1) {
          return true;
        }
      }
    }
  }
  return false;
}

// Check if two classes conflict considering travel time
function classesConflictWithTravel(
  class1: Class,
  class2: Class,
  travelTimes: TravelTime[]
): boolean {
  for (const slot1 of class1.timeSlots) {
    for (const slot2 of class2.timeSlots) {
      if (timeSlotsOverlapWithTravel(
        slot1, slot2,
        class1.locationId, class2.locationId,
        travelTimes
      )) {
        return true;
      }
    }
  }
  return false;
}

// Get conflict reason string
function getConflictReason(
  class1: Class,
  class2: Class,
  travelTimes: TravelTime[]
): string {
  // Check for direct overlap first
  if (classesConflict(class1, class2)) {
    return "time overlap";
  }

  // If not direct overlap but still conflicts, it's due to travel time
  const travel = getTravelTime(class1.locationId, class2.locationId, travelTimes);
  if (travel > 0) {
    return `${travel}min travel needed`;
  }

  return "schedule conflict";
}

// ============================================================================
// SCORING ALGORITHM
// ============================================================================

interface ScoredClass {
  cls: Class;
  score: number;
  breakdown: {
    preferenceScore: number;
    friendBonus: number;
    travelPenalty: number;
    tbsPenalty: number;
  };
  conflictsWithPinned: boolean;
  conflictReasons: string[];
}

// Score a class for suggestions
function scoreClass(
  cls: Class,
  pinnedClasses: Class[],
  preferencePriorities: PreferencePriority[],
  friendInterests: FriendClassInterest[],
  travelTimes: TravelTime[],
  locations: Location[]
): ScoredClass {
  let preferenceScore = 0;
  let friendBonus = 0;
  let travelPenalty = 0;
  let tbsPenalty = 0;

  // Preference rank scoring (priority 1 = 100pts, priority 2 = 70pts, etc.)
  for (const pref of preferencePriorities) {
    if (
      (pref.type === "category" && cls.categoryTagIds.includes(pref.categoryId)) ||
      (pref.type === "specific_class" && cls.id === pref.classId)
    ) {
      preferenceScore = Math.round(100 * Math.pow(0.7, pref.rank - 1));
      break;
    }
  }

  // Friend bonus (+15 per friend interested in this class)
  const friendsInClass = friendInterests.filter((fi) => fi.classId === cls.id);
  friendBonus = friendsInClass.length * 15;

  // Travel penalty - count new location transitions
  // For each day where adding this class creates a transition
  const pinnedLocationsByDay = new Map<DayOfWeek, Set<string>>();
  for (const pinned of pinnedClasses) {
    for (const slot of pinned.timeSlots) {
      if (!pinnedLocationsByDay.has(slot.day)) {
        pinnedLocationsByDay.set(slot.day, new Set());
      }
      pinnedLocationsByDay.get(slot.day)!.add(pinned.locationId);
    }
  }

  for (const slot of cls.timeSlots) {
    const dayLocations = pinnedLocationsByDay.get(slot.day);
    if (dayLocations && dayLocations.size > 0 && !dayLocations.has(cls.locationId)) {
      // New location on this day - apply travel penalty
      travelPenalty += 10;
    }
  }

  // TBS partial day penalty (-25) - if location has flat daily rate
  const classLocation = locations.find((l) => l.id === cls.locationId);
  if (classLocation?.hasFlatDailyRate) {
    // Check if this would create a partial day
    for (const slot of cls.timeSlots) {
      const dayLocations = pinnedLocationsByDay.get(slot.day);
      if (dayLocations && !dayLocations.has(cls.locationId)) {
        // Would be a partial day at this flat-rate location
        tbsPenalty += 25;
      }
    }
  }

  // Check for conflicts with pinned classes
  const conflictReasons: string[] = [];
  let conflictsWithPinned = false;
  for (const pinned of pinnedClasses) {
    if (classesConflictWithTravel(cls, pinned, travelTimes)) {
      conflictsWithPinned = true;
      const reason = getConflictReason(cls, pinned, travelTimes);
      conflictReasons.push(`${pinned.name} (${reason})`);
    }
  }

  const score = preferenceScore + friendBonus - travelPenalty - tbsPenalty;

  return {
    cls,
    score,
    breakdown: {
      preferenceScore,
      friendBonus,
      travelPenalty,
      tbsPenalty,
    },
    conflictsWithPinned,
    conflictReasons,
  };
}

// Generate suggested class sets (groupings by category)
interface SuggestedSet {
  name: string;
  description: string;
  classIds: string[];
  totalScore: number;
  hasConflicts: boolean;
}

function generateSuggestedSets(
  availableClasses: Class[],
  pinnedClasses: Class[],
  categoryTags: CategoryTag[],
  friendInterests: FriendClassInterest[],
  travelTimes: TravelTime[]
): SuggestedSet[] {
  const sets: SuggestedSet[] = [];

  // Group available classes by their primary category
  const classesByCategory = new Map<string, Class[]>();
  for (const cls of availableClasses) {
    if (cls.categoryTagIds.length > 0) {
      const primaryCategory = cls.categoryTagIds[0];
      if (!classesByCategory.has(primaryCategory)) {
        classesByCategory.set(primaryCategory, []);
      }
      classesByCategory.get(primaryCategory)!.push(cls);
    }
  }

  // Create category-focused sets
  for (const [categoryId, classes] of classesByCategory.entries()) {
    if (classes.length >= 2) {
      const category = categoryTags.find((t) => t.id === categoryId);
      if (category) {
        // Filter to non-conflicting classes within this category
        const nonConflicting: Class[] = [];
        for (const cls of classes) {
          const conflictsWithSet = nonConflicting.some((existing) =>
            classesConflictWithTravel(cls, existing, travelTimes)
          );
          const conflictsWithPinned = pinnedClasses.some((pinned) =>
            classesConflictWithTravel(cls, pinned, travelTimes)
          );
          if (!conflictsWithSet && !conflictsWithPinned) {
            nonConflicting.push(cls);
          }
        }

        if (nonConflicting.length >= 2) {
          sets.push({
            name: `${category.name} Focus`,
            description: `${nonConflicting.length} ${category.name} classes without conflicts`,
            classIds: nonConflicting.map((c) => c.id),
            totalScore: nonConflicting.length * 50, // Simple scoring
            hasConflicts: false,
          });
        }
      }
    }
  }

  // Create a "friend classes" set if there are classes friends are interested in
  const friendClassIds = new Set(friendInterests.map((fi) => fi.classId));
  const friendClasses = availableClasses.filter((c) => friendClassIds.has(c.id));
  if (friendClasses.length >= 2) {
    // Filter to non-conflicting
    const nonConflicting: Class[] = [];
    for (const cls of friendClasses) {
      const conflictsWithSet = nonConflicting.some((existing) =>
        classesConflictWithTravel(cls, existing, travelTimes)
      );
      const conflictsWithPinned = pinnedClasses.some((pinned) =>
        classesConflictWithTravel(cls, pinned, travelTimes)
      );
      if (!conflictsWithSet && !conflictsWithPinned) {
        nonConflicting.push(cls);
      }
    }

    if (nonConflicting.length >= 2) {
      sets.push({
        name: "With Friends",
        description: `${nonConflicting.length} classes your friends are taking`,
        classIds: nonConflicting.map((c) => c.id),
        totalScore: nonConflicting.length * 65, // Higher score for friend bonus
        hasConflicts: false,
      });
    }
  }

  // Sort by total score descending
  sets.sort((a, b) => b.totalScore - a.totalScore);

  // Return top 3
  return sets.slice(0, 3);
}

// ============================================================================
// PATTERN
// ============================================================================

interface ExtracurricularSelectorInput {
  // Child profile - flattened for two-way binding (Cell for $value binding)
  childName: Cell<Default<string, "">>;
  childGrade: Cell<Default<Grade, "K">>;
  childBirthDate: Cell<Default<string, "">>;
  childEligibilityNotes: Cell<Default<string, "">>;
  // Collections - Default<> because framework provides them as Cells automatically
  locations: Default<Location[], []>;
  travelTimes: Default<TravelTime[], []>;
  categoryTags: Default<CategoryTag[], typeof DEFAULT_CATEGORY_TAGS>;
  classes: Default<Class[], []>;
  friends: Default<Friend[], []>;
  friendInterests: Default<FriendClassInterest[], []>;
  preferencePriorities: Default<PreferencePriority[], []>;
  classStatuses: Default<ClassStatus[], []>;
  pinnedSets: Default<PinnedSet[], []>;
  activePinnedSetId: Default<string, "">;
  // Import state - Cell for $value binding
  stagedClasses: Default<StagedClass[], []>;
  importText: Cell<Default<string, "">>;
  importLocationId: Cell<Default<string, "">>;
}

interface ExtracurricularSelectorOutput extends ExtracurricularSelectorInput {
  [NAME]: string;
  [UI]: JSX.Element;
}

export default pattern<ExtracurricularSelectorInput, ExtracurricularSelectorOutput>(
  ({
    childName,
    childGrade,
    childBirthDate,
    childEligibilityNotes,
    locations,
    travelTimes,
    categoryTags,
    classes,
    friends,
    friendInterests,
    preferencePriorities,
    classStatuses,
    pinnedSets,
    activePinnedSetId,
    stagedClasses,
    importText,
    importLocationId,
  }) => {
    // ========================================================================
    // LOCAL STATE
    // ========================================================================

    // Form state for adding new locations
    const newLocationForm = cell({ name: "", type: "afterschool" as LocationType, address: "", hasFlatDailyRate: false, dailyRate: 0 });

    // Form state for adding new tags
    const newTagName = cell<string>("");

    // Form state for adding new friends
    const newFriendName = cell<string>("");

    // Form state for manual class entry
    const manualClassForm = cell({
      name: "",
      day: "monday" as DayOfWeek,
      startTime: "15:00",
      endTime: "16:00",
      cost: 0,
      costPer: "session" as "semester" | "month" | "session",
      gradeMin: "",
      gradeMax: "",
      description: "",
    });

    // ========================================================================
    // LLM EXTRACTION
    // ========================================================================

    // Build extraction prompt - only when we have text to extract
    const extractionPrompt = derive(
      { importText, childGrade, categoryTags, importLocationId, locations },
      (values) => {
        // Unwrap Cell values - derive() doesn't do this automatically when passing an object
        const text: string = (values.importText as any)?.get ? (values.importText as any).get() : values.importText;
        const locId: string = (values.importLocationId as any)?.get ? (values.importLocationId as any).get() : values.importLocationId;
        const grade: string = (values.childGrade as any)?.get ? (values.childGrade as any).get() : values.childGrade;
        const tags: CategoryTag[] = (values.categoryTags as any)?.get ? (values.categoryTags as any).get() : values.categoryTags;
        const locs: Location[] = (values.locations as any)?.get ? (values.locations as any).get() : values.locations;

        // Don't extract if no text or no location selected
        if (!text || text.trim().length < 50 || !locId) {
          return "";
        }

        const locationName = locs.find((l: Location) => l.id === locId)?.name || "Unknown";
        const tagNames = tags.map((t: CategoryTag) => t.name).join(", ");

        return `You are extracting extracurricular class information from a schedule.

CHILD'S GRADE: ${grade}

EXISTING CATEGORY TAGS: ${tagNames}

SOURCE LOCATION: ${locationName}

For each class you find, determine:
1. Is this class eligible for a grade ${grade} student?
2. What category tags apply (prefer existing tags, but suggest new ones if needed)?

SCHEDULE TEXT:
${text}

Extract all classes you can identify. For grade eligibility:
- If the class explicitly includes grade ${grade}, mark eligible=true with high confidence
- If the grade range is unclear, mark eligible="uncertain"
- If the class explicitly excludes grade ${grade}, mark eligible=false

For times, use 24-hour format (e.g., "15:30" for 3:30 PM).
For days, use lowercase: monday, tuesday, wednesday, thursday, friday.
If cost is not specified, use null.`;
      }
    );

    // Run extraction when prompt is ready
    // Using explicit JSON schema like person.tsx does
    const extractionResult = generateObject({
      model: "anthropic:claude-sonnet-4-5",
      prompt: extractionPrompt,
      system: "You are a precise data extraction assistant. Extract class information exactly as found in the source text. Do not invent or assume information not present. For times, use 24-hour format. For days, use lowercase (monday, tuesday, etc.).",
      schema: {
        type: "object",
        properties: {
          classes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                dayOfWeek: { type: "string" },
                startTime: { type: "string" },
                endTime: { type: "string" },
                gradeMin: { type: "string" },
                gradeMax: { type: "string" },
                suggestedTags: { type: "array", items: { type: "string" } },
                eligible: { type: "string" },
                eligibilityReason: { type: "string" },
                eligibilityConfidence: { type: "number" },
                cost: { type: ["number", "null"] },
                costPer: { type: ["string", "null"] },
                notes: { type: ["string", "null"] },
              },
            },
          },
          suggestedNewTags: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    });

    // Process extraction results into staged classes
    const processedStagedClasses = derive(
      { extractionResult, importLocationId, locations, categoryTags },
      (values) => {
        // Unwrap Cell values - derive() doesn't do this automatically when passing an object
        const extractionState = (values.extractionResult as any)?.get ? (values.extractionResult as any).get() : values.extractionResult;
        const locId: string = (values.importLocationId as any)?.get ? (values.importLocationId as any).get() : values.importLocationId;
        const locs: Location[] = (values.locations as any)?.get ? (values.locations as any).get() : values.locations;
        const tags: CategoryTag[] = (values.categoryTags as any)?.get ? (values.categoryTags as any).get() : values.categoryTags;

        // extractionResult is a state object with .result property
        const result = extractionState?.result;
        if (!result || !result.classes) {
          return [] as StagedClass[];
        }

        const resolvedLocationName = locs.find((l: Location) => l.id === locId)?.name || "";

        return result.classes.map((cls: any, index: number): StagedClass => {
          // Determine triage status based on eligibility (flattened fields)
          let triageStatus: TriageStatus;
          const eligible = cls.eligible || "uncertain";
          const confidence = cls.eligibilityConfidence || 0;
          if (eligible === "true" && confidence >= 0.8) {
            triageStatus = "auto_kept";
          } else if (eligible === "false" && confidence >= 0.8) {
            triageStatus = "auto_discarded";
          } else {
            triageStatus = "needs_review";
          }

          // Match suggested tags to existing category tags
          const matchedTagIds: string[] = [];
          const matchedTagNames: string[] = [];
          for (const suggestedTag of cls.suggestedTags || []) {
            const existing = tags.find(
              (t: CategoryTag) => t.name.toLowerCase() === suggestedTag.toLowerCase()
            );
            if (existing) {
              matchedTagIds.push(existing.id);
              matchedTagNames.push(existing.name);
            }
          }

          return {
            id: `staged-${index}-${Date.now()}`,
            name: cls.name || "Unknown Class",
            locationId: locId,
            locationName: resolvedLocationName,
            timeSlots: [{
              day: (cls.dayOfWeek || "monday") as DayOfWeek,
              startTime: cls.startTime || "15:00",
              endTime: cls.endTime || "16:00"
            }],
            cost: cls.cost || 0,
            costPer: cls.costPer || "session",
            categoryTagIds: matchedTagIds,
            categoryTagNames: matchedTagNames,
            gradeMin: cls.gradeMin || "",
            gradeMax: cls.gradeMax || "",
            description: cls.notes || "",
            startDate: "",
            endDate: "",
            triageStatus,
            eligibilityReason: cls.eligibilityReason || "",
            eligibilityConfidence: confidence
          };
        });
      }
    );

    // ========================================================================
    // DERIVED STATE
    // ========================================================================

    // Pattern name - when childName is empty, we show a default
    // Use computed to check if childName has any non-whitespace content
    const hasChildName = computed(() => {
      const n = childName.get();
      return n && n.trim().length > 0;
    });
    const patternName = ifElse(
      hasChildName,
      str`${childName}'s Activities`,
      "Extracurricular Selector"
    );

    // Use computed() for reactive transformations
    // Per official docs: inside computed(), access reactive values directly
    // The framework's CTS transformer handles unwrapping automatically - NO CASTS NEEDED
    const locationCount = computed(() => locations.length);
    const classCount = computed(() => classes.length);
    const friendCount = computed(() => friends.length);

    // ========================================================================
    // SELECTION BUILDER - COMPUTED VALUES
    // ========================================================================

    // Basic state checks
    const hasClasses = computed(() => classes.length > 0);

    // Active set info
    const activeSetData = computed(() => {
      return pinnedSets.find((s) => s.id === activePinnedSetId) || null;
    });

    const hasActiveSet = computed(() => activeSetData !== null);
    const activeSetName = computed(() => activeSetData?.name || "");
    const canDeleteSet = computed(() => pinnedSets.length > 1);

    // Pinned classes for active set
    const pinnedClassIds = computed(() => activeSetData?.classIds || []);

    // Inside computed(), the framework auto-unwraps both Cells and computed values
    // Access everything directly without .get()
    const pinnedClasses = computed(() => {
      return classes.filter((c: Class) => pinnedClassIds.includes(c.id));
    });

    const hasPinnedClasses = computed(() => pinnedClasses.length > 0);
    const pinnedClassCount = computed(() => pinnedClasses.length);

    // Available (unpinned) classes
    const availableClasses = computed(() => {
      return classes.filter((c: Class) => !pinnedClassIds.includes(c.id));
    });

    const hasAvailableClasses = computed(() => availableClasses.length > 0);
    const availableClassCount = computed(() => availableClasses.length);

    // Total cost of pinned classes
    const totalPinnedCost = computed(() => {
      return pinnedClasses.reduce((sum: number, c: Class) => sum + (c.cost || 0), 0);
    });

    // Conflict detection with travel time
    // Inside computed(), access all values directly (framework auto-unwraps)
    const conflictingPairs = computed(() => {
      const pairs: Array<{ c1: Class; c2: Class; reason: string }> = [];
      for (let i = 0; i < pinnedClasses.length; i++) {
        for (let j = i + 1; j < pinnedClasses.length; j++) {
          if (classesConflictWithTravel(pinnedClasses[i], pinnedClasses[j], travelTimes)) {
            const reason = getConflictReason(pinnedClasses[i], pinnedClasses[j], travelTimes);
            pairs.push({ c1: pinnedClasses[i], c2: pinnedClasses[j], reason });
          }
        }
      }
      return pairs;
    });

    const hasConflicts = computed(() => conflictingPairs.length > 0);

    // Conflict warnings JSX - computed for pure rendering (no handlers inside)
    const conflictWarnings = computed(() => {
      return conflictingPairs.map(({ c1, c2, reason }: { c1: Class; c2: Class; reason: string }) => (
        <div style="font-size: 11px; color: #991b1b; margin-top: 4px;">
          {c1.name} ↔ {c2.name} ({reason})
        </div>
      ));
    });

    // ========================================================================
    // SUGGESTIONS - SCORED CLASSES AND SUGGESTED SETS
    // ========================================================================

    // Score and rank all available classes
    // Inside computed(), access all values directly (framework auto-unwraps)
    const rankedClasses = computed(() => {
      const scored = availableClasses.map((cls: Class) =>
        scoreClass(cls, pinnedClasses, preferencePriorities, friendInterests, travelTimes, locations)
      );
      // Sort by score descending, with conflicts at the bottom
      scored.sort((a: ScoredClass, b: ScoredClass) => {
        if (a.conflictsWithPinned && !b.conflictsWithPinned) return 1;
        if (!a.conflictsWithPinned && b.conflictsWithPinned) return -1;
        return b.score - a.score;
      });
      return scored;
    });

    const hasRankedClasses = computed(() => rankedClasses.length > 0);

    // Generate suggested sets (groupings by category or friends)
    const suggestedSets = computed(() => {
      return generateSuggestedSets(availableClasses, pinnedClasses, categoryTags, friendInterests, travelTimes);
    });

    const hasSuggestedSets = computed(() => suggestedSets.length > 0);

    // ========================================================================
    // SELECTION BUILDER - COMPUTED JSX FRAGMENTS (display only, no handlers inside)
    // ========================================================================

    // Set tabs - computed for display
    const selectionSetTabs = computed(() => {
      return pinnedSets.map((set) => (
        <button
          style={{
            padding: "6px 12px",
            border: set.id === activePinnedSetId ? "2px solid #3b82f6" : "1px solid #d1d5db",
            borderRadius: "6px",
            background: set.id === activePinnedSetId ? "#eff6ff" : "white",
            fontWeight: set.id === activePinnedSetId ? "600" : "400",
            cursor: "pointer",
            fontSize: "13px",
          }}
          onClick={switchActiveSet({ setId: set.id, activePinnedSetId })}
        >
          {set.name}
        </button>
      ));
    });

    // Pinned schedule grouped by day - computed for display
    // Inside computed(), access values directly (framework auto-unwraps)
    const pinnedScheduleByDay = computed(() => {
      const pinned = pinnedClasses as Class[];
      return DAYS_OF_WEEK.map((day: DayOfWeek) => {
        const dayClasses = pinned.filter((c) =>
          c.timeSlots.some((slot) => slot.day === day)
        );
        if (dayClasses.length === 0) return null;

        return (
          <div style="border-left: 3px solid #3b82f6; padding-left: 12px;">
            <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">
              {DAY_LABELS[day]}
            </div>
            {dayClasses.map((cls) => (
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #e5e7eb;">
                <div>
                  <div style="font-size: 13px; font-weight: 500;">{cls.name}</div>
                  <div style="font-size: 11px; color: #6b7280;">
                    {cls.timeSlots[0]?.startTime}-{cls.timeSlots[0]?.endTime}
                    {cls.locationName && ` @ ${cls.locationName}`}
                  </div>
                </div>
                <button
                  style={{
                    padding: "2px 8px",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                    background: "white",
                    fontSize: "11px",
                    cursor: "pointer",
                    color: "#6b7280",
                  }}
                  onClick={removeClassFromSet({ classId: cls.id, pinnedSets, activePinnedSetId })}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        );
      }).filter(Boolean);
    });

    // ========================================================================
    // SELECTION BUILDER - PRE-BOUND HANDLERS (outside reactive context)
    // ========================================================================

    // Pre-bind handlers with their Cell dependencies
    // These are bound at pattern evaluation time, not inside derive
    const boundCreatePinnedSet = createPinnedSet({ pinnedSets, activePinnedSetId });

    // Delete active set - need to get activeSetId at click time, so we create a wrapper handler
    const deleteActiveSetHandler = handler<
      unknown,
      { pinnedSets: Cell<PinnedSet[]>; activePinnedSetId: Cell<string> }
    >((_, { pinnedSets, activePinnedSetId }) => {
      const activeId = activePinnedSetId.get();
      if (!activeId) return;

      const sets = pinnedSets.get();
      const newSets = sets.filter((s) => s.id !== activeId);
      pinnedSets.set(newSets);

      // Switch to first remaining set
      if (newSets.length > 0) {
        activePinnedSetId.set(newSets[0].id);
      } else {
        activePinnedSetId.set("");
      }
    });
    const boundDeleteActiveSet = deleteActiveSetHandler({ pinnedSets, activePinnedSetId });

    // ========================================================================
    // RENDER
    // ========================================================================

    return {
      childName,
      childGrade,
      childBirthDate,
      childEligibilityNotes,
      locations,
      travelTimes,
      categoryTags,
      classes,
      friends,
      friendInterests,
      preferencePriorities,
      classStatuses,
      pinnedSets,
      activePinnedSetId,
      stagedClasses,
      importText,
      importLocationId,
      [NAME]: patternName,
      [UI]: (
        <ct-screen>
          {/* Header */}
          <div style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
            <ct-hstack style="justify-content: space-between; align-items: center;">
              <h1 style="font-size: 24px; font-weight: bold; margin: 0;">
                {patternName}
              </h1>
              <ct-hstack style="gap: 16px; font-size: 14px; color: #6b7280;">
                <span>{locationCount} locations</span>
                <span>{classCount} classes</span>
                <span>{friendCount} friends</span>
              </ct-hstack>
            </ct-hstack>
          </div>

          <ct-autolayout tabNames={["Dashboard", "Import", "Selection", "Settings"]}>
            {/* ========== TAB 1: DASHBOARD ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 16px;">
                <h2 style="font-size: 18px; font-weight: 600; margin: 0;">Dashboard</h2>

                {/* Child Profile Summary */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #374151;">
                    Child Profile
                  </h3>
                  {ifElse(
                    derive(childName, (name) => !!name),
                    <div style="color: #6b7280;">
                      <div><strong>{childName}</strong> - Grade {childGrade}</div>
                      {ifElse(
                        derive(childEligibilityNotes, (notes) => !!notes),
                        <div style="font-size: 12px; margin-top: 4px;">{childEligibilityNotes}</div>,
                        null
                      )}
                    </div>,
                    <div style="color: #9ca3af; font-style: italic;">
                      No child profile set. Go to Settings to configure.
                    </div>
                  )}
                </div>

                {/* Weekly Schedule Preview (placeholder) */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #374151;">
                    Weekly Schedule
                  </h3>
                  {derive(classes, (cls) =>
                    cls.length === 0 ? (
                      <div style="color: #9ca3af; font-style: italic;">
                        No classes added yet. Import classes from the Import tab.
                      </div>
                    ) : (
                      <div style="color: #6b7280;">
                        {cls.length} classes available
                      </div>
                    )
                  )}
                </div>

                {/* Status Summary (placeholder) */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #374151;">
                    Status Summary
                  </h3>
                  <div style="color: #9ca3af; font-style: italic;">
                    Status tracking will appear here once classes are pinned.
                  </div>
                </div>
              </ct-vstack>
            </ct-vscroll>

            {/* ========== TAB 2: IMPORT ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 16px;">
                <h2 style="font-size: 18px; font-weight: 600; margin: 0;">Import Classes</h2>

                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <p style="color: #6b7280; margin: 0 0 16px 0;">
                    Paste class schedules from afterschool programs, recreation centers, or any source.
                    The AI will extract class information and filter by eligibility.
                  </p>

                  {/* Location selector */}
                  <div style="margin-bottom: 12px;">
                    <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 4px;">
                      Source Location
                    </label>
                    {ifElse(
                      derive(locations, (locs) => locs.length === 0),
                      <div style="color: #f59e0b; font-size: 14px;">
                        Add locations in Settings before importing classes.
                      </div>,
                      <ct-select
                        $value={importLocationId}
                        items={derive(locations, (locs: Location[]) => [
                          { label: "Select a location...", value: "" },
                          ...locs.map((loc: Location) => ({ label: loc.name, value: loc.id }))
                        ])}
                      />
                    )}
                  </div>

                  {/* Text input */}
                  <div style="margin-bottom: 12px;">
                    <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 4px;">
                      Paste Schedule (HTML or text)
                    </label>
                    <ct-input
                      style={{ width: "100%", height: "200px" }}
                      placeholder="Paste the class schedule here..."
                      $value={importText}
                    />
                  </div>

                  {/* Extraction status */}
                  {ifElse(
                    derive(extractionResult, (r: any) => r?.pending === true),
                    <div style="padding: 8px 12px; background: #dbeafe; border-radius: 6px; color: #1e40af; font-size: 14px; margin-bottom: 12px;">
                      Extracting classes from {derive(importText, (t: string) => t.length)} characters of text...
                    </div>,
                    null
                  )}
                </div>

                {/* Triage results from extraction */}
                {derive(processedStagedClasses, (staged: StagedClass[]) =>
                  staged.length > 0 ? (
                    <ct-vstack style="gap: 16px;">
                      {/* Auto-kept classes (eligible) */}
                      {(() => {
                        const autoKept = staged.filter((c: StagedClass) => c.triageStatus === "auto_kept");
                        return autoKept.length > 0 ? (
                          <div style="background: #dcfce7; border: 1px solid #86efac; border-radius: 8px; padding: 16px;">
                            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #166534;">
                              Ready to Import ({autoKept.length})
                            </h3>
                            <ct-vstack style="gap: 8px;">
                              {autoKept.map((cls: StagedClass) => (
                                <div style="background: white; border-radius: 4px; padding: 8px 12px;">
                                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div>
                                      <div style="font-weight: 500;">{cls.name}</div>
                                      <div style="font-size: 12px; color: #6b7280;">
                                        {DAY_LABELS[cls.timeSlots[0]?.day as DayOfWeek] || "?"} {cls.timeSlots[0]?.startTime || "?"}-{cls.timeSlots[0]?.endTime || "?"}
                                        {cls.cost > 0 && ` - $${cls.cost}`}
                                        {cls.gradeMin && ` - Grades ${cls.gradeMin}-${cls.gradeMax}`}
                                      </div>
                                      <div style="font-size: 11px; color: #16a34a; margin-top: 2px;">
                                        {cls.eligibilityReason}
                                      </div>
                                    </div>
                                    {cls.categoryTagNames.length > 0 && (
                                      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                                        {cls.categoryTagNames.map((tag: string) => (
                                          <span style="font-size: 10px; padding: 2px 6px; background: #e5e7eb; border-radius: 8px;">{tag}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </ct-vstack>
                          </div>
                        ) : <></>;
                      })()}

                      {/* Needs review classes */}
                      {(() => {
                        const needsReview = staged.filter((c: StagedClass) => c.triageStatus === "needs_review");
                        return needsReview.length > 0 ? (
                          <div style="background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 16px;">
                            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #854d0e;">
                              Needs Review ({needsReview.length})
                            </h3>
                            <ct-vstack style="gap: 8px;">
                              {needsReview.map((cls: StagedClass) => (
                                <div style="background: white; border-radius: 4px; padding: 8px 12px;">
                                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div>
                                      <div style="font-weight: 500;">{cls.name}</div>
                                      <div style="font-size: 12px; color: #6b7280;">
                                        {DAY_LABELS[cls.timeSlots[0]?.day as DayOfWeek] || "?"} {cls.timeSlots[0]?.startTime || "?"}-{cls.timeSlots[0]?.endTime || "?"}
                                        {cls.cost > 0 && ` - $${cls.cost}`}
                                        {cls.gradeMin && ` - Grades ${cls.gradeMin}-${cls.gradeMax}`}
                                      </div>
                                      <div style="font-size: 11px; color: #ca8a04; margin-top: 2px;">
                                        {cls.eligibilityReason} (confidence: {Math.round(cls.eligibilityConfidence * 100)}%)
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </ct-vstack>
                          </div>
                        ) : <></>;
                      })()}

                      {/* Auto-discarded classes */}
                      {(() => {
                        const autoDiscarded = staged.filter((c: StagedClass) => c.triageStatus === "auto_discarded");
                        return autoDiscarded.length > 0 ? (
                          <div style="background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px;">
                            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #6b7280;">
                              Auto-Discarded ({autoDiscarded.length})
                            </h3>
                            <ct-vstack style="gap: 8px;">
                              {autoDiscarded.map((cls: StagedClass) => (
                                <div style="background: white; border-radius: 4px; padding: 8px 12px; opacity: 0.7;">
                                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div>
                                      <div style="font-weight: 500; text-decoration: line-through;">{cls.name}</div>
                                      <div style="font-size: 12px; color: #9ca3af;">
                                        {DAY_LABELS[cls.timeSlots[0]?.day as DayOfWeek] || "?"} {cls.timeSlots[0]?.startTime || "?"}-{cls.timeSlots[0]?.endTime || "?"}
                                        {cls.gradeMin && ` - Grades ${cls.gradeMin}-${cls.gradeMax}`}
                                      </div>
                                      <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">
                                        {cls.eligibilityReason}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </ct-vstack>
                          </div>
                        ) : <></>;
                      })()}

                      {/* Suggested new tags */}
                      {derive(extractionResult, (result: any) => {
                        const newTags: string[] = result?.result?.suggestedNewTags || [];
                        return newTags.length > 0 ? (
                          <div style="background: #f3e8ff; border: 1px solid #c4b5fd; border-radius: 8px; padding: 16px;">
                            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #6b21a8;">
                              Suggested New Tags
                            </h3>
                            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                              {newTags.map((tag: string) => (
                                <span style="padding: 4px 12px; background: white; border: 1px solid #c4b5fd; border-radius: 16px; font-size: 12px;">
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <div style="font-size: 11px; color: #7c3aed; margin-top: 8px;">
                              Add these in Settings to use them in future imports.
                            </div>
                          </div>
                        ) : <></>;
                      })}

                      {/* Confirm Import Button */}
                      {(() => {
                        const importableCount = staged.filter(
                          (c: StagedClass) => c.triageStatus === "auto_kept" || c.triageStatus === "user_kept"
                        ).length;
                        return importableCount > 0 ? (
                          <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 16px; text-align: center;">
                            <ct-button
                              variant="default"
                              style={{ width: "100%", padding: "12px 24px", fontSize: "16px", fontWeight: "600" }}
                              onClick={confirmImport({ classes, stagedClasses, processedStagedClasses, importText })}
                            >
                              ✅ Import {importableCount} Class{importableCount === 1 ? "" : "es"}
                            </ct-button>
                            <div style="font-size: 12px; color: #059669; margin-top: 8px;">
                              Classes marked "Ready to Import" will be added to your class list.
                            </div>
                          </div>
                        ) : <></>;
                      })()}
                    </ct-vstack>
                  ) : <></>
                )}

                {/* Manual Class Entry */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-top: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                    Add Class Manually
                  </h3>
                  <p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0;">
                    Add a single class directly without LLM extraction.
                  </p>

                  <ct-vstack style="gap: 12px;">
                    <ct-hstack style="gap: 12px;">
                      <div style="flex: 2;">
                        <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                          Class Name *
                        </label>
                        <ct-input
                          placeholder="e.g., Ballet, Soccer, Robotics"
                          $value={manualClassForm.key("name")}
                        />
                      </div>
                      <div style="flex: 1;">
                        <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                          Day
                        </label>
                        <ct-select
                          $value={manualClassForm.key("day")}
                          items={DAYS_OF_WEEK.map((d) => ({ label: DAY_LABELS[d], value: d }))}
                        />
                      </div>
                    </ct-hstack>

                    <ct-hstack style="gap: 12px;">
                      <div style="flex: 1;">
                        <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                          Start Time
                        </label>
                        <ct-input
                          type="time"
                          $value={manualClassForm.key("startTime")}
                        />
                      </div>
                      <div style="flex: 1;">
                        <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                          End Time
                        </label>
                        <ct-input
                          type="time"
                          $value={manualClassForm.key("endTime")}
                        />
                      </div>
                      <div style="flex: 1;">
                        <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                          Cost ($)
                        </label>
                        <ct-input
                          type="number"
                          placeholder="0"
                          $value={manualClassForm.key("cost")}
                        />
                      </div>
                      <div style="flex: 1;">
                        <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                          Per
                        </label>
                        <ct-select
                          $value={manualClassForm.key("costPer")}
                          items={[
                            { label: "Session", value: "session" },
                            { label: "Month", value: "month" },
                            { label: "Semester", value: "semester" },
                          ]}
                        />
                      </div>
                    </ct-hstack>

                    <ct-hstack style="gap: 12px;">
                      <div style="flex: 1;">
                        <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                          Grade Min
                        </label>
                        <ct-input
                          placeholder="e.g., K"
                          $value={manualClassForm.key("gradeMin")}
                        />
                      </div>
                      <div style="flex: 1;">
                        <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                          Grade Max
                        </label>
                        <ct-input
                          placeholder="e.g., 3"
                          $value={manualClassForm.key("gradeMax")}
                        />
                      </div>
                    </ct-hstack>

                    <div>
                      <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                        Notes (optional)
                      </label>
                      <ct-input
                        placeholder="Any additional details..."
                        $value={manualClassForm.key("description")}
                      />
                    </div>

                    {ifElse(
                      derive(importLocationId, (locId: string) => !locId),
                      <div style="color: #f59e0b; font-size: 12px;">
                        Select a location above before adding a class.
                      </div>,
                      <ct-button
                        variant="default"
                        onClick={addManualClass({ classes, manualClassForm, importLocationId, locations })}
                      >
                        Add Class
                      </ct-button>
                    )}
                  </ct-vstack>
                </div>
              </ct-vstack>
            </ct-vscroll>

            {/* ========== TAB 3: SELECTION ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 16px;">
                <h2 style="font-size: 18px; font-weight: 600; margin: 0;">Selection Builder</h2>

                {/* Show message if no classes imported yet */}
                {ifElse(
                  hasClasses,
                  null,
                  <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px;">
                    <p style="color: #92400e; margin: 0;">
                      No classes imported yet. Go to the Import tab to add classes first!
                    </p>
                  </div>
                )}

                {/* Main selection builder - using computed values and ifElse instead of derive */}
                {ifElse(
                  hasClasses,
                  <ct-hstack style="gap: 16px; align-items: flex-start;">
                    {/* Left column: Pinned Schedule */}
                    <div style="flex: 1; min-width: 300px;">
                      {/* Set tabs - using computed for display, handlers bound outside */}
                      <div style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap; align-items: center;">
                        {selectionSetTabs}
                        <button
                          style={{
                            padding: "6px 12px",
                            border: "1px dashed #9ca3af",
                            borderRadius: "6px",
                            background: "transparent",
                            cursor: "pointer",
                            color: "#6b7280",
                            fontSize: "13px",
                          }}
                          onClick={boundCreatePinnedSet}
                        >
                          + New Set
                        </button>
                      </div>

                      {/* Active set content */}
                      {ifElse(
                        hasActiveSet,
                        <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                          {/* Header with set name and delete button */}
                          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="font-size: 14px; font-weight: 600; margin: 0; color: #374151;">
                              {activeSetName} ({pinnedClassCount} classes)
                            </h3>
                            {ifElse(
                              canDeleteSet,
                              <ct-button
                                size="sm"
                                variant="destructive"
                                onClick={boundDeleteActiveSet}
                              >
                                Delete Set
                              </ct-button>,
                              null
                            )}
                          </div>

                          {/* Conflict warning */}
                          {ifElse(
                            hasConflicts,
                            <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px;">
                              <div style="font-size: 12px; font-weight: 600; color: #dc2626;">
                                ⚠️ Schedule Conflicts
                              </div>
                              {conflictWarnings}
                            </div>,
                            null
                          )}

                          {/* Day-by-day schedule */}
                          {ifElse(
                            hasPinnedClasses,
                            <ct-vstack style="gap: 8px;">
                              {pinnedScheduleByDay}
                            </ct-vstack>,
                            <p style="color: #9ca3af; font-size: 13px; font-style: italic; margin: 0;">
                              No classes pinned yet. Add classes from the right panel.
                            </p>
                          )}

                          {/* Cost summary */}
                          {ifElse(
                            hasPinnedClasses,
                            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                              <div style="font-size: 12px; color: #6b7280;">
                                <strong>Total Cost:</strong> ${totalPinnedCost}
                              </div>
                            </div>,
                            null
                          )}
                        </div>,
                        <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                          <p style="color: #9ca3af; font-size: 13px; margin: 0;">
                            Create a set to start building your schedule.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right column: Suggestions Panel */}
                    <div style="flex: 1; min-width: 300px;">
                      {/* Suggested Sets Section */}
                      {ifElse(
                        hasSuggestedSets,
                        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                          <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #166534;">
                            💡 Suggested Sets
                          </h3>
                          <ct-vstack style="gap: 8px;">
                            {/* Use .map() directly on computed - JSX is automatically reactive */}
                            {suggestedSets.map((set: SuggestedSet) => (
                              <div style="background: white; border-radius: 6px; padding: 10px 12px; border: 1px solid #bbf7d0;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                  <div style="flex: 1;">
                                    <div style="font-size: 13px; font-weight: 600; color: #166534;">
                                      {set.name}
                                    </div>
                                    <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">
                                      {set.description}
                                    </div>
                                  </div>
                                  <button
                                    style={{
                                      padding: "4px 10px",
                                      border: "none",
                                      borderRadius: "4px",
                                      background: "#22c55e",
                                      color: "white",
                                      fontSize: "11px",
                                      cursor: "pointer",
                                      fontWeight: "500",
                                    }}
                                    onClick={addSuggestedSet({ classIds: set.classIds, pinnedSets, activePinnedSetId })}
                                  >
                                    + Add All
                                  </button>
                                </div>
                              </div>
                            ))}
                          </ct-vstack>
                        </div>,
                        null
                      )}

                      {/* Ranked Individual Classes Section */}
                      <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                        <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                          📊 Ranked Classes ({availableClassCount})
                        </h3>
                        <p style="font-size: 11px; color: #6b7280; margin: 0 0 12px 0;">
                          Scored by preferences, friends, and schedule compatibility
                        </p>

                        {ifElse(
                          hasRankedClasses,
                          <ct-vstack style="gap: 8px;">
                            {/* Use .map() directly on computed - JSX is automatically reactive */}
                            {rankedClasses.map((scored: ScoredClass) => (
                              <div
                                style={{
                                  background: scored.conflictsWithPinned ? "#fef2f2" : "white",
                                  border: scored.conflictsWithPinned ? "1px solid #fca5a5" : "1px solid #e5e7eb",
                                  borderRadius: "6px",
                                  padding: "10px 12px",
                                }}
                              >
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                  <div style="flex: 1;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                      <span style="font-size: 13px; font-weight: 500;">{scored.cls.name}</span>
                                      <span style={{
                                        padding: "2px 6px",
                                        borderRadius: "10px",
                                        background: scored.score > 0 ? "#dcfce7" : scored.score < 0 ? "#fee2e2" : "#f3f4f6",
                                        color: scored.score > 0 ? "#166534" : scored.score < 0 ? "#991b1b" : "#6b7280",
                                        fontSize: "10px",
                                        fontWeight: "600",
                                      }}>
                                        {scored.score > 0 ? "+" : ""}{scored.score} pts
                                      </span>
                                    </div>
                                    <div style="font-size: 11px; color: #6b7280;">
                                      {DAY_LABELS[scored.cls.timeSlots[0]?.day as DayOfWeek]} {scored.cls.timeSlots[0]?.startTime}-{scored.cls.timeSlots[0]?.endTime}
                                      {scored.cls.cost > 0 && ` • $${scored.cls.cost}`}
                                    </div>
                                    {/* Score breakdown */}
                                    {(scored.breakdown.preferenceScore > 0 || scored.breakdown.friendBonus > 0 || scored.breakdown.travelPenalty > 0 || scored.breakdown.tbsPenalty > 0) && (
                                      <div style="font-size: 9px; color: #9ca3af; margin-top: 2px;">
                                        {scored.breakdown.preferenceScore > 0 && <span style="color: #16a34a;">+{scored.breakdown.preferenceScore} pref </span>}
                                        {scored.breakdown.friendBonus > 0 && <span style="color: #2563eb;">+{scored.breakdown.friendBonus} friends </span>}
                                        {scored.breakdown.travelPenalty > 0 && <span style="color: #dc2626;">-{scored.breakdown.travelPenalty} travel </span>}
                                        {scored.breakdown.tbsPenalty > 0 && <span style="color: #dc2626;">-{scored.breakdown.tbsPenalty} partial </span>}
                                      </div>
                                    )}
                                    {scored.conflictsWithPinned && (
                                      <div style="font-size: 10px; color: #dc2626; margin-top: 2px;">
                                        ⚠️ Conflicts: {scored.conflictReasons.join(", ")}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    style={{
                                      padding: "4px 10px",
                                      border: "none",
                                      borderRadius: "4px",
                                      background: scored.conflictsWithPinned ? "#fca5a5" : "#3b82f6",
                                      color: "white",
                                      fontSize: "11px",
                                      cursor: "pointer",
                                      fontWeight: "500",
                                    }}
                                    onClick={addClassToSet({ classId: scored.cls.id, pinnedSets, activePinnedSetId })}
                                  >
                                    + Add
                                  </button>
                                </div>
                              </div>
                            ))}
                          </ct-vstack>,
                          <p style="color: #9ca3af; font-size: 13px; font-style: italic; margin: 0;">
                            All classes are pinned to this set!
                          </p>
                        )}
                      </div>
                    </div>
                  </ct-hstack>,
                  null
                )}
              </ct-vstack>
            </ct-vscroll>

            {/* ========== TAB 4: SETTINGS ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 24px;">
                <h2 style="font-size: 18px; font-weight: 600; margin: 0;">Settings</h2>

                {/* Child Profile Section */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                    Child Profile
                  </h3>
                  <ct-vstack style="gap: 12px;">
                    <div>
                      <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                        Name
                      </label>
                      <ct-input
                        placeholder="Child's name"
                        $value={childName}
                      />
                    </div>
                    <div>
                      <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                        Grade
                      </label>
                      <ct-select
                        $value={childGrade}
                        items={GRADE_OPTIONS.map((g) => ({ label: g, value: g }))}
                      />
                    </div>
                    <div>
                      <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                        Birth Date
                      </label>
                      <ct-input
                        type="date"
                        $value={childBirthDate}
                      />
                    </div>
                    <div>
                      <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                        Eligibility Notes
                      </label>
                      <ct-input
                        style={{ height: "60px" }}
                        placeholder="Any special eligibility requirements or notes..."
                        $value={childEligibilityNotes}
                      />
                    </div>
                  </ct-vstack>
                </div>

                {/* Locations Section */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                    Locations
                  </h3>

                  {/* Existing locations */}
                  {derive(locations, (locs) =>
                    locs.length > 0 ? (
                      <ct-vstack style="gap: 8px; margin-bottom: 16px;">
                        {locs.map((loc) => (
                          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e5e7eb;">
                            <div>
                              <div style="font-weight: 500;">{loc.name}</div>
                              <div style="font-size: 12px; color: #6b7280;">
                                {loc.type}
                                {loc.hasFlatDailyRate && ` - $${loc.dailyRate}/day flat rate`}
                              </div>
                            </div>
                            <ct-button
                              size="sm"
                              variant="destructive"
                              onClick={removeLocation({ locations, locationId: loc.id })}
                            >
                              Remove
                            </ct-button>
                          </div>
                        ))}
                      </ct-vstack>
                    ) : (
                      <div style="color: #9ca3af; font-style: italic; margin-bottom: 16px;">
                        No locations added yet.
                      </div>
                    )
                  )}

                  {/* Add new location form */}
                  <div style="border-top: 1px solid #e5e7eb; padding-top: 12px;">
                    <h4 style="font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: #6b7280;">
                      Add Location
                    </h4>
                    <ct-vstack style="gap: 8px;">
                      <ct-input
                        placeholder="Location name (e.g., TBS Afterschool)"
                        $value={newLocationForm.key("name")}
                      />
                      <select
                        style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                        value={newLocationForm.key("type")}
                      >
                        <option value="afterschool">Afterschool Program</option>
                        <option value="private_school">Private School</option>
                        <option value="external">External Class</option>
                        <option value="other">Other</option>
                      </select>
                      <ct-input
                        placeholder="Address (optional)"
                        $value={newLocationForm.key("address")}
                      />
                      <ct-hstack style="gap: 8px; align-items: center;">
                        <ct-checkbox
                          $checked={newLocationForm.key("hasFlatDailyRate")}
                        />
                        <span style="font-size: 14px;">Has flat daily rate</span>
                        {ifElse(
                          newLocationForm.key("hasFlatDailyRate"),
                          <ct-input
                            type="number"
                            style={{ width: "80px" }}
                            placeholder="$/day"
                            $value={newLocationForm.key("dailyRate")}
                          />,
                          null
                        )}
                      </ct-hstack>
                      <ct-button
                        variant="default"
                        onClick={addLocation({ locations, newLocationForm })}
                      >
                        Add Location
                      </ct-button>
                    </ct-vstack>
                  </div>
                </div>

                {/* Travel Times Section */}
                {derive(locations, (locs: Location[]) =>
                  locs.length >= 2 ? (
                    <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                      <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                        Travel Times
                      </h3>
                      <p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0;">
                        Travel time between different locations is used for conflict detection.
                        Default is 15 minutes between any two different locations.
                      </p>
                      {derive(travelTimes, (times: TravelTime[]) =>
                        times.length > 0 ? (
                          <ct-vstack style="gap: 8px;">
                            {times.map((t: TravelTime) => {
                              const fromLoc = locs.find((l: Location) => l.id === t.fromLocationId);
                              const toLoc = locs.find((l: Location) => l.id === t.toLocationId);
                              return (
                                <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e5e7eb;">
                                  <span style="font-size: 12px; flex: 1;">{fromLoc?.name || "?"}</span>
                                  <span style="font-size: 12px; color: #9ca3af;">↔</span>
                                  <span style="font-size: 12px; flex: 1;">{toLoc?.name || "?"}</span>
                                  <span style="font-size: 12px; font-weight: 600; color: #374151;">{t.minutes} min</span>
                                </div>
                              );
                            })}
                          </ct-vstack>
                        ) : (
                          <div style="font-size: 12px; color: #9ca3af; font-style: italic;">
                            Using default 15 minutes between all location pairs.
                          </div>
                        )
                      )}
                    </div>
                  ) : null
                )}

                {/* Category Tags Section */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                    Category Tags
                  </h3>
                  <p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0;">
                    Tags help categorize classes. The AI will use these when importing.
                  </p>

                  {/* Existing tags */}
                  <ct-hstack style="flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                    {categoryTags.map((tag) => (
                      <div style={`display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: ${tag.color}20; border: 1px solid ${tag.color}; border-radius: 16px;`}>
                        <span style={`color: ${tag.color}; font-size: 12px; font-weight: 500;`}>{tag.name}</span>
                        <ct-button
                          size="sm"
                          variant="ghost"
                          onClick={removeCategoryTag({ categoryTags, tagId: tag.id })}
                        >
                          ×
                        </ct-button>
                      </div>
                    ))}
                  </ct-hstack>

                  {/* Add new tag */}
                  <ct-hstack style="gap: 8px;">
                    <ct-input
                      style={{ flex: "1" }}
                      placeholder="New tag name..."
                      $value={newTagName}
                    />
                    <ct-button
                      variant="secondary"
                      onClick={addCategoryTag({ categoryTags, newTagName })}
                    >
                      Add
                    </ct-button>
                  </ct-hstack>
                </div>

                {/* Friends Section */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                    Friends
                  </h3>
                  <p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0;">
                    Track friends to prioritize classes they're taking.
                  </p>

                  {/* Existing friends */}
                  {derive(friends, (f) =>
                    f.length > 0 ? (
                      <ct-hstack style="flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                        {f.map((friend) => (
                          <div style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: #dbeafe; border-radius: 16px;">
                            <span style="color: #1d4ed8; font-size: 12px; font-weight: 500;">{friend.name}</span>
                            <ct-button
                              size="sm"
                              variant="ghost"
                              onClick={removeFriend({ friends, friendId: friend.id })}
                            >
                              ×
                            </ct-button>
                          </div>
                        ))}
                      </ct-hstack>
                    ) : (
                      <div style="color: #9ca3af; font-style: italic; margin-bottom: 12px;">
                        No friends added yet.
                      </div>
                    )
                  )}

                  {/* Add new friend */}
                  <ct-hstack style="gap: 8px;">
                    <ct-input
                      style={{ flex: "1" }}
                      placeholder="Friend's name..."
                      $value={newFriendName}
                    />
                    <ct-button
                      variant="default"
                      onClick={addFriend({ friends, newFriendName })}
                    >
                      Add
                    </ct-button>
                  </ct-hstack>
                </div>
              </ct-vstack>
            </ct-vscroll>
          </ct-autolayout>
        </ct-screen>
      ),
    };
  }
);
