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
  Writable,
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

type LocationType = "afterschool-onsite" | "afterschool-offsite" | "external";

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

// Extended type for staged classes with user selection state
// NOTE: Using plain boolean since we'll track selections in a separate Writable<Record<string, boolean>>
interface StagedClassWithSelection extends StagedClass {
  selected: boolean;
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

// Status types for tracking class registration progress
const STATUS_TYPES = [
  { key: "registered", label: "Registered", color: "#3b82f6", icon: "📝" },
  { key: "confirmed", label: "Confirmed", color: "#8b5cf6", icon: "✓" },
  { key: "waitlisted", label: "Waitlisted", color: "#f59e0b", icon: "⏳" },
  { key: "paid", label: "Paid", color: "#10b981", icon: "💵" },
  { key: "onCalendar", label: "On Calendar", color: "#06b6d4", icon: "📅" },
] as const;

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
  { locations: Writable<Location[]>; newLocationForm: Writable<{ name: string; type: LocationType; address: string; hasFlatDailyRate: boolean; dailyRate: number }> }
>((_, { locations, newLocationForm }) => {
  const form = newLocationForm.get();
  const name = form.name || "";
  if (!name.trim()) return;

  const newLocation: Location = {
    id: generateId(),
    name: name.trim(),
    type: form.type || "afterschool-onsite",
    address: (form.address || "").trim(),
    hasFlatDailyRate: form.hasFlatDailyRate || false,
    dailyRate: form.dailyRate || 0,
  };

  locations.push(newLocation);
  newLocationForm.set({ name: "", type: "afterschool-onsite", address: "", hasFlatDailyRate: false, dailyRate: 0 });
});

const removeLocation = handler<
  unknown,
  { locations: Writable<Location[]>; locationId: string }
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
  { categoryTags: Writable<CategoryTag[]>; newTagName: Writable<string> }
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
  { categoryTags: Writable<CategoryTag[]>; tagId: string }
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
  { friends: Writable<Friend[]>; newFriendName: Writable<string> }
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
  { friends: Writable<Friend[]>; friendId: string }
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
  { travelTimes: Writable<TravelTime[]>; fromLocationId: string; toLocationId: string; minutes: number }
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

// NOTE: handlers are defined at module level (selectAllInCategoryHandler, deselectAllInCategoryHandler,
// confirmImportHandler) for proper Cell access from onClick. The pattern provides pre-computed
// Cell values (autoKeptClassIds, needsReviewClassIds, autoDiscardedClassIds, classesToImport)
// that the handlers read via .get() at click time.

// Manual class entry handler
const addManualClass = handler<
  unknown,
  {
    classes: Writable<Class[]>;
    manualClassForm: Writable<{
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
    importLocationId: Writable<string>;
    locations: Writable<Location[]>;
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
  { pinnedSets: Writable<PinnedSet[]>; activePinnedSetId: Writable<string> }
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
  { pinnedSets: Writable<PinnedSet[]>; activePinnedSetId: Writable<string>; setId: string }
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
  { pinnedSets: Writable<PinnedSet[]>; setId: string; newName: string }
>((_, { pinnedSets, setId, newName }) => {
  const sets = pinnedSets.get();
  pinnedSets.set(
    sets.map((s) => (s.id === setId ? { ...s, name: newName } : s))
  );
});

// Add a class to the active pinned set
const addClassToSet = handler<
  unknown,
  { pinnedSets: Writable<PinnedSet[]>; activePinnedSetId: Writable<string>; classId: string }
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
  { pinnedSets: Writable<PinnedSet[]>; activePinnedSetId: Writable<string>; classId: string }
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
  { activePinnedSetId: Writable<string>; setId: string }
>((_, { activePinnedSetId, setId }) => {
  activePinnedSetId.set(setId);
});

// Add all classes from a suggested set
const addSuggestedSet = handler<
  unknown,
  { pinnedSets: Writable<PinnedSet[]>; activePinnedSetId: Writable<string>; classIds: string[] }
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

// Toggle selected class for "what becomes incompatible" feature (click/tap - works on desktop and mobile)
const toggleSelectedClass = handler<
  unknown,
  { selectedClassId: Writable<string>; classId: string }
>((_, { selectedClassId, classId }) => {
  const current = selectedClassId.get();
  selectedClassId.set(current === classId ? "" : classId);
});

// Toggle a status checkbox for a class
const toggleClassStatus = handler<
  unknown,
  { classStatuses: Writable<ClassStatus[]>; classId: string; statusKey: string }
>((_, { classStatuses, classId, statusKey }) => {
  const statuses = classStatuses.get();
  const existingIndex = statuses.findIndex((s) => s.classId === classId);

  if (existingIndex >= 0) {
    // Update existing status record
    const existing = statuses[existingIndex];
    const newStatuses = existing.statuses[statusKey] ? { ...existing.statuses } : { ...existing.statuses };
    newStatuses[statusKey] = !newStatuses[statusKey];
    classStatuses.set([
      ...statuses.slice(0, existingIndex),
      { ...existing, statuses: newStatuses },
      ...statuses.slice(existingIndex + 1),
    ]);
  } else {
    // Create new status record
    classStatuses.set([
      ...statuses,
      { classId, statuses: { [statusKey]: true }, notes: "" },
    ]);
  }
});

// Open/close settings dialog
const openSettingsDialog = handler<
  unknown,
  { showSettingsDialog: Writable<boolean> }
>((_, { showSettingsDialog }) => {
  showSettingsDialog.set(true);
});

const closeSettingsDialog = handler<
  unknown,
  { showSettingsDialog: Writable<boolean> }
>((_, { showSettingsDialog }) => {
  showSettingsDialog.set(false);
});

// Set active tab for custom tab UI
const setActiveTab = handler<
  unknown,
  { activeTab: Writable<"dashboard" | "configure" | "import" | "selection">; tab: "dashboard" | "configure" | "import" | "selection" }
>((_, { activeTab, tab }) => {
  activeTab.set(tab);
});

// Handle file upload change - extract text content from uploaded file
const handleFileUploadChange = handler<
  { detail: { files: Array<{ data: string; name: string; type: string }> } },
  { importText: Writable<string> }
>((event, { importText }) => {
  const files = event?.detail?.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  // The file.data is a data URL (e.g., "data:text/plain;base64,...")
  // We need to decode it to get the actual text content
  try {
    const dataUrl = file.data;
    // Check if it's a data URL
    if (dataUrl.startsWith("data:")) {
      // Extract base64 content after the comma
      const base64Content = dataUrl.split(",")[1];
      if (base64Content) {
        // Decode base64 to text
        const textContent = atob(base64Content);
        importText.set(textContent);
      }
    }
  } catch (e) {
    console.error("Error decoding file content:", e);
  }
});

// Clear uploaded files
const clearUploadedFiles = handler<
  unknown,
  { uploadedFiles: Writable<Array<{ id: string; name: string; url: string; data: string; timestamp: number; size: number; type: string }>> }
>((_, { uploadedFiles }) => {
  uploadedFiles.set([]);
});

// ImageData type for ct-image-input
type ImageData = { id: string; name: string; url: string; data: string; timestamp: number; size: number; type: string; width?: number; height?: number };

// Handle image upload for OCR - extracts first image from the array
const handleImageUploadForOcr = handler<
  { detail: { images: ImageData[] } },
  { uploadedImageForOcr: Writable<ImageData | null> }
>(({ detail }, { uploadedImageForOcr }) => {
  if (!detail.images || detail.images.length === 0) return;
  // Get the most recently uploaded image
  const mostRecentImage = detail.images[detail.images.length - 1];
  uploadedImageForOcr.set(mostRecentImage);
});

// Clear uploaded image for OCR
const clearUploadedImageForOcr = handler<
  unknown,
  { uploadedImageForOcr: Writable<ImageData | null> }
>((_, { uploadedImageForOcr }) => {
  uploadedImageForOcr.set(null);
});

// Copy OCR extracted text to import text field
const copyOcrToImportText = handler<
  unknown,
  { imageOcrResult: any; importText: Writable<string> }
>((_, { imageOcrResult, importText }) => {
  // imageOcrResult is the reactive result object from generateObject
  const result = imageOcrResult?.get ? imageOcrResult.get() : imageOcrResult;
  if (result?.result?.extractedText) {
    importText.set(result.result.extractedText);
  }
});

// Trigger class extraction from current import text
const triggerExtraction = handler<
  unknown,
  { importText: Writable<string>; extractionTriggerText: Writable<string> }
>((_, { importText, extractionTriggerText }) => {
  const text = importText.get();
  if (text && text.trim().length >= 50) {
    extractionTriggerText.set(text);
  }
});

// NOTE: toggleStagedClassSelection handler was removed because passing Cell references
// as handler parameters inside .map() callbacks causes "opaque ref via closure" errors.
// Instead, we use inline arrow functions in the JSX that directly mutate stagedClassSelections.

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
// HANDLERS (defined at module level for proper Cell access)
// ============================================================================

// Handler for selecting all classes in a category (sets all to true)
// Context provides: stagedClassSelections Cell and classIds Cell (computed)
// Note: classIds is a Cell<string[]> that is read at click time via .get()
const selectAllInCategoryHandler = handler<
  unknown,
  { stagedClassSelections: Writable<Record<string, boolean>>; classIds: Cell<string[]> }
>((_, { stagedClassSelections, classIds }) => {
  const current = stagedClassSelections.get() || {};
  const updated: Record<string, boolean> = { ...current };
  const ids = classIds.get();
  ids.forEach((id: string) => {
    updated[id] = true;
  });
  stagedClassSelections.set(updated);
});

// Handler for deselecting all classes in a category (sets all to false)
// Context provides: stagedClassSelections Cell and classIds Cell (computed)
const deselectAllInCategoryHandler = handler<
  unknown,
  { stagedClassSelections: Writable<Record<string, boolean>>; classIds: Cell<string[]> }
>((_, { stagedClassSelections, classIds }) => {
  const current = stagedClassSelections.get() || {};
  const updated: Record<string, boolean> = { ...current };
  const ids = classIds.get();
  ids.forEach((id: string) => {
    updated[id] = false;
  });
  stagedClassSelections.set(updated);
});

// Handler for confirming import - moves classes to main list and clears import state
// Context provides: cells for reading/writing, classesToImport Cell for reading new classes
// Event is unused (button click)
// Note: classesToImport is a Cell<Class[]> computed that is read at click time
const confirmImportHandler = handler<
  unknown,
  { classes: Writable<Class[]>; importText: Writable<string>; stagedClassSelections: Writable<Record<string, boolean>>; classesToImport: Cell<Class[]> }
>((_, { classes, importText, stagedClassSelections, classesToImport }) => {
  const newClasses = classesToImport.get();
  if (newClasses.length === 0) return;
  // Add all imported classes to the main classes list
  const currentClasses = classes.get();
  classes.set([...currentClasses, ...newClasses]);
  // Clear import state
  importText.set("");
  stagedClassSelections.set({});
});

// ============================================================================
// PATTERN
// ============================================================================

interface ExtracurricularSelectorInput {
  // Child profile - flattened for two-way binding (Cell for $value binding)
  childName: Writable<Default<string, "">>;
  childGrade: Writable<Default<Grade, "K">>;
  childBirthDate: Writable<Default<string, "">>;
  childEligibilityNotes: Writable<Default<string, "">>;
  // Collections - Default<> allows reading in computeds; handlers type them as Writable for .set()
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
  // Staged class selections - Default<> for reading, handlers type as Writable for .set()
  // NOTE: stagedClasses Cell was removed - it was dead code (never populated, only cleared)
  // Actual staged classes are derived from extractionResult via processedStagedClasses computed
  // NOTE: We can't use $checked on array items from computed() - they become read-only
  // So we track selections separately and combine with processedStagedClasses for display
  // Uses Default<> to ensure cell starts as {} (required for .key().set() to work)
  // Lazy defaults at read time: auto_kept → true, others → false
  stagedClassSelections: Default<Record<string, boolean>, {}>;
  importText: Writable<Default<string, "">>;
  importLocationId: Writable<Default<string, "">>;
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
    stagedClassSelections,
    importText,
    importLocationId,
  }) => {
    // ========================================================================
    // LOCAL STATE
    // ========================================================================

    // Form state for adding new locations
    const newLocationForm = Writable.of({ name: "", type: "afterschool-onsite" as LocationType, address: "", hasFlatDailyRate: false, dailyRate: 0 });

    // Form state for adding new tags
    const newTagName = Writable.of<string>("");

    // Form state for adding new friends
    const newFriendName = Writable.of<string>("");

    // Form state for manual class entry
    const manualClassForm = Writable.of({
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

    // Selected state for "what becomes incompatible" feature (click/tap - works on desktop and mobile)
    const selectedClassId = Writable.of<string>("");

    // Pre-computed class ID lists for each triage category (for use in handlers)
    const autoKeptClassIds = computed(() =>
      processedStagedClasses.filter((c: StagedClass) => c.triageStatus === "auto_kept").map((c: StagedClass) => c.id)
    );
    const needsReviewClassIds = computed(() =>
      processedStagedClasses.filter((c: StagedClass) => c.triageStatus === "needs_review").map((c: StagedClass) => c.id)
    );
    const autoDiscardedClassIds = computed(() =>
      processedStagedClasses.filter((c: StagedClass) => c.triageStatus === "auto_discarded").map((c: StagedClass) => c.id)
    );

    // Pre-computed list of classes to import (for confirm import handler)
    const classesToImport = computed(() => {
      const toImport = processedStagedClasses.filter((c: StagedClass) => {
        return c.triageStatus === "auto_kept" || c.triageStatus === "user_kept";
      });
      // Convert StagedClass to Class (remove triage fields)
      return toImport.map((staged: StagedClass) => ({
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
    });

    // Note: Selection state uses separate stagedClassSelections Writable<Record<string, boolean>>
    // because $checked on computed array items causes ReadOnlyAddressError

    // Settings dialog state - starts open by default, closes only when user manually closes
    const showSettingsDialog = Writable.of<boolean>(true);

    // Active tab state for custom tab UI (ct-tabs not available in JSX types)
    const activeTab = Writable.of<"dashboard" | "configure" | "import" | "selection">("dashboard");

    // Computed values for tab visibility
    const isDashboardTab = computed(() => activeTab.get() === "dashboard");
    const isConfigureTab = computed(() => activeTab.get() === "configure");
    const isImportTab = computed(() => activeTab.get() === "import");
    const isSelectionTab = computed(() => activeTab.get() === "selection");

    // File upload state - stores uploaded files (ct-file-input provides FileData[])
    const uploadedFiles = Writable.of<Array<{ id: string; name: string; url: string; data: string; timestamp: number; size: number; type: string }>>([]);

    // Image upload state for OCR - stores array of images (ct-image-input uses $images two-way binding)
    const uploadedImagesForOcr = Writable.of<ImageData[]>([]);

    // Extraction trigger - user must click button to extract classes
    // Stores the text that was submitted for extraction (empty = not triggered)
    const extractionTriggerText = Writable.of<string>("");

    // Computed: Can extraction button be enabled? (text >= 50 chars AND location selected)
    const canExtract = computed(() => {
      const text = importText.get();
      const locId = importLocationId.get();
      const textStr = typeof text === "string" ? text : "";
      return textStr.trim().length >= 50 && !!locId;
    });

    // Computed: Should show extraction help text? (missing location or insufficient text)
    const showExtractionHelp = computed(() => {
      const text = importText.get();
      const locId = importLocationId.get();
      const textStr = typeof text === "string" ? text : "";
      return !locId || textStr.trim().length < 50;
    });

    // Computed: Is location missing? (for help text branching)
    const isLocationMissing = computed(() => !importLocationId.get());

    // Computed: Character count for extraction trigger text
    const extractionTextLength = computed(() => {
      const text = extractionTriggerText.get();
      return typeof text === "string" ? text.length : 0;
    });

    // Computed: location pairs for travel time editing
    // Note: locations/travelTimes are Default<> inputs, not Writable<>, so access directly (no .get())
    // Defensive filtering: arrays may contain undefined elements due to framework quirks
    const locationPairs = computed(() => {
      const locs = (locations || []).filter((l) => l != null);
      const times = (travelTimes || []).filter((t) => t != null);
      if (locs.length < 2) return [];
      const pairs: Array<{ loc1Id: string; loc1Name: string; loc2Id: string; loc2Name: string; minutes: number }> = [];
      for (let i = 0; i < locs.length; i++) {
        for (let j = i + 1; j < locs.length; j++) {
          const loc1 = locs[i];
          const loc2 = locs[j];
          const existing = times.find(
            (t: TravelTime) =>
              (t.fromLocationId === loc1.id && t.toLocationId === loc2.id) ||
              (t.fromLocationId === loc2.id && t.toLocationId === loc1.id)
          );
          pairs.push({
            loc1Id: loc1.id,
            loc1Name: loc1.name,
            loc2Id: loc2.id,
            loc2Name: loc2.name,
            minutes: existing?.minutes ?? 15,
          });
        }
      }
      return pairs;
    });

    // Settings dialog visibility - just follows the showSettingsDialog cell
    // (starts open by default, closes only when user manually closes)
    const isSettingsDialogVisible = showSettingsDialog;

    // ========================================================================
    // LLM EXTRACTION
    // ========================================================================

    // Build extraction prompt - only when user triggers extraction
    // Inside computed(), all inputs may be wrapped - use defensive access
    const extractionPrompt = computed(() => {
      // Use the triggered text, not live importText - extraction only runs when button clicked
      const text = extractionTriggerText.get();
      const locId = importLocationId.get();
      const grade = childGrade.get();
      // Access arrays - may be wrapped inside computed(), so try .get() first
      const tags = (categoryTags as any)?.get?.() ?? categoryTags ?? [];
      const locs = (locations as any)?.get?.() ?? locations ?? [];

      // Don't extract if no triggered text or no location selected
      if (!text || typeof text !== "string" || text.trim().length < 50 || !locId) {
        return "";
      }

      const locsArray = Array.isArray(locs) ? locs : [];
      const tagsArray = Array.isArray(tags) ? tags : [];

      const locationName = locsArray.find((l: Location) => l.id === locId)?.name || "Unknown";
      const tagNames = tagsArray.map((t: CategoryTag) => t.name).join(", ");

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
    });

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
                cost: { type: "number", description: "Cost of class, 0 if not specified" },
                costPer: { type: "string", description: "Cost period: semester, month, or session. Empty string if not specified" },
                notes: { type: "string", description: "Additional notes, empty string if none" },
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

    // Computed: Is extraction in progress? (defined after extractionResult)
    const isExtractionPending = computed(() => (extractionResult as any)?.pending === true);

    // Computed: Suggested new tags from extraction result (for display in UI)
    const suggestedNewTags = computed(() => {
      const r = (extractionResult as any)?.result;
      return (r?.suggestedNewTags as string[]) || [];
    });
    const hasSuggestedNewTags = derive(suggestedNewTags, (tags) => tags.length > 0);

    // Image OCR extraction - extracts text from uploaded photos
    const imageOcrPrompt = computed(() => {
      const images = uploadedImagesForOcr.get();
      // Only run when there's an image uploaded - get the most recent one
      if (!images || images.length === 0) {
        return ""; // Empty prompt prevents API call
      }
      const img = images[images.length - 1];
      if (!img || !img.data) {
        return "";
      }

      return [
        { type: "image" as const, image: img.data },
        {
          type: "text" as const,
          text: `Extract all text from this image of a class schedule or activity listing.

Preserve the structure and formatting as much as possible. Include:
- Class/activity names
- Days and times
- Grade levels or age ranges
- Costs/fees
- Descriptions
- Any other relevant information

Return the complete extracted text.`
        }
      ];
    });

    const imageOcrResult = generateObject({
      model: "anthropic:claude-sonnet-4-5",
      prompt: imageOcrPrompt,
      schema: {
        type: "object",
        properties: {
          extractedText: { type: "string", description: "All text extracted from the image, preserving structure" },
          confidence: { type: "number", description: "Confidence in extraction quality (0-1)" },
        },
      },
    });

    // Pre-computed values for image OCR state (must be outside JSX for reactivity)
    const hasUploadedImage = computed(() => uploadedImagesForOcr.get().length > 0);
    const isImageOcrPending = computed(() => (imageOcrResult as any)?.pending === true);
    const hasImageOcrResult = computed(() => {
      const r = imageOcrResult as any;
      return r?.result?.extractedText && !r?.pending;
    });

    // Process extraction results into staged classes
    const processedStagedClasses = computed(() => {
      // extractionResult is a generateObject result with .result, .pending, .error properties
      // Access via extractionResult directly - framework handles reactivity
      const extractionState = (extractionResult as any);
      const locId = importLocationId.get();  // Writable<> - use .get()
      const locs = locations;                // Default<> - access directly
      const tags = categoryTags;             // Default<> - access directly

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
    });

    // No initialization needed - lazy defaults computed at read time
    // Default: auto_kept → selected (true), others → not selected (false)

    // Computed values for staged class counts and checks
    // Now using processedStagedClasses (read-only computed) + stagedClassSelections (writable Cell)
    const stagedClassCount = computed(() => processedStagedClasses.length);
    const hasStagedClasses = computed(() => stagedClassCount > 0);
    const autoKeptCount = computed(() =>
      processedStagedClasses.filter((c: StagedClass) => c.triageStatus === "auto_kept").length
    );
    const hasAutoKeptClasses = computed(() => autoKeptCount > 0);
    const needsReviewCount = computed(() =>
      processedStagedClasses.filter((c: StagedClass) => c.triageStatus === "needs_review").length
    );
    const hasNeedsReviewClasses = computed(() => needsReviewCount > 0);
    const autoDiscardedCount = computed(() =>
      processedStagedClasses.filter((c: StagedClass) => c.triageStatus === "auto_discarded").length
    );
    const hasAutoDiscardedClasses = computed(() => autoDiscardedCount > 0);
    const selectedClassCount = computed(() => {
      // Argument cells are auto-proxied - access directly without .get()
      const selections = stagedClassSelections || {};
      // Lazy defaults: auto_kept → true, others → false
      return processedStagedClasses.filter((c: StagedClass) =>
        selections[c.id] ?? (c.triageStatus === "auto_kept")
      ).length;
    });
    const hasSelectedClasses = computed(() => selectedClassCount > 0);
    const selectedClassCountIsOne = computed(() => selectedClassCount === 1);

    // Computed: staged classes with selection state for display
    // Combines processedStagedClasses (data) with stagedClassSelections (state)
    // Uses lazy defaults: auto_kept → true, others → false
    const stagedClassesWithSelections = computed(() => {
      // Argument cells are auto-proxied - access directly without .get()
      const selections = stagedClassSelections || {};
      return processedStagedClasses.map((cls: StagedClass) => ({
        ...cls,
        selected: selections[cls.id] ?? (cls.triageStatus === "auto_kept")
      }));
    });

    // Filter computeds for triage UI
    const autoKeptClasses = computed(() =>
      stagedClassesWithSelections.filter((cls: StagedClassWithSelection) => cls.triageStatus === "auto_kept")
    );
    const needsReviewClasses = computed(() =>
      stagedClassesWithSelections.filter((cls: StagedClassWithSelection) => cls.triageStatus === "needs_review")
    );
    const autoDiscardedClasses = computed(() =>
      stagedClassesWithSelections.filter((cls: StagedClassWithSelection) => cls.triageStatus === "auto_discarded")
    );

    // NOTE: Checkbox toggle is handled inline in derive callbacks below.
    // Using handler() inside derive causes "Cannot create cell link" errors.
    // Instead, pass stagedClassSelections through derive and use direct function calls.

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

    // Inside computed(), the framework wraps values in OpaqueCell
    // Use .some() with direct comparison instead of .includes() to handle wrapped values
    const pinnedClasses = computed(() => {
      return classes.filter((c: Class) => pinnedClassIds.some((id: string) => id === c.id));
    });

    const hasPinnedClasses = computed(() => pinnedClasses.length > 0);
    const pinnedClassCount = computed(() => pinnedClasses.length);

    // Available (unpinned) classes
    const availableClasses = computed(() => {
      return classes.filter((c: Class) => !pinnedClassIds.some((id: string) => id === c.id));
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

    // hasRankedClasses - computed inline from inputs to avoid nested computed access
    const hasRankedClasses = computed(() => {
      const activeSet = pinnedSets.find((s) => s.id === activePinnedSetId) || null;
      const pinnedIds: string[] = activeSet?.classIds || [];
      const availableCount = classes.filter((c: Class) => !pinnedIds.some((id: string) => id === c.id)).length;
      return availableCount > 0;
    });

    // hasSuggestedSets - computed inline from inputs to avoid nested computed access
    const hasSuggestedSets = computed(() => {
      const activeSet = pinnedSets.find((s) => s.id === activePinnedSetId) || null;
      const pinnedIds: string[] = activeSet?.classIds || [];
      const available = classes.filter((c: Class) => !pinnedIds.some((id: string) => id === c.id));
      const pinned = classes.filter((c: Class) => pinnedIds.some((id: string) => id === c.id));
      const sets = generateSuggestedSets(available, pinned, categoryTags, friendInterests, travelTimes);
      return sets.length > 0;
    });

    // Ranked classes JSX - computed to avoid mapping computed array in JSX
    // Compute EVERYTHING inline from inputs - no nested computed access
    // NOTE: Inside computed, all Cell values are auto-unwrapped to plain values
    const rankedClassesDisplay = computed(() => {
      // First, get the active set's class IDs
      const activeSet = pinnedSets.find((s) => s.id === activePinnedSetId) || null;
      const pinnedIds: string[] = activeSet?.classIds || [];

      // Compute available and pinned classes inline from the classes input
      const available = classes.filter((c: Class) => !pinnedIds.some((id: string) => id === c.id));
      const pinned = classes.filter((c: Class) => pinnedIds.some((id: string) => id === c.id));

      // Get active class ID (selected via click/tap)
      // Use .get() to explicitly read the cell value and create a reactive dependency
      const activeClassId = selectedClassId.get() || "";

      // Score each class inline rather than using nested computed
      const scored = available.map((cls: Class) =>
        scoreClass(cls, pinned, preferencePriorities, friendInterests, travelTimes, locations)
      );

      // Sort by score
      scored.sort((a: ScoredClass, b: ScoredClass) => {
        if (a.conflictsWithPinned && !b.conflictsWithPinned) return 1;
        if (!a.conflictsWithPinned && b.conflictsWithPinned) return -1;
        return b.score - a.score;
      });

      // Compute "what becomes incompatible" for each class
      // For each class, find other available classes that would conflict if this one were added
      const incompatibilityMap = new Map<string, Array<{ name: string; reason: string }>>();
      for (const item of scored) {
        const wouldBlock: Array<{ name: string; reason: string }> = [];
        for (const other of scored) {
          if (item.cls.id === other.cls.id) continue;
          if (other.conflictsWithPinned) continue; // Already conflicts with pinned
          // Check if adding item.cls would create a conflict with other.cls
          if (classesConflictWithTravel(item.cls, other.cls, travelTimes)) {
            const reason = getConflictReason(item.cls, other.cls, travelTimes);
            wouldBlock.push({ name: other.cls.name, reason });
          }
        }
        incompatibilityMap.set(item.cls.id, wouldBlock);
      }

      // Build simple display data to avoid opaque value issues
      const displayItems = scored.map((item: ScoredClass) => {
        const wouldBlock = incompatibilityMap.get(item.cls.id) || [];
        return {
          name: String(item.cls.name || ""),
          score: Number(item.score) || 0,
          day: String(item.cls.timeSlots[0]?.day || ""),
          startTime: String(item.cls.timeSlots[0]?.startTime || ""),
          endTime: String(item.cls.timeSlots[0]?.endTime || ""),
          cost: Number(item.cls.cost) || 0,
          conflictsWithPinned: Boolean(item.conflictsWithPinned),
          conflictReasons: item.conflictReasons ? [...item.conflictReasons].join(", ") : "",
          classId: String(item.cls.id || ""),
          prefScore: Number(item.breakdown?.preferenceScore) || 0,
          friendBonus: Number(item.breakdown?.friendBonus) || 0,
          travelPenalty: Number(item.breakdown?.travelPenalty) || 0,
          tbsPenalty: Number(item.breakdown?.tbsPenalty) || 0,
          wouldBlockCount: wouldBlock.length,
          wouldBlockList: wouldBlock.map(b => `${b.name} (${b.reason})`).join(", "),
          wouldBlockLabel: wouldBlock.length === 1 ? "1 other class" : `${wouldBlock.length} other classes`,
          isActive: String(item.cls.id) === String(activeClassId),
        };
      });

      return displayItems.map((item) => (
        <div
          style={{
            background: item.isActive ? "#eff6ff" : item.conflictsWithPinned ? "#fef2f2" : "white",
            border: item.isActive ? "2px solid #3b82f6" : item.conflictsWithPinned ? "1px solid #fca5a5" : "1px solid #e5e7eb",
            borderRadius: "6px",
            padding: "10px 12px",
          }}
        >
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            {/* Clickable area for selecting class to see conflicts */}
            <button
              style={{
                flex: "1",
                background: "transparent",
                border: "none",
                padding: "0",
                textAlign: "left",
                cursor: "pointer",
              }}
              onClick={toggleSelectedClass({ selectedClassId, classId: item.classId })}
            >
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 13px; font-weight: 500;">{item.name}</span>
                <span style={{
                  padding: "2px 6px",
                  borderRadius: "10px",
                  background: item.score > 0 ? "#dcfce7" : item.score < 0 ? "#fee2e2" : "#f3f4f6",
                  color: item.score > 0 ? "#166534" : item.score < 0 ? "#991b1b" : "#6b7280",
                  fontSize: "10px",
                  fontWeight: "600",
                }}>
                  {item.score > 0 ? "+" : ""}{item.score} pts
                </span>
                {/* Show block count badge when not active */}
                {!item.isActive && item.wouldBlockCount > 0 && (
                  <span style={{
                    padding: "2px 6px",
                    borderRadius: "10px",
                    background: "#fef3c7",
                    color: "#92400e",
                    fontSize: "9px",
                    fontWeight: "500",
                  }}>
                    blocks {item.wouldBlockCount}
                  </span>
                )}
              </div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">
                {DAY_LABELS[item.day as DayOfWeek]} {item.startTime}-{item.endTime}
                {item.cost > 0 && ` • $${item.cost}`}
              </div>
              {/* Score breakdown */}
              {(item.prefScore > 0 || item.friendBonus > 0 || item.travelPenalty > 0 || item.tbsPenalty > 0) && (
                <div style="font-size: 9px; color: #9ca3af; margin-top: 2px;">
                  {item.prefScore > 0 && <span style="color: #16a34a;">+{item.prefScore} pref </span>}
                  {item.friendBonus > 0 && <span style="color: #2563eb;">+{item.friendBonus} friends </span>}
                  {item.travelPenalty > 0 && <span style="color: #dc2626;">-{item.travelPenalty} travel </span>}
                  {item.tbsPenalty > 0 && <span style="color: #dc2626;">-{item.tbsPenalty} partial </span>}
                </div>
              )}
              {item.conflictsWithPinned && (
                <div style="font-size: 10px; color: #dc2626; margin-top: 2px;">
                  ⚠️ Conflicts with pinned: {item.conflictReasons}
                </div>
              )}
              {/* "What becomes incompatible" - shown when selected */}
              {item.isActive && item.wouldBlockCount > 0 && (
                <div style="font-size: 10px; color: #b45309; margin-top: 4px; padding: 6px 8px; background: #fef3c7; border-radius: 4px;">
                  <div style="font-weight: 600; margin-bottom: 2px;">
                    ⚠️ Adding this would block {item.wouldBlockLabel}:
                  </div>
                  <div style="font-size: 9px; color: #92400e;">
                    {item.wouldBlockList}
                  </div>
                </div>
              )}
              {item.isActive && item.wouldBlockCount === 0 && !item.conflictsWithPinned && (
                <div style="font-size: 10px; color: #16a34a; margin-top: 4px; padding: 6px 8px; background: #dcfce7; border-radius: 4px;">
                  ✓ No conflicts - safe to add!
                </div>
              )}
            </button>
            <button
              style={{
                padding: "4px 10px",
                border: "none",
                borderRadius: "4px",
                background: item.conflictsWithPinned ? "#fca5a5" : "#3b82f6",
                color: "white",
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: "500",
                marginLeft: "8px",
              }}
              onClick={addClassToSet({ classId: item.classId, pinnedSets, activePinnedSetId })}
            >
              + Add
            </button>
          </div>
        </div>
      ));
    });

    // Suggested sets JSX - computed to avoid mapping computed array in JSX
    // Compute EVERYTHING inline from inputs - no nested computed access
    const suggestedSetsDisplay = computed(() => {
      // First, get the active set's class IDs
      const activeSet = pinnedSets.find((s) => s.id === activePinnedSetId) || null;
      const pinnedIds = activeSet?.classIds || [];

      // Compute available and pinned classes inline from the classes input
      const available = classes.filter((c: Class) => !pinnedIds.some((id: string) => id === c.id));
      const pinned = classes.filter((c: Class) => pinnedIds.some((id: string) => id === c.id));

      // Generate suggested sets inline
      const sets = generateSuggestedSets(available, pinned, categoryTags, friendInterests, travelTimes);

      return sets.map((set: SuggestedSet) => (
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
      ));
    });

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
      const statuses = classStatuses as ClassStatus[];

      // Helper to get status for a class
      const getClassStatus = (classId: string): Record<string, boolean> => {
        const status = statuses.find((s) => s.classId === classId);
        return status?.statuses || {};
      };

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
            {dayClasses.map((cls) => {
              const clsStatuses = getClassStatus(cls.id);
              return (
                <div style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
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
                  {/* Status checkboxes */}
                  <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
                    {STATUS_TYPES.map((statusType) => {
                      const isChecked = !!clsStatuses[statusType.key];
                      return (
                        <button
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                            padding: "2px 6px",
                            border: isChecked ? `1px solid ${statusType.color}` : "1px solid #d1d5db",
                            borderRadius: "12px",
                            background: isChecked ? `${statusType.color}15` : "white",
                            fontSize: "10px",
                            cursor: "pointer",
                            color: isChecked ? statusType.color : "#9ca3af",
                            fontWeight: isChecked ? "500" : "400",
                          }}
                          onClick={toggleClassStatus({ classStatuses, classId: cls.id, statusKey: statusType.key })}
                        >
                          <span>{statusType.icon}</span>
                          <span>{statusType.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }).filter(Boolean);
    });

    // Status summary JSX - computed for Dashboard tab
    // All these are Default<> inputs - access directly (no .get())
    const statusSummaryDisplay = computed(() => {
      const sets = pinnedSets;
      const activeId = activePinnedSetId;
      const statuses = classStatuses;
      const allClasses = classes;

      const activeSet = sets.find((s) => s.id === activeId);
      if (!activeSet || activeSet.classIds.length === 0) {
        return (
          <div style="color: #9ca3af; font-style: italic;">
            No classes pinned yet. Add classes from the Selection tab.
          </div>
        );
      }

      // Count statuses for pinned classes
      const pinnedIds = activeSet.classIds;
      const counts: Record<string, number> = {};
      STATUS_TYPES.forEach((st) => { counts[st.key] = 0; });

      for (const classId of pinnedIds) {
        const status = statuses.find((s) => s.classId === classId);
        if (status) {
          STATUS_TYPES.forEach((st) => {
            if (status.statuses[st.key]) {
              counts[st.key]++;
            }
          });
        }
      }

      const totalPinned = pinnedIds.length;

      return (
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">
            {totalPinned} classes in "{activeSet.name}"
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            {STATUS_TYPES.map((st) => (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 10px",
                borderRadius: "16px",
                background: counts[st.key] > 0 ? `${st.color}15` : "#f3f4f6",
                border: `1px solid ${counts[st.key] > 0 ? st.color : "#e5e7eb"}`,
              }}>
                <span style="font-size: 12px;">{st.icon}</span>
                <span style={{
                  fontSize: "12px",
                  fontWeight: counts[st.key] > 0 ? "600" : "400",
                  color: counts[st.key] > 0 ? st.color : "#9ca3af",
                }}>
                  {counts[st.key]}/{totalPinned} {st.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
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
      { pinnedSets: Writable<PinnedSet[]>; activePinnedSetId: Writable<string> }
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
      stagedClassSelections,
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
              <ct-hstack style="gap: 16px; font-size: 14px; color: #6b7280; align-items: center;">
                <span>{locationCount} locations</span>
                <span>{classCount} classes</span>
                <span>{friendCount} friends</span>
              </ct-hstack>
            </ct-hstack>
          </div>

          {/* Custom Tab Navigation (ct-tabs not available in JSX types) */}
          <div style="display: flex; gap: 0; border-bottom: 1px solid #e5e7eb; background: #f9fafb;">
            {ifElse(
              isDashboardTab,
              <button style="padding: 12px 20px; border: none; border-bottom: 2px solid #3b82f6; background: transparent; cursor: pointer; font-weight: 600; color: #1d4ed8;">
                Dashboard
              </button>,
              <button
                style="padding: 12px 20px; border: none; border-bottom: 2px solid transparent; background: transparent; cursor: pointer; font-weight: 400; color: #6b7280;"
                onClick={setActiveTab({ activeTab, tab: "dashboard" })}
              >
                Dashboard
              </button>
            )}
            {ifElse(
              isConfigureTab,
              <button style="padding: 12px 20px; border: none; border-bottom: 2px solid #3b82f6; background: transparent; cursor: pointer; font-weight: 600; color: #1d4ed8;">
                Configure
              </button>,
              <button
                style="padding: 12px 20px; border: none; border-bottom: 2px solid transparent; background: transparent; cursor: pointer; font-weight: 400; color: #6b7280;"
                onClick={setActiveTab({ activeTab, tab: "configure" })}
              >
                Configure
              </button>
            )}
            {ifElse(
              isImportTab,
              <button style="padding: 12px 20px; border: none; border-bottom: 2px solid #3b82f6; background: transparent; cursor: pointer; font-weight: 600; color: #1d4ed8;">
                Import
              </button>,
              <button
                style="padding: 12px 20px; border: none; border-bottom: 2px solid transparent; background: transparent; cursor: pointer; font-weight: 400; color: #6b7280;"
                onClick={setActiveTab({ activeTab, tab: "import" })}
              >
                Import
              </button>
            )}
            {ifElse(
              isSelectionTab,
              <button style="padding: 12px 20px; border: none; border-bottom: 2px solid #3b82f6; background: transparent; cursor: pointer; font-weight: 600; color: #1d4ed8;">
                Selection
              </button>,
              <button
                style="padding: 12px 20px; border: none; border-bottom: 2px solid transparent; background: transparent; cursor: pointer; font-weight: 400; color: #6b7280;"
                onClick={setActiveTab({ activeTab, tab: "selection" })}
              >
                Selection
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div style="flex: 1; overflow: auto;">
            {/* ========== TAB 1: DASHBOARD ========== */}
            {ifElse(
              isDashboardTab,
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
                      No child profile set. Go to Configure tab to set up.
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

                {/* Status Summary */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #374151;">
                    Status Summary
                  </h3>
                  {statusSummaryDisplay}
                </div>
              </ct-vstack>,
              null
            )}

            {/* ========== TAB 2: CONFIGURE ========== */}
            {ifElse(
              isConfigureTab,
              <ct-vstack style="padding: 16px; gap: 16px;">
                <h2 style="font-size: 18px; font-weight: 600; margin: 0;">Configure</h2>

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
                  {derive(locations, (rawLocs) => {
                    // Defensive filtering: arrays may contain undefined elements
                    const locs = (rawLocs || []).filter((l) => l != null);
                    return locs.length > 0 ? (
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
                    );
                  })}

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
                        <option value="afterschool-onsite">Afterschool - On-site</option>
                        <option value="afterschool-offsite">Afterschool - Off-site</option>
                        <option value="external">External Location</option>
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
                        onClick={addLocation({ locations, newLocationForm })}
                      >
                        + Add Location
                      </ct-button>
                    </ct-vstack>
                  </div>
                </div>

                {/* Travel Times Section */}
                {ifElse(
                  computed(() => locationPairs.length > 0),
                  <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                    <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                      Travel Times
                    </h3>
                    <p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0;">
                      Set travel time (in minutes) between each pair of locations. Used for detecting schedule conflicts.
                    </p>
                    <ct-vstack style="gap: 12px;">
                      {locationPairs.map((pair) => (
                        <div style="padding: 12px; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
                          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="font-size: 13px; font-weight: 500;">{pair.loc1Name}</span>
                            <span style="font-size: 12px; color: #9ca3af;">↔</span>
                            <span style="font-size: 13px; font-weight: 500;">{pair.loc2Name}</span>
                          </div>
                          <ct-hstack style="gap: 8px; align-items: center;">
                            <ct-button
                              onClick={setTravelTime({
                                travelTimes,
                                fromLocationId: pair.loc1Id,
                                toLocationId: pair.loc2Id,
                                minutes: Math.max(0, pair.minutes - 5),
                              })}
                            >
                              − 5 min
                            </ct-button>
                            <div style="padding: 8px 16px; background: #f3f4f6; border-radius: 6px; font-size: 16px; font-weight: 600; min-width: 80px; text-align: center;">
                              {pair.minutes} min
                            </div>
                            <ct-button
                              onClick={setTravelTime({
                                travelTimes,
                                fromLocationId: pair.loc1Id,
                                toLocationId: pair.loc2Id,
                                minutes: pair.minutes + 5,
                              })}
                            >
                              + 5 min
                            </ct-button>
                          </ct-hstack>
                        </div>
                      ))}
                    </ct-vstack>
                  </div>,
                  null
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
              </ct-vstack>,
              null
            )}

            {/* ========== TAB 3: IMPORT ========== */}
            {ifElse(
              isImportTab,
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
                        Add locations in the Configure tab before importing classes.
                      </div>,
                      <ct-select
                        $value={importLocationId}
                        items={derive(locations, (locs: Location[]) => [
                          { label: "Select a location...", value: "" },
                          ...(locs || []).filter((l) => l != null).map((loc) => ({ label: loc.name, value: loc.id }))
                        ])}
                      />
                    )}
                  </div>

                  {/* File upload section */}
                  <div style="margin-bottom: 12px; padding: 12px; background: white; border: 1px dashed #d1d5db; border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                      <ct-file-input
                        accept=".txt,.html,.htm,.pdf"
                        buttonText="📄 Upload File"
                        variant="outline"
                        size="sm"
                        showPreview={false}
                        $files={uploadedFiles}
                        onct-change={handleFileUploadChange({ importText })}
                      />
                      <span style="font-size: 12px; color: #6b7280;">
                        Upload a .txt, .html, or .pdf schedule file
                      </span>
                    </div>
                    {ifElse(
                      derive(uploadedFiles, (files: Array<{ id: string; name: string }>) => files.length > 0),
                      <div style="margin-top: 8px; font-size: 12px; color: #059669;">
                        ✓ File loaded - text extracted to field below
                      </div>,
                      null
                    )}
                  </div>

                  {/* Image upload section for OCR */}
                  <div style="margin-bottom: 12px; padding: 12px; background: white; border: 1px dashed #d1d5db; border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                      <ct-image-input
                        buttonText="📷 Upload Photo"
                        variant="outline"
                        size="sm"
                        showPreview={true}
                        previewSize="sm"
                        $images={uploadedImagesForOcr}
                      />
                      <span style="font-size: 12px; color: #6b7280;">
                        Take a photo of a schedule for OCR extraction
                      </span>
                    </div>
                    {ifElse(
                      hasUploadedImage,
                      <div style="margin-top: 8px; font-size: 12px; color: #059669;">
                        ✓ Image uploaded
                      </div>,
                      null
                    )}
                    {ifElse(
                      isImageOcrPending,
                      <div style="margin-top: 8px; padding: 8px; background: #dbeafe; border-radius: 4px; color: #1e40af; font-size: 12px;">
                        🔍 Extracting text from image...
                      </div>,
                      null
                    )}
                    {ifElse(
                      hasImageOcrResult,
                      <div style="margin-top: 8px;">
                        <div style="font-size: 12px; color: #059669; margin-bottom: 4px;">
                          ✓ Text extracted from image
                        </div>
                        <ct-button
                          size="sm"
                          variant="outline"
                          onClick={copyOcrToImportText({ imageOcrResult, importText })}
                        >
                          Use Extracted Text →
                        </ct-button>
                      </div>,
                      null
                    )}
                  </div>

                  {/* Text input */}
                  <div style="margin-bottom: 12px;">
                    <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 4px;">
                      Schedule Text (paste or use upload above)
                    </label>
                    <ct-textarea
                      style={{ width: "100%", minHeight: "200px" }}
                      placeholder="Paste the class schedule here, or upload a file/photo above..."
                      $value={importText}
                    />
                  </div>

                  {/* Extract Classes button */}
                  <div style="margin-bottom: 12px;">
                    {ifElse(
                      canExtract,
                      <ct-button
                        onClick={triggerExtraction({ importText, extractionTriggerText })}
                      >
                        🔍 Extract Classes
                      </ct-button>,
                      <ct-button disabled>
                        🔍 Extract Classes
                      </ct-button>
                    )}
                    {ifElse(
                      showExtractionHelp,
                      <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                        {ifElse(
                          isLocationMissing,
                          <span>Select a source location above to enable extraction.</span>,
                          <span>Enter at least 50 characters of schedule text to enable extraction.</span>
                        )}
                      </div>,
                      null
                    )}
                  </div>

                  {/* Extraction status */}
                  {ifElse(
                    isExtractionPending,
                    <div style="padding: 16px; background: #dbeafe; border-radius: 8px; margin-bottom: 12px;">
                      <div style="display: flex; align-items: center; justify-content: center; gap: 12px;">
                        <ct-loader />
                        <span style="color: #1e40af; font-weight: 500;">Extracting classes...</span>
                      </div>
                      <div style="text-align: center; color: #1e40af; font-size: 12px; margin-top: 8px;">
                        Analyzing {extractionTextLength} characters of text
                      </div>
                    </div>,
                    null
                  )}
                </div>

                {/* Triage results from extraction - uses handler for checkbox toggling */}
                {ifElse(
                  hasStagedClasses,
                  <ct-vstack style="gap: 16px;">
                    {/* Auto-kept classes (eligible) - using filtered computed + handler */}
                    {ifElse(
                      hasAutoKeptClasses,
                      <div style="background: #dcfce7; border: 1px solid #86efac; border-radius: 8px; padding: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                          <h3 style="font-size: 14px; font-weight: 600; margin: 0; color: #166534;">
                            Ready to Import ({autoKeptCount})
                          </h3>
                          <div style="display: flex; gap: 8px;">
                            <button
                              style="font-size: 11px; padding: 2px 8px; background: #166534; color: white; border: none; border-radius: 4px; cursor: pointer;"
                              onClick={selectAllInCategoryHandler({ stagedClassSelections, classIds: autoKeptClassIds })}
                            >All</button>
                            <button
                              style="font-size: 11px; padding: 2px 8px; background: white; color: #166534; border: 1px solid #166534; border-radius: 4px; cursor: pointer;"
                              onClick={deselectAllInCategoryHandler({ stagedClassSelections, classIds: autoKeptClassIds })}
                            >None</button>
                          </div>
                        </div>
                        <ct-vstack style="gap: 8px;">
                          {autoKeptClasses.map((cls: StagedClassWithSelection) => (
                            <div style="background: white; border-radius: 4px; padding: 8px 12px;">
                              <div style="display: flex; gap: 12px; align-items: flex-start;">
                                {/* TODO: Individual checkbox toggle doesn't work - onClick inside computed.map()
                                    causes framework issues. All/None buttons work as workaround. */}
                                <ct-checkbox
                                  checked={cls.selected}
                                  disabled
                                />
                                <div style="flex: 1;">
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
                              </div>
                            </div>
                          ))}
                        </ct-vstack>
                      </div>,
                      null
                    )}

                    {/* Needs review classes - using filtered computed + handler */}
                    {ifElse(
                      hasNeedsReviewClasses,
                      <div style="background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                          <h3 style="font-size: 14px; font-weight: 600; margin: 0; color: #854d0e;">
                            Needs Review ({needsReviewCount})
                          </h3>
                          <div style="display: flex; gap: 8px;">
                            <button
                              style="font-size: 11px; padding: 2px 8px; background: #854d0e; color: white; border: none; border-radius: 4px; cursor: pointer;"
                              onClick={selectAllInCategoryHandler({ stagedClassSelections, classIds: needsReviewClassIds })}
                            >All</button>
                            <button
                              style="font-size: 11px; padding: 2px 8px; background: white; color: #854d0e; border: 1px solid #854d0e; border-radius: 4px; cursor: pointer;"
                              onClick={deselectAllInCategoryHandler({ stagedClassSelections, classIds: needsReviewClassIds })}
                            >None</button>
                          </div>
                        </div>
                        <ct-vstack style="gap: 8px;">
                          {needsReviewClasses.map((cls: StagedClassWithSelection) => (
                            <div style="background: white; border-radius: 4px; padding: 8px 12px;">
                              <div style="display: flex; gap: 12px; align-items: flex-start;">
                                <ct-checkbox
                                  checked={cls.selected}
                                  disabled
                                />
                                <div style="flex: 1;">
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
                      </div>,
                      null
                    )}

                    {/* Auto-discarded classes - using filtered computed + handler */}
                    {ifElse(
                      hasAutoDiscardedClasses,
                      <div style="background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                          <h3 style="font-size: 14px; font-weight: 600; margin: 0; color: #6b7280;">
                            Auto-Discarded ({autoDiscardedCount})
                          </h3>
                          <div style="display: flex; gap: 8px;">
                            <button
                              style="font-size: 11px; padding: 2px 8px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;"
                              onClick={selectAllInCategoryHandler({ stagedClassSelections, classIds: autoDiscardedClassIds })}
                            >All</button>
                            <button
                              style="font-size: 11px; padding: 2px 8px; background: white; color: #6b7280; border: 1px solid #6b7280; border-radius: 4px; cursor: pointer;"
                              onClick={deselectAllInCategoryHandler({ stagedClassSelections, classIds: autoDiscardedClassIds })}
                            >None</button>
                          </div>
                        </div>
                        <ct-vstack style="gap: 8px;">
                          {autoDiscardedClasses.map((cls: StagedClassWithSelection) => (
                            <div style="background: white; border-radius: 4px; padding: 8px 12px; opacity: 0.7;">
                              <div style="display: flex; gap: 12px; align-items: flex-start;">
                                <ct-checkbox
                                  checked={cls.selected}
                                  disabled
                                />
                                <div style="flex: 1;">
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
                      </div>,
                      null
                    )}

                    {/* Suggested new tags - use ifElse with pre-computed values */}
                    {ifElse(
                      hasSuggestedNewTags,
                      <div style="background: #f3e8ff; border: 1px solid #c4b5fd; border-radius: 8px; padding: 16px;">
                        <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #6b21a8;">
                          Suggested New Tags
                        </h3>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                          {suggestedNewTags.map((tag: string) => (
                            <span style="padding: 4px 12px; background: white; border: 1px solid #c4b5fd; border-radius: 16px; font-size: 12px;">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div style="font-size: 11px; color: #7c3aed; margin-top: 8px;">
                          Add these in Settings to use them in future imports.
                        </div>
                      </div>,
                      null
                    )}

                    {/* Confirm Import Button - counts selected classes */}
                    {ifElse(
                      hasSelectedClasses,
                      <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 16px; text-align: center;">
                        <ct-button
                          variant="default"
                          style={{ width: "100%", padding: "12px 24px", fontSize: "16px", fontWeight: "600" }}
                          onClick={confirmImportHandler({ classes, importText, stagedClassSelections, classesToImport })}
                        >
                          Import {selectedClassCount} Class{ifElse(selectedClassCountIsOne, "", "es")}
                        </ct-button>
                        <div style="font-size: 12px; color: #059669; margin-top: 8px;">
                          Selected classes will be added to your class list.
                        </div>
                      </div>,
                      null
                    )}
                  </ct-vstack>,
                  null
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
              </ct-vstack>,
              null
            )}

            {/* ========== TAB 4: SELECTION ========== */}
            {ifElse(
              isSelectionTab,
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
                            {/* Use pre-computed JSX - cannot map computed arrays directly in JSX */}
                            {suggestedSetsDisplay}
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
                            {/* Use pre-computed JSX - cannot map computed arrays directly in JSX */}
                            {rankedClassesDisplay}
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
              </ct-vstack>,
              null
            )}
          </div>
        </ct-screen>
      ),
    };
  }
);
