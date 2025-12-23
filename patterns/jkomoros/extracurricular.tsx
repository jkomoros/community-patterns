/// <cts-enable />
/**
 * Extracurricular Selector
 *
 * Helps manage extracurricular class selection for children.
 * Features:
 * - Location management
 * - Class extraction from schedules via LLM
 * - Grade and age-based eligibility triage
 * - Schedule conflict detection
 * - Pinned sets for comparing schedule options
 * - Export to Calendar (iCal) with confirmation dialog
 *
 * Security: Calendar export operations require explicit user confirmation
 * via a modal dialog that shows exactly what will be exported. This pattern
 * serves as a declassification gate for future policy-based trust systems.
 */
import { cell, Cell, computed, Default, derive, generateObject, handler, ifElse, NAME, pattern, UI } from "commontools";
import {
  generateICS,
  generateEventUID,
  getFirstOccurrenceDate,
  dayToICalDay,
  sanitizeFilename,
  type ICalEvent,
  type DayOfWeek as ICalDayOfWeek,
} from "./util/ical-generator.ts";
import { createGoogleAuth, type Auth as GoogleAuthType } from "./util/google-auth-manager.tsx";
import {
  exportToGoogle,
  type ExportTarget,
  type ExportableEvent,
} from "./util/calendar-export.tsx";
import { type ExportProgress } from "./util/calendar-export-types.ts";

// ============================================================================
// TYPES
// ============================================================================

type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

// Grade levels for eligibility filtering
type Grade = "TK" | "K" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

// Child profile for triage logic
interface ChildProfile {
  name: string;
  grade: Grade;
  birthYear: number;
  birthMonth: number;  // 1-12
  eligibilityNotes: string;
}

type LocationType = "afterschool-onsite" | "afterschool-offsite" | "external";

interface Location {
  name: string;
  type: LocationType;
  address: string;
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
  name: string;
  description: string;
  location: Location;           // EMBEDDED reference, not ID
  timeSlots: TimeSlot[];
  cost: number;
  gradeMin: string;
  gradeMax: string;
  // STATE ON OBJECT (not in separate maps)
  pinnedInSets: string[];       // Which sets this class is pinned to
  statuses: StatusFlags;        // Registration status tracking
}

// ============================================================================
// LLM EXTRACTION TYPES - Phase 3
// ============================================================================

// What the LLM extracts from schedule text
interface ExtractedClassInfo {
  name: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  gradeMin: string;
  gradeMax: string;
  permissionGrades: string;  // Grades that can join "with permission" or "by invitation"
  cost: number;
  notes: string;
}

// Full extraction response from LLM
interface ExtractionResponse {
  classes: ExtractedClassInfo[];
}

// Triage status for eligibility filtering
type TriageStatus = "auto_kept" | "auto_discarded" | "needs_review";

// ============================================================================
// PHASE 5.5: FILE/IMAGE UPLOAD TYPES
// ============================================================================

// File/Image data type for unified upload
type FileData = {
  id: string;
  name: string;
  url: string;
  data: string;  // base64 encoded
  timestamp: number;
  size: number;
  type: string;  // MIME type
  width?: number;
  height?: number;
};

// Processing state for uploaded file
type ProcessingStatus = "idle" | "processing" | "complete" | "error";

// Staged class for import preview - selection state ON object
// Triage AND display values computed when populating (avoids .get() in Cell.map())
interface StagedClass extends ExtractedClassInfo {
  selected: boolean;  // Plain boolean - $checked doesn't work inside Cell.map() (see ISSUE file)
  triageStatus: TriageStatus;        // Pre-computed when populating
  triageReason: string;              // Pre-computed when populating
  // WORKAROUND: Pre-computed display values because === comparison doesn't
  // work on item properties inside Cell.map() (comparing proxy to string = always false)
  triageEmoji: string;               // ✓, ?, or ✗
  triageBgColor: string;             // Background color based on triageStatus
  triageBorderColor: string;         // Border color based on triageStatus
}

// ============================================================================
// CALENDAR EXPORT TYPES
// ============================================================================

/** Semester/term date range for recurring events */
interface SemesterDates {
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
}

/** Recurrence rule for calendar events */
interface RecurrenceRule {
  frequency: "WEEKLY";
  byDay: string;      // e.g., "MO" or "MO,WE,FR"
  until: string;      // YYYY-MM-DD
}

/** Single event to be created in Apple Calendar via outbox */
interface CalendarOutboxEvent {
  /** Unique ID for this event */
  id: string;
  /** Event title */
  title: string;
  /** Target calendar name (e.g., "Kids Activities", "Family") */
  calendarName: string;
  /** Start date in YYYY-MM-DD format */
  startDate: string;
  /** Start time in HH:MM format */
  startTime: string;
  /** End time in HH:MM format */
  endTime: string;
  /** Event location */
  location?: string;
  /** Event description/notes */
  notes?: string;
  /** Recurrence rule for weekly events */
  recurrence?: RecurrenceRule;
}

/**
 * User confirmation metadata - captures the declassification gate.
 * This proves the user saw and approved the operation.
 */
interface UserConfirmation {
  /** ISO timestamp when user clicked confirm */
  timestamp: string;
  /** What was shown to user in the confirmation dialog */
  dialogContent: {
    displayedTitle: string;
    displayedCalendar: string;
    displayedTimeRange: string;
    displayedEventCount: number;
    displayedClasses: string[];
    warningMessage: string;
  };
  /** Source pattern for audit/future SHA verification */
  sourcePattern: {
    name: string;
    path: string;
  };
}

/** Execution status for outbox entries */
interface ExecutionResult {
  status: "pending" | "success" | "failed";
  attemptedAt?: string;
  executedAt?: string;
  error?: string;
}

/**
 * Complete outbox entry for calendar write operations.
 * Written by pattern after user confirmation, read by apple-sync CLI.
 */
interface CalendarOutboxEntry {
  /** Unique ID for this outbox entry */
  id: string;
  /** Events to create */
  events: CalendarOutboxEvent[];
  /** User confirmation metadata (proof of declassification gate) */
  confirmation: UserConfirmation;
  /** Execution result (updated by CLI) */
  execution: ExecutionResult;
  /** ISO timestamp when entry was created */
  createdAt: string;
}

/** The outbox cell structure (stored in pattern) */
interface CalendarOutbox {
  entries: CalendarOutboxEntry[];
  lastUpdated: string;
  version: string;  // "1.0"
}

/** Pending calendar export operation for confirmation dialog */
type PendingCalendarExport = {
  /** Classes to be exported */
  classes: readonly Class[];
  /** Semester date range */
  semester: SemesterDates;
  /** Generated ICS content (for download fallback) */
  icsContent: string;
  /** Child name for filename */
  childName: string;
  /** Active set name for filename */
  setName: string;
  /** Number of individual events (class * time slots) */
  eventCount: number;
  /** Target calendar name for Apple Calendar */
  calendarName: string;
  /** Events formatted for outbox */
  outboxEvents: CalendarOutboxEvent[];
  /** Classes/slots that were skipped during conversion */
  skippedItems: { className: string; reason: string }[];
  /** Number of duplicate events (already in outbox) */
  duplicateCount: number;
  /** Selected export target (google, apple, or ics) */
  selectedTarget: ExportTarget | null;
  /** Events in exportable format (for Google Calendar) */
  exportableEvents: ExportableEvent[];
} | null;

/** Result of a calendar export operation */
type CalendarExportResult = {
  success: boolean;
  message: string;
  timestamp: string;
  exportedCount: number;
  /** Export target used */
  target?: ExportTarget;
  /** Whether this was added to outbox (vs downloaded) */
  addedToOutbox?: boolean;
  /** For Google Calendar: number of failed events */
  failedCount?: number;
  /** ICS content for download (Apple/ICS targets) */
  icsContent?: string;
  /** ICS filename for download */
  icsFilename?: string;
} | null;

/** Export progress state for Google Calendar batch operations */
type CalendarExportProgress = ExportProgress | null;

// ============================================================================
// PATTERN INPUT - Phase 5
// ============================================================================

interface ExtracurricularInput {
  locations: Cell<Location[]>;
  classes: Cell<Class[]>;
  child: Cell<ChildProfile>;  // Cell<> for write access, not Default<>
  // Phase 5: Pinned sets
  pinnedSetNames: Cell<string[]>;  // Available set names
  activeSetName: Cell<string>;     // Currently active set
  // Staged classes for import preview - pattern input for idiomatic $checked binding
  // Cell<Default<>> wrapper enables cell-like property access in .map()
  stagedClasses: Cell<Default<StagedClass[], []>>;

  // Calendar export (optional feature) - provides semester date tracking
  // and iCal export for pinned classes. Mark as optional with ? to signal
  // these are auxiliary features, not core functionality.
  semesterDates?: Cell<Default<SemesterDates, { startDate: ""; endDate: "" }>>;
  calendarName?: Cell<Default<string, "">>;
  calendarOutbox?: Cell<Default<CalendarOutbox, { entries: []; lastUpdated: ""; version: "1.0" }>>;
  // Note: Google Calendar auth is managed internally via wish() - see createGoogleAuth usage
}

interface ExtracurricularOutput extends ExtracurricularInput {
  [NAME]: string;
  [UI]: JSX.Element;
}

// ============================================================================
// PATTERN
// ============================================================================

// ============================================================================
// TRIAGE LOGIC - Phase 4
// ============================================================================

// Grade order for comparison
const GRADE_ORDER: Grade[] = ["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8"];

function gradeToIndex(grade: string): number {
  const normalized = grade.toUpperCase().trim();
  const idx = GRADE_ORDER.indexOf(normalized as Grade);
  return idx >= 0 ? idx : -1;
}

function isGradeInRange(childGrade: Grade, gradeMin: string, gradeMax: string): { eligible: boolean; reason: string } {
  const childIdx = gradeToIndex(childGrade);
  const minIdx = gradeToIndex(gradeMin);
  const maxIdx = gradeToIndex(gradeMax);

  // If we can't parse the grades, needs review
  if (childIdx < 0) return { eligible: false, reason: "Unknown child grade" };
  if (minIdx < 0 || maxIdx < 0) return { eligible: false, reason: "Unknown class grade range" };

  if (childIdx >= minIdx && childIdx <= maxIdx) {
    return { eligible: true, reason: `Grade ${childGrade} is within ${gradeMin}-${gradeMax}` };
  } else if (childIdx < minIdx) {
    return { eligible: false, reason: `Grade ${childGrade} is below minimum (${gradeMin})` };
  } else {
    return { eligible: false, reason: `Grade ${childGrade} is above maximum (${gradeMax})` };
  }
}

function triageClass(cls: ExtractedClassInfo, childGrade: Grade): { status: TriageStatus; reason: string } {
  // Check for "with permission" or similar notes that suggest needs_review
  const notes = (cls.notes || "").toLowerCase();
  const hasPermissionNote = notes.includes("permission") || notes.includes("approval") || notes.includes("invitation");

  const { eligible, reason } = isGradeInRange(childGrade, cls.gradeMin, cls.gradeMax);

  // Check if child's grade is in the permissionGrades list
  const permissionGrades = (cls.permissionGrades || "").toUpperCase();
  const childGradeNorm = childGrade.toUpperCase();
  // Match grade in permission list (handles "K", "3", "TK", etc.)
  const isInPermissionGrades = permissionGrades.length > 0 && (
    permissionGrades.includes(childGradeNorm) ||
    permissionGrades.includes(childGradeNorm + "TH") ||  // "3" matches "3rd" -> "3TH" won't match but...
    permissionGrades.includes(childGradeNorm + "RD") ||  // "3RD"
    permissionGrades.includes(childGradeNorm + "ND") ||  // "2ND"
    permissionGrades.includes(childGradeNorm + "ST")     // "1ST"
  );

  if (eligible) {
    if (hasPermissionNote) {
      return { status: "needs_review", reason: `${reason}, but requires permission` };
    }
    return { status: "auto_kept", reason };
  } else if (isInPermissionGrades) {
    // Child's grade is outside normal range but eligible by permission/invitation
    return { status: "needs_review", reason: `Grade ${childGrade} eligible by invitation/permission` };
  } else {
    return { status: "auto_discarded", reason };
  }
}

// ============================================================================
// PHASE 5.5: FILE TYPE DETECTION
// ============================================================================

function detectFileType(file: FileData): "image" | "text" | "unsupported" {
  const mimeType = file.type.toLowerCase();
  const ext = file.name.toLowerCase().split('.').pop() || '';

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("text/") || ["txt", "md", "html", "htm"].includes(ext)) return "text";
  return "unsupported";
}

// ============================================================================
// PHASE 6: CONFLICT DETECTION
// ============================================================================

// A conflict between two classes
interface TimeConflict {
  class1: Class;
  class2: Class;
  day: DayOfWeek;
  overlapStart: string;
  overlapEnd: string;
}

// Parse "15:00" or "3:00 PM" to minutes since midnight
function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return -1;

  const cleaned = timeStr.trim().toUpperCase();

  // Handle 24h format "15:00"
  if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
    const [hours, mins] = cleaned.split(":").map(Number);
    return hours * 60 + mins;
  }

  // Handle 12h format "3:00 PM" or "3:00PM"
  const match12h = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (match12h) {
    let hours = parseInt(match12h[1], 10);
    const mins = parseInt(match12h[2], 10);
    const period = match12h[3];

    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return hours * 60 + mins;
  }

  return -1;  // Invalid format
}

// Check if two time slots on the same day overlap
function timeSlotsOverlap(slot1: TimeSlot, slot2: TimeSlot): { overlaps: boolean; overlapStart?: string; overlapEnd?: string } {
  // Different days = no conflict
  if (slot1.day !== slot2.day) {
    return { overlaps: false };
  }

  const start1 = parseTimeToMinutes(slot1.startTime);
  const end1 = parseTimeToMinutes(slot1.endTime);
  const start2 = parseTimeToMinutes(slot2.startTime);
  const end2 = parseTimeToMinutes(slot2.endTime);

  // Invalid times = no conflict (can't determine)
  if (start1 < 0 || end1 < 0 || start2 < 0 || end2 < 0) {
    return { overlaps: false };
  }

  // Check for overlap: NOT (end1 <= start2 OR end2 <= start1)
  if (end1 <= start2 || end2 <= start1) {
    return { overlaps: false };
  }

  // There is overlap - calculate the overlap window
  const overlapStartMins = Math.max(start1, start2);
  const overlapEndMins = Math.min(end1, end2);

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${m.toString().padStart(2, "0")}`;
  };

  return {
    overlaps: true,
    overlapStart: formatTime(overlapStartMins),
    overlapEnd: formatTime(overlapEndMins),
  };
}

// ============================================================================
// WEEKLY SCHEDULE VIEW HELPERS
// ============================================================================

// Schedule display constants
const SCHEDULE_DAYS: DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const SCHEDULE_START_HOUR = 14;  // 2 PM
const SCHEDULE_END_HOUR = 18;    // 6 PM
const SCHEDULE_HOUR_HEIGHT = 60; // pixels per hour

// Calculate top position for a time within the schedule
function timeToTopPosition(timeStr: string): number {
  const mins = parseTimeToMinutes(timeStr);
  if (mins < 0) return 0;
  const startMins = SCHEDULE_START_HOUR * 60;
  const offsetMins = mins - startMins;
  return (offsetMins / 60) * SCHEDULE_HOUR_HEIGHT;
}

// Calculate height for a duration
function durationToHeight(startStr: string, endStr: string): number {
  const startMins = parseTimeToMinutes(startStr);
  const endMins = parseTimeToMinutes(endStr);
  if (startMins < 0 || endMins < 0) return SCHEDULE_HOUR_HEIGHT; // default 1 hour
  const durationMins = endMins - startMins;
  return (durationMins / 60) * SCHEDULE_HOUR_HEIGHT;
}

// Color palette for locations (deterministic by name hash)
const LOCATION_COLORS = [
  { bg: "#e3f2fd", border: "#1976d2" }, // blue
  { bg: "#f3e5f5", border: "#7b1fa2" }, // purple
  { bg: "#e8f5e9", border: "#388e3c" }, // green
  { bg: "#fff3e0", border: "#f57c00" }, // orange
  { bg: "#fce4ec", border: "#c2185b" }, // pink
  { bg: "#e0f7fa", border: "#0097a7" }, // cyan
];

// Hash a string to a number (simple djb2 hash)
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

// Get color for a location by name (deterministic)
function getLocationColor(locationName: string): { bg: string; border: string } {
  const idx = hashString(locationName) % LOCATION_COLORS.length;
  return LOCATION_COLORS[idx];
}

// Type for precomputed schedule slot data (used by scheduleData computed)
type ScheduleSlotData = {
  cls: Class;
  slot: TimeSlot;
  color: { bg: string; border: string };
  top: number;
  height: number;
  // For overlap layout
  column: number;      // Which column (0-based) this slot occupies
  totalColumns: number; // Total columns in this overlap group
};

// ============================================================================
// PATTERN
// ============================================================================

export default pattern<ExtracurricularInput, ExtracurricularOutput>(
  ({ locations, classes, child, pinnedSetNames, activeSetName, stagedClasses, semesterDates, calendarName, calendarOutbox }) => {
    // Local cell for selected location when adding a class
    const selectedLocationIndex = cell<number>(-1);

    // Local cell for new location type when adding a location
    const newLocationType = cell<LocationType>("afterschool-onsite");

    // Handler to update selected location index (for Import section, uses number)
    const setLocationIndex = handler<
      { target: { value: string } },
      { idx: Cell<number> }
    >((event, state) => {
      state.idx.set(parseInt(event.target.value, 10));
    });

    // NOTE: Add Class uses inline handler because handler() state parameters
    // get unwrapped to snapshots, not live reactive references. Inline handlers
    // capture cells directly from closure and work correctly with reactivity.


    // =========================================================================
    // PHASE 3: IMPORT FLOW
    // =========================================================================

    // Import state
    const importText = cell<string>("");
    const importLocationIndex = cell<number>(-1);
    const extractionTriggerText = cell<string>(""); // Triggers LLM when set

    // Phase 5.5: Unified file/image upload state
    const uploadedFile = cell<FileData | null>(null);
    const uploadProcessingStatus = cell<ProcessingStatus>("idle");
    const uploadExtractedText = cell<string>("");  // Preview/edit buffer
    const uploadExtractionError = cell<string | null>(null);

    // NOTE: For Phase 3, we skip individual selection and just import all extracted classes
    // Selection state can be added in a later phase if needed

    // Build extraction prompt from trigger text
    const extractionPrompt = computed(() => {
      const text = extractionTriggerText.get();
      if (!text || text.length < 50) return "";
      return `Extract class information from this schedule text:

${text}

For each class found, extract:
- name: class name
- dayOfWeek: lowercase (monday, tuesday, etc.)
- startTime, endTime: 24h format (e.g., "15:30")
- gradeMin, gradeMax: the standard eligible grade range (e.g., "1" and "3" for Gr 1-3)
- permissionGrades: grades outside the standard range that can join "with permission", "by invitation", or "w/permission" (e.g., "K" if "K with permission", or "3, 6" if "3rd and 6th with permission"). Empty string if none.
- cost: number
- notes: any other relevant info`;
    });

    // Run LLM extraction - destructure result/pending like food-recipe.tsx
    const { result: extractionResponse, pending: extractionPending } = generateObject({
      model: "anthropic:claude-sonnet-4-5",
      prompt: extractionPrompt,
      system: "You are a precise data extraction assistant. Extract class information exactly as found. Do not invent information.",
      schema: {
        type: "object" as const,
        properties: {
          classes: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                name: { type: "string" as const },
                dayOfWeek: { type: "string" as const },
                startTime: { type: "string" as const },
                endTime: { type: "string" as const },
                gradeMin: { type: "string" as const },
                gradeMax: { type: "string" as const },
                permissionGrades: { type: "string" as const },
                cost: { type: "number" as const },
                notes: { type: "string" as const },
              },
              required: ["name", "dayOfWeek", "startTime", "endTime"] as const,
            },
          },
        },
        required: ["classes"] as const,
      },
    });

    // NOTE: stagedClasses is a PATTERN INPUT (not a local cell) because:
    // - Local cells don't support cell-like property access in .map()
    // - Pattern inputs DO support $checked={item.selected} binding
    // - This enables the idiomatic "state on objects" pattern
    // Trade-off: stagedClasses persists across sessions (can be cleared on import)

    // Track last processed extraction to detect new extractions
    // Using cell (not closure variable) because closures don't persist across pattern re-instantiation
    // The computed is idempotent: first run sets data, subsequent runs hit guard and return early
    const lastProcessedExtractionText = cell<string>("");

    // Populate stagedClasses when extraction completes (idempotent side effect)
    // Pre-computes triage at population time (not render time) to avoid Cell.map() closure issues
    computed(() => {
      const response = extractionResponse as any;
      const triggerText = extractionTriggerText.get();
      const lastText = lastProcessedExtractionText.get();  // Cell - creates dependency, but computed is idempotent

      // Skip if no response or same extraction already processed
      if (!response?.classes || !triggerText) return;
      if (triggerText === lastText) return;

      // New extraction complete - populate stagedClasses with pre-computed triage
      const childGrade = child.get()?.grade || "K";

      // Construct full array then set once (avoids N+1 reactive updates from .push())
      // WORKAROUND: Must pre-compute colors/emoji here because inside Cell.map(),
      // s.triageStatus === "auto_kept" doesn't work (proxy vs string = always false)
      // FIX: Explicitly extract primitive values to avoid spreading reactive proxy references
      // that show as $alias JSON when rendered. Don't use ...cls spread on reactive objects.
      const newClasses = response.classes.filter(Boolean).map((cls: ExtractedClassInfo) => {
        const triage = triageClass(cls, childGrade as Grade);
        // Pre-compute display values based on triage status
        // needs_review uses ⚠️ warning icon to highlight "by invitation" classes
        const displayValues = triage.status === "auto_kept"
          ? { emoji: "✓", bg: "#e8f5e9", border: "#4caf50" }
          : triage.status === "needs_review"
          ? { emoji: "⚠️", bg: "#fff3e0", border: "#ff9800" }
          : { emoji: "✗", bg: "#ffebee", border: "#f44336" };
        // Explicitly extract all fields as primitives to avoid $alias proxy leakage
        return {
          name: String(cls.name || ""),
          dayOfWeek: String(cls.dayOfWeek || ""),
          startTime: String(cls.startTime || ""),
          endTime: String(cls.endTime || ""),
          gradeMin: String(cls.gradeMin || ""),
          gradeMax: String(cls.gradeMax || ""),
          permissionGrades: String(cls.permissionGrades || ""),
          cost: Number(cls.cost) || 0,
          notes: String(cls.notes || ""),
          // Only auto_kept is pre-selected; needs_review requires conscious opt-in
          selected: triage.status === "auto_kept",
          triageStatus: triage.status,
          triageReason: triage.reason,
          triageEmoji: displayValues.emoji,
          triageBgColor: displayValues.bg,
          triageBorderColor: displayValues.border,
        };
      });
      // CRITICAL ORDER: Set data FIRST, then update guard
      // This ensures data is written before guard cell triggers re-run
      // On re-run, guard matches and returns early (idempotent)
      stagedClasses.set(newClasses);
      lastProcessedExtractionText.set(triggerText);
    });

    // Import selected classes - uses stagedClasses cell directly
    // Uses handler pattern to avoid closure issues
    const doImportAll = handler<
      unknown,
      { locIdx: Cell<number>; locs: Cell<Location[]>; classList: Cell<Class[]>; staged: Cell<StagedClass[]>; trigger: Cell<string>; text: Cell<string>; lastText: Cell<string> }
    >((_, { locIdx, locs, classList, staged, trigger, text, lastText }) => {
      const locationIndex = locIdx.get();
      const locationList = locs.get();
      if (locationIndex < 0 || locationIndex >= locationList.length) return;

      const location = locationList[locationIndex];
      const stagedList = staged.get();
      if (!stagedList || stagedList.length === 0) return;

      // Import only classes that are selected
      for (const cls of stagedList) {
        if (!cls || !cls.selected) continue; // Skip unselected classes

        classList.push({
          name: cls.name || "",
          description: cls.notes || "",
          location,
          timeSlots: [{
            day: (cls.dayOfWeek || "monday") as DayOfWeek,
            startTime: cls.startTime || "",
            endTime: cls.endTime || "",
          }],
          cost: cls.cost || 0,
          gradeMin: cls.gradeMin || "",
          gradeMax: cls.gradeMax || "",
          pinnedInSets: [],
          statuses: {
            registered: false,
            confirmed: false,
            waitlisted: false,
            paid: false,
            onCalendar: false,
          },
        });
      }

      // Clear import state
      trigger.set("");
      text.set("");
      staged.set([]);  // Clear staged classes
      lastText.set(""); // Allow re-extraction
    });

    // Toggle selection on a staged class
    // WORKAROUND: $checked doesn't work inside Cell.map() because OpaqueRef returns
    // values (not Cells), and CellController.setValue() silently ignores non-Cell values.
    // See: patterns/jkomoros/issues/ISSUE-checked-binding-cellmap-silent-failure.md
    const toggleStagedSelection = handler<
      unknown,
      { staged: Cell<StagedClass[]>; idx: number }
    >((_, { staged, idx }) => {
      const current = staged.get();
      if (idx < 0 || idx >= current.length) return;
      // Use .key().set() for atomic update instead of toSpliced (per superstition doc)
      staged.key(idx).key("selected").set(!current[idx].selected);
    });

    // Helper to toggle a status - takes classList explicitly to avoid closure issues
    const toggleStatus = (
      classList: Cell<Class[]>,
      cls: Class,
      statusKey: keyof StatusFlags
    ) => {
      const current = classList.get();
      const index = current.findIndex((el) => Cell.equals(cls, el));
      if (index >= 0) {
        // Use .key().set() for atomic update instead of toSpliced (per superstition doc)
        classList.key(index).key("statuses").key(statusKey).set(
          !current[index].statuses[statusKey]
        );
      }
    };

    // Track which class index is being edited (-1 = none)
    const editingClassIndex = cell<number>(-1);

    // Handler to update a class field
    const updateClassField = handler<
      { target: { value: string } },
      { classList: Cell<Class[]>; idx: number; field: keyof Class }
    >((event, { classList, idx, field }) => {
      const current = classList.get();
      if (idx < 0 || idx >= current.length) return;
      classList.key(idx).key(field).set(event.target.value);
    });

    // Handler to update class time slot
    const updateClassTimeSlot = handler<
      { target: { value: string } },
      { classList: Cell<Class[]>; classIdx: number; slotIdx: number; field: keyof TimeSlot }
    >((event, { classList, classIdx, slotIdx, field }) => {
      const current = classList.get();
      if (classIdx < 0 || classIdx >= current.length) return;
      const cls = current[classIdx];
      if (!cls.timeSlots || slotIdx >= cls.timeSlots.length) return;
      classList.key(classIdx).key("timeSlots").key(slotIdx).key(field).set(event.target.value);
    });

    // Handler to add a time slot to a class
    const addClassTimeSlot = handler<
      unknown,
      { classList: Cell<Class[]>; idx: number }
    >((_, { classList, idx }) => {
      const current = classList.get();
      if (idx < 0 || idx >= current.length) return;
      const cls = current[idx];
      const newSlots = [...(cls.timeSlots || []), { day: "monday" as DayOfWeek, startTime: "15:00", endTime: "16:00" }];
      classList.key(idx).key("timeSlots").set(newSlots);
    });

    // Handler to remove a time slot from a class
    const removeClassTimeSlot = handler<
      unknown,
      { classList: Cell<Class[]>; classIdx: number; slotIdx: number }
    >((_, { classList, classIdx, slotIdx }) => {
      const current = classList.get();
      if (classIdx < 0 || classIdx >= current.length) return;
      const cls = current[classIdx];
      if (!cls.timeSlots || slotIdx >= cls.timeSlots.length) return;
      const newSlots = cls.timeSlots.filter((_, i) => i !== slotIdx);
      classList.key(classIdx).key("timeSlots").set(newSlots);
    });

    // Handler to update class location
    const updateClassLocation = handler<
      { target: { value: string } },
      { classList: Cell<Class[]>; locs: Cell<Location[]>; classIdx: number }
    >((event, { classList, locs, classIdx }) => {
      const locIdx = parseInt(event.target.value, 10);
      const locList = locs.get();
      if (locIdx < 0 || locIdx >= locList.length) return;
      classList.key(classIdx).key("location").set(locList[locIdx]);
    });

    // Handler to update class cost
    const updateClassCost = handler<
      { target: { value: string } },
      { classList: Cell<Class[]>; idx: number }
    >((event, { classList, idx }) => {
      const cost = parseFloat(event.target.value) || 0;
      classList.key(idx).key("cost").set(cost);
    });

    // Handler to update child grade
    const setChildGrade = handler<
      { target: { value: string } },
      { childCell: Cell<ChildProfile> }
    >((event, state) => {
      const current = state.childCell.get();
      state.childCell.set({ ...current, grade: event.target.value as Grade });
    });

    // Handler to update child name
    const setChildName = handler<
      { target: { value: string } },
      { childCell: Cell<ChildProfile> }
    >((event, state) => {
      const current = state.childCell.get();
      state.childCell.set({ ...current, name: event.target.value });
    });

    // Handler to update child birth year
    const setChildBirthYear = handler<
      { target: { value: string } },
      { childCell: Cell<ChildProfile> }
    >((event, state) => {
      const current = state.childCell.get();
      const year = parseInt(event.target.value, 10);
      if (!isNaN(year)) {
        state.childCell.set({ ...current, birthYear: year });
      }
    });

    // Handler to update child birth month
    const setChildBirthMonth = handler<
      { target: { value: string } },
      { childCell: Cell<ChildProfile> }
    >((event, state) => {
      const current = state.childCell.get();
      const month = parseInt(event.target.value, 10);
      if (!isNaN(month) && month >= 1 && month <= 12) {
        state.childCell.set({ ...current, birthMonth: month });
      }
    });

    // =========================================================================
    // PHASE 5.5: FILE/IMAGE UPLOAD HANDLERS
    // =========================================================================

    // Handle unified file upload
    const handleFileUpload = handler<
      { detail: { files: FileData[] } },
      {
        uploadedFile: Cell<FileData | null>;
        processingStatus: Cell<ProcessingStatus>;
        extractedText: Cell<string>;
        extractionError: Cell<string | null>;
      }
    >(({ detail }: { detail: { files: FileData[] } }, { uploadedFile, processingStatus, extractedText, extractionError }: {
      uploadedFile: Cell<FileData | null>;
      processingStatus: Cell<ProcessingStatus>;
      extractedText: Cell<string>;
      extractionError: Cell<string | null>;
    }) => {
      if (!detail?.files || detail.files.length === 0) return;

      const file = detail.files[detail.files.length - 1];  // Take most recent
      const fileType = detectFileType(file);

      // Reset state
      extractionError.set(null);
      extractedText.set("");

      if (fileType === "text") {
        // Direct text decode
        try {
          const base64 = file.data.split(",")[1];
          const text = atob(base64);
          extractedText.set(text);
          processingStatus.set("complete");
          uploadedFile.set(file);
        } catch (e) {
          extractionError.set("Failed to read text file");
          processingStatus.set("error");
        }
      } else if (fileType === "image") {
        // Trigger OCR (handled by generateObject reactive flow)
        uploadedFile.set(file);
        processingStatus.set("processing");
      } else {
        extractionError.set("Unsupported file type. Use images or text files.");
        processingStatus.set("error");
      }
    });

    // Apply extracted text to import field
    const applyExtractedText = handler<
      unknown,
      {
        extractedText: Cell<string>;
        importText: Cell<string>;
        uploadedFile: Cell<FileData | null>;
        processingStatus: Cell<ProcessingStatus>;
        ocrText: string | null;
      }
    >((_, { extractedText, importText, uploadedFile, processingStatus, ocrText }) => {
      // Use extracted text from file, or OCR result from image
      const text = extractedText.get() || ocrText || "";
      if (text) {
        importText.set(text);
        // Reset upload state
        uploadedFile.set(null);
        extractedText.set("");
        processingStatus.set("idle");
      }
    });

    // Cancel upload and reset state
    const cancelUpload = handler<
      unknown,
      {
        uploadedFile: Cell<FileData | null>;
        extractedText: Cell<string>;
        processingStatus: Cell<ProcessingStatus>;
        extractionError: Cell<string | null>;
      }
    >((_, { uploadedFile, extractedText, processingStatus, extractionError }: {
      uploadedFile: Cell<FileData | null>;
      extractedText: Cell<string>;
      processingStatus: Cell<ProcessingStatus>;
      extractionError: Cell<string | null>;
    }) => {
      uploadedFile.set(null);
      extractedText.set("");
      processingStatus.set("idle");
      extractionError.set(null);
    });

    // Image OCR via generateObject - only fires when image is uploaded
    // CRITICAL: Use derive() for prompt, not computed() - derive handles generateObject reactivity correctly
    const { result: ocrResult, pending: ocrPending } = generateObject({
      model: "anthropic:claude-sonnet-4-5",
      prompt: derive(uploadedFile, (file: FileData | null) => {
        // Return empty string to prevent API call when no image
        if (!file || !file.data || detectFileType(file) !== "image") {
          return "";
        }

        return [
          { type: "image" as const, image: file.data },
          {
            type: "text" as const,
            text: `Extract all text from this image of a class schedule or activity list.
Preserve the structure and formatting. Include: class names, days, times, grade levels, costs, and any descriptions or notes.
Return all visible text.`
          }
        ];
      }),
      schema: {
        type: "object",
        properties: {
          extractedText: { type: "string", description: "All text extracted from the image" },
        },
      },
    });

    // Computed: should show preview step
    const showPreview = computed(() => {
      const status = uploadProcessingStatus.get();
      const ocrText = (ocrResult as any)?.extractedText;
      const isOcrPending = ocrPending;
      return status === "complete" || (!isOcrPending && !!ocrText);
    });

    // Computed: text to show in preview (either from text file or OCR)
    const previewText = computed(() => {
      const textFromFile = uploadExtractedText.get();
      const textFromOcr = (ocrResult as any)?.extractedText || "";
      return textFromFile || textFromOcr;
    });

    // =========================================================================
    // STAGED CLASSES DISPLAY VALUES (single-pass computed for performance)
    // =========================================================================

    // Consolidated computed: all staged class stats in one pass (instead of 4 filters)
    const stageCounts = computed(() => {
      const list = stagedClasses.get();
      if (!list || list.length === 0) {
        return { hasStaged: false, selected: 0, kept: 0, needsReview: 0, discarded: 0 };
      }
      let selected = 0, kept = 0, needsReview = 0, discarded = 0;
      for (const s of list) {
        if (s.selected) selected++;
        if (s.triageStatus === "auto_kept") kept++;
        else if (s.triageStatus === "needs_review") needsReview++;
        else discarded++;
      }
      return { hasStaged: true, selected, kept, needsReview, discarded };
    });

    // Computed accessors for backwards compatibility with existing UI code
    const hasStaged = computed(() => stageCounts.hasStaged);
    const selectedCount = computed(() => stageCounts.selected);
    const triageCounts = computed(() => ({
      kept: stageCounts.kept,
      needsReview: stageCounts.needsReview,
      discarded: stageCounts.discarded,
    }));

    // Import button state - pre-computed to avoid reactive context issues in JSX
    const importButtonDisabled = computed(() => {
      const selCount = stagedClasses.get().filter(s => s.selected).length;
      const locIdx = importLocationIndex.get();
      return selCount === 0 || locIdx < 0;
    });
    const importButtonText = computed(() => {
      const locIdx = importLocationIndex.get();
      const selCount = stagedClasses.get().filter(s => s.selected).length;
      return locIdx < 0 ? "Select a location to import" : `Import ${selCount} Selected Classes`;
    });

    // =========================================================================
    // PHASE 5: PINNED SETS
    // =========================================================================

    // Helper: display set name (shows "(default)" for empty string)
    const displaySetName = (name: string) => name === "" ? "(default)" : name;

    // Guard cell to ensure default set initialization only runs once
    // This prevents reactive thrashing from non-idempotent writes
    const defaultSetInitialized = cell<boolean>(false);

    // Ensure default set exists and is active on first load
    computed(() => {
      // Skip if already initialized - this makes the computed idempotent
      if (defaultSetInitialized.get()) return;

      const names = pinnedSetNames.get();
      // Add default set if missing
      if (!names.includes("")) {
        pinnedSetNames.set([...names, ""]);
      }
      // Set active to default if not set
      const active = activeSetName.get();
      if (active === undefined || active === null) {
        activeSetName.set("");
      }

      // Mark as initialized AFTER writes to avoid re-triggering
      defaultSetInitialized.set(true);
    });

    // Computed: display name for active set (pre-computed to avoid === in derive)
    const displayActiveSetName = computed(() => {
      const name = activeSetName.get();
      return name === "" ? "(default)" : name;
    });

    // Computed: classes pinned to the active set
    const pinnedClasses = computed(() => {
      const setName = activeSetName.get();
      const classList = classes.get();
      return classList.filter(cls => {
        const rawPins = cls.pinnedInSets;
        const pinArray: string[] = Array.isArray(rawPins) ? rawPins as string[] : [];
        return pinArray.indexOf(setName) >= 0;
      });
    });

    // Phase 6: Computed conflicts in active pinned set
    const pinnedSetConflicts = computed(() => {
      if (!pinnedClasses || pinnedClasses.length < 2) return [];

      const conflicts: TimeConflict[] = [];
      for (let i = 0; i < pinnedClasses.length; i++) {
        for (let j = i + 1; j < pinnedClasses.length; j++) {
          const class1 = pinnedClasses[i];
          const class2 = pinnedClasses[j];

          for (const slot1 of class1.timeSlots || []) {
            for (const slot2 of class2.timeSlots || []) {
              const result = timeSlotsOverlap(slot1, slot2);
              if (result.overlaps) {
                conflicts.push({
                  class1,
                  class2,
                  day: slot1.day,
                  overlapStart: result.overlapStart || "",
                  overlapEnd: result.overlapEnd || "",
                });
              }
            }
          }
        }
      }
      return conflicts;
    });

    // ============================================================================
    // PRECOMPUTED SCHEDULE DATA (fix for expensive computation inside .map() JSX)
    // This runs ONCE when pinnedClasses changes, instead of N times per charm instance
    // ============================================================================
    const scheduleData = computed(() => {
      const pinned = pinnedClasses as Class[];
      if (!pinned || pinned.length === 0) {
        return null;
      }

      // First pass: collect all slots with basic data
      const byDay: Record<DayOfWeek, ScheduleSlotData[]> = {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      };

      // Collect slots with timing info
      pinned.forEach((cls) => {
        const color = getLocationColor(cls.location?.name || "");
        for (const slot of cls.timeSlots || []) {
          const startMins = parseTimeToMinutes(slot.startTime);
          const endMins = parseTimeToMinutes(slot.endTime);
          const startOffsetMins = startMins - SCHEDULE_START_HOUR * 60;
          const durationMins = endMins - startMins;

          byDay[slot.day].push({
            cls,
            slot,
            color,
            top: startMins >= 0 ? (startOffsetMins / 60) * SCHEDULE_HOUR_HEIGHT : 0,
            height: startMins >= 0 && endMins >= 0
              ? (durationMins / 60) * SCHEDULE_HOUR_HEIGHT
              : SCHEDULE_HOUR_HEIGHT,
            column: 0,
            totalColumns: 1,
          });
        }
      });

      // Second pass: calculate overlaps for each day
      for (const day of SCHEDULE_DAYS) {
        const slots = byDay[day];
        if (slots.length < 2) continue;

        // Sort by start time
        slots.sort((a, b) => parseTimeToMinutes(a.slot.startTime) - parseTimeToMinutes(b.slot.startTime));

        // Find overlapping groups using a sweep line algorithm
        // For each slot, find all slots it overlaps with
        for (let i = 0; i < slots.length; i++) {
          const slotA = slots[i];
          const startA = parseTimeToMinutes(slotA.slot.startTime);
          const endA = parseTimeToMinutes(slotA.slot.endTime);

          // Find all slots that overlap with slotA
          const overlappingIndices: number[] = [i];
          for (let j = 0; j < slots.length; j++) {
            if (i === j) continue;
            const slotB = slots[j];
            const startB = parseTimeToMinutes(slotB.slot.startTime);
            const endB = parseTimeToMinutes(slotB.slot.endTime);

            // Check if they overlap
            if (!(endA <= startB || endB <= startA)) {
              overlappingIndices.push(j);
            }
          }

          // If this slot overlaps with others, assign columns
          if (overlappingIndices.length > 1) {
            // Sort indices to ensure consistent column assignment
            overlappingIndices.sort((a, b) => a - b);
            const totalCols = overlappingIndices.length;

            // Assign column based on position in overlap group
            for (let col = 0; col < overlappingIndices.length; col++) {
              const idx = overlappingIndices[col];
              // Only update if this gives more columns (handles multi-way overlaps)
              if (totalCols > slots[idx].totalColumns) {
                slots[idx].column = col;
                slots[idx].totalColumns = totalCols;
              }
            }
          }
        }
      }

      return byDay;
    });

    // Handler to switch active set
    const setActiveSet = handler<
      { target: { value: string } },
      { activeCell: Cell<string> }
    >((event, state) => {
      state.activeCell.set(event.target.value);
    });

    // Handler to toggle pin on a class
    const togglePinClass = handler<
      unknown,
      { classList: Cell<Class[]>; activeSet: Cell<string>; idx: number }
    >((_, { classList, activeSet, idx }) => {
      const current = classList.get();
      const setName = activeSet.get();
      if (idx < 0 || idx >= current.length) return;

      const cls = current[idx];
      const currentPins: string[] = Array.isArray(cls.pinnedInSets) ? cls.pinnedInSets : [];
      const isPinned = currentPins.includes(setName);
      const newPins = isPinned
        ? currentPins.filter((s: string) => s !== setName)
        : [...currentPins, setName];
      // Use .key().set() for atomic update instead of toSpliced (per superstition doc)
      classList.key(idx).key("pinnedInSets").set(newPins);
    });

    // =========================================================================
    // CALENDAR EXPORT - Trusted UI gate for external system writes
    // =========================================================================

    // Calendar export state - pending operation and result
    const pendingCalendarExport = cell<PendingCalendarExport>(null);
    const calendarExportResult = cell<CalendarExportResult>(null);
    const calendarExportProcessing = cell<boolean>(false);
    const calendarExportProgress = cell<CalendarExportProgress>(null);

    // Pre-computed button state to avoid nested derive() calls
    const exportButtonDisabled = derive(
      { processing: calendarExportProcessing, pending: pendingCalendarExport },
      ({ processing, pending }) => processing || !pending?.selectedTarget
    );

    // Google auth for calendar export - uses wish() to find existing google-auth charm
    // Requires calendarWrite scope for creating events
    const googleAuthManager = createGoogleAuth({
      requiredScopes: ["calendarWrite"],
    });

    /**
     * Result of converting classes to events, including any skipped items.
     */
    interface ConversionResult<T> {
      events: T[];
      skipped: { className: string; reason: string }[];
    }

    /**
     * Converts pinned classes to ICalEvent array for export (ICS download).
     * Creates one event per time slot with weekly recurrence.
     *
     * Edge cases handled (with reporting):
     * - Classes without name: skipped
     * - Classes without time slots: skipped
     * - Time slots starting after semester end: skipped
     */
    function classesToICalEvents(
      classList: readonly Class[],
      semester: SemesterDates
    ): ConversionResult<ICalEvent> {
      const events: ICalEvent[] = [];
      const skipped: { className: string; reason: string }[] = [];

      for (const cls of classList) {
        if (!cls || !cls.name) {
          skipped.push({ className: "(unknown)", reason: "Invalid or missing class data" });
          continue;
        }

        if (!cls.timeSlots || cls.timeSlots.length === 0) {
          skipped.push({ className: cls.name, reason: "No time slots defined" });
          continue;
        }

        for (const slot of cls.timeSlots) {
          // Find the first occurrence of this weekday within the semester
          const firstDate = getFirstOccurrenceDate(
            semester.startDate,
            slot.day as ICalDayOfWeek
          );

          // Skip if first occurrence is after semester end
          if (firstDate > semester.endDate) {
            skipped.push({
              className: cls.name,
              reason: `${slot.day} slot starts after semester ends`,
            });
            continue;
          }

          // Use deterministic UID based on event properties
          const event: ICalEvent = {
            uid: generateEventUID(cls.name, slot.day, slot.startTime, firstDate),
            summary: cls.name,
            location: cls.location?.name
              ? `${cls.location.name}${cls.location.address ? ` - ${cls.location.address}` : ""}`
              : undefined,
            description: cls.description || undefined,
            startDate: firstDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            rrule: {
              freq: "WEEKLY",
              byday: dayToICalDay(slot.day as ICalDayOfWeek),
              until: semester.endDate,
            },
          };

          events.push(event);
        }
      }

      return { events, skipped };
    }

    /**
     * Converts pinned classes to CalendarOutboxEvent array for apple-sync CLI.
     * Creates one event per time slot with weekly recurrence.
     */
    function classesToOutboxEvents(
      classList: readonly Class[],
      semester: SemesterDates,
      targetCalendar: string
    ): ConversionResult<CalendarOutboxEvent> {
      const events: CalendarOutboxEvent[] = [];
      const skipped: { className: string; reason: string }[] = [];

      for (const cls of classList) {
        if (!cls || !cls.name) {
          skipped.push({ className: "(unknown)", reason: "Invalid or missing class data" });
          continue;
        }

        if (!cls.timeSlots || cls.timeSlots.length === 0) {
          skipped.push({ className: cls.name, reason: "No time slots defined" });
          continue;
        }

        for (const slot of cls.timeSlots) {
          // Find the first occurrence of this weekday within the semester
          const firstDate = getFirstOccurrenceDate(
            semester.startDate,
            slot.day as ICalDayOfWeek
          );

          // Skip if first occurrence is after semester end
          if (firstDate > semester.endDate) {
            skipped.push({
              className: cls.name,
              reason: `${slot.day} slot starts after semester ends`,
            });
            continue;
          }

          // Use deterministic UID based on event properties
          const event: CalendarOutboxEvent = {
            id: generateEventUID(cls.name, slot.day, slot.startTime, firstDate),
            title: cls.name,
            calendarName: targetCalendar,
            startDate: firstDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            location: cls.location?.name
              ? `${cls.location.name}${cls.location.address ? ` - ${cls.location.address}` : ""}`
              : undefined,
            notes: cls.description || undefined,
            recurrence: {
              frequency: "WEEKLY",
              byDay: dayToICalDay(slot.day as ICalDayOfWeek),
              until: semester.endDate,
            },
          };

          events.push(event);
        }
      }

      return { events, skipped };
    }

    /**
     * Convert classes to ExportableEvent format for unified export.
     */
    function classesToExportableEvents(
      classList: readonly Class[],
    ): ConversionResult<ExportableEvent> {
      const events: ExportableEvent[] = [];
      const skipped: { className: string; reason: string }[] = [];

      for (const cls of classList) {
        if (!cls || !cls.name) {
          skipped.push({ className: "(unknown)", reason: "Invalid or missing class data" });
          continue;
        }

        if (!cls.timeSlots || cls.timeSlots.length === 0) {
          skipped.push({ className: cls.name, reason: "No time slots defined" });
          continue;
        }

        // Create one ExportableEvent per class (time slots embedded)
        const event: ExportableEvent = {
          id: `class-${cls.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          title: cls.name,
          location: cls.location?.name,
          description: cls.description || undefined,
          timeSlots: cls.timeSlots.map((slot) => ({
            day: slot.day,
            startTime: slot.startTime,
            endTime: slot.endTime,
          })),
        };

        events.push(event);
      }

      return { events, skipped };
    }

    /**
     * Prepares calendar export - shows confirmation dialog.
     * This is the "prepare" phase of the two-phase commit pattern.
     */
    const prepareCalendarExport = handler<
      unknown,
      {
        pinnedClasses: Cell<Class[]>;
        semesterDates: Cell<SemesterDates>;
        child: Cell<ChildProfile>;
        activeSetName: Cell<string>;
        calendarName: Cell<string>;
        pendingExport: Cell<PendingCalendarExport>;
        outbox: Cell<CalendarOutbox>;
      }
    >((_, { pinnedClasses, semesterDates, child, activeSetName, calendarName: calendarNameCell, pendingExport, outbox }) => {
      // Get values from cells (no deep cloning needed - we only read, not mutate)
      const classList = pinnedClasses.get() || [];
      const semester = semesterDates.get() || { startDate: "", endDate: "" };
      const childProfile = child.get() || { name: "Child", grade: "K", birthYear: 2020, birthMonth: 1 };
      const setName = activeSetName.get() || "default";
      const targetCalendar = calendarNameCell.get() || "Calendar";

      if (!classList || classList.length === 0) return;
      if (!semester.startDate || !semester.endDate) return;

      // Generate ICS content (for download fallback)
      const icalResult = classesToICalEvents(classList, semester);
      const icsCalendarName = `${childProfile.name || "Child"}'s ${setName || "default"} Schedule`;
      const icsContent = generateICS(icalResult.events, {
        calendarName: icsCalendarName,
        prodId: "-//CommonTools//Extracurricular Selector//EN",
      });

      // Generate outbox events (for apple-sync CLI)
      const outboxResult = classesToOutboxEvents(classList, semester, targetCalendar);

      // Check for duplicates: events already in outbox with same ID
      const currentOutbox = outbox.get() || { entries: [], lastUpdated: "", version: "1.0" };
      const existingUIDs = new Set(
        (currentOutbox.entries || []).flatMap(entry =>
          (entry.events || []).map(e => e.id)
        )
      );
      const newEvents = outboxResult.events.filter(e => !existingUIDs.has(e.id));
      const duplicateCount = outboxResult.events.length - newEvents.length;

      // Combine skipped items from both conversions (deduplicate)
      const allSkipped = [...icalResult.skipped];
      // Only add outbox skipped if not already in list
      for (const skip of outboxResult.skipped) {
        if (!allSkipped.some(s => s.className === skip.className && s.reason === skip.reason)) {
          allSkipped.push(skip);
        }
      }

      // Generate exportable events for Google Calendar
      const exportableResult = classesToExportableEvents(classList);

      // Set pending operation for confirmation dialog
      pendingExport.set({
        classes: classList,
        semester,
        icsContent,
        childName: childProfile.name || "Child",
        setName: setName || "default",
        eventCount: newEvents.length,
        calendarName: targetCalendar,
        outboxEvents: newEvents, // Only non-duplicate events
        skippedItems: allSkipped,
        duplicateCount,
        selectedTarget: null, // User picks in dialog
        exportableEvents: exportableResult.events,
      });
    });

    /**
     * Cancels the pending calendar export operation.
     */
    const cancelCalendarExport = handler<
      unknown,
      { pendingExport: Cell<PendingCalendarExport> }
    >((_, { pendingExport }) => {
      pendingExport.set(null);
    });

    /**
     * Select export target in the dialog.
     */
    const selectExportTarget = handler<
      unknown,
      { pendingExport: Cell<PendingCalendarExport>; target: ExportTarget }
    >((_, { pendingExport, target }) => {
      const pending = pendingExport.get();
      if (!pending) return;
      pendingExport.set({ ...pending, selectedTarget: target });
    });

    /**
     * Confirms and executes the export based on selected target.
     * - Google: Direct API with batch operations and progress tracking
     * - Apple: Add to outbox for apple-sync CLI + download ICS backup
     * - ICS: Just download the ICS file
     *
     * This is the "confirm" phase of the two-phase commit pattern.
     */
    const confirmCalendarExport = handler<
      unknown,
      {
        pendingExport: Cell<PendingCalendarExport>;
        processing: Cell<boolean>;
        progress: Cell<CalendarExportProgress>;
        result: Cell<CalendarExportResult>;
        classList: Cell<Class[]>;
        outbox: Cell<CalendarOutbox>;
        auth: Cell<GoogleAuthType>;
      }
    >(async (_, { pendingExport, processing, progress, result, classList, outbox, auth }) => {
      const pending = pendingExport.get();
      if (!pending || !pending.selectedTarget) return;

      processing.set(true);
      progress.set(null);

      try {
        const now = new Date().toISOString();
        const target = pending.selectedTarget;
        let exportResult: CalendarExportResult;

        if (target === "google") {
          // Verify we have auth before proceeding
          const authData = auth.get();
          if (!authData?.token) {
            throw new Error("Google authentication required. Please sign in first.");
          }

          // Google Calendar: Use batch API with progress tracking
          const googleResult = await exportToGoogle(
            auth,
            pending.exportableEvents,
            {
              calendarName: "primary", // Always use primary calendar for Google
              dateRange: pending.semester,
              exportTitle: `${pending.childName}'s ${pending.setName} Schedule`,
              sourcePattern: {
                name: "Extracurricular Selector",
                path: "patterns/jkomoros/extracurricular.tsx",
              },
            },
            (p) => progress.set(p), // Progress callback
          );

          exportResult = {
            success: googleResult.success,
            message: googleResult.message,
            timestamp: now,
            exportedCount: googleResult.exportedCount,
            target: "google",
            failedCount: googleResult.failedCount,
          };
        } else if (target === "apple") {
          // Apple Calendar: Add to outbox + download ICS backup
          const outboxEntry: CalendarOutboxEntry = {
            id: `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            events: pending.outboxEvents,
            confirmation: {
              timestamp: now,
              dialogContent: {
                displayedTitle: `${pending.childName}'s ${pending.setName} Schedule`,
                displayedCalendar: pending.calendarName,
                displayedTimeRange: `${pending.semester.startDate} to ${pending.semester.endDate}`,
                displayedEventCount: pending.eventCount,
                displayedClasses: pending.classes.map((c) => c.name),
                warningMessage: `This will create ${pending.eventCount} recurring events in your "${pending.calendarName}" calendar.`,
              },
              sourcePattern: {
                name: "Extracurricular Selector",
                path: "patterns/jkomoros/extracurricular.tsx",
              },
            },
            execution: {
              status: "pending",
            },
            createdAt: now,
          };

          // Add to outbox
          const currentOutbox = outbox.get() || { entries: [], lastUpdated: "", version: "1.0" };
          const updatedOutbox: CalendarOutbox = {
            entries: [...(currentOutbox.entries || []), outboxEntry],
            lastUpdated: now,
            version: "1.0",
          };
          outbox.set(updatedOutbox);

          // Prepare ICS file for download via ct-file-download component
          const dateStr = now.split("T")[0];
          const childSlug = sanitizeFilename(pending.childName).toLowerCase();
          const setSlug = sanitizeFilename(pending.setName).toLowerCase();
          const filename = `${childSlug}-${setSlug}-schedule-${dateStr}.ics`;

          exportResult = {
            success: true,
            message: `Added ${pending.eventCount} events to outbox for "${pending.calendarName}" calendar. Click below to download backup ICS.`,
            timestamp: now,
            exportedCount: pending.eventCount,
            target: "apple",
            addedToOutbox: true,
            icsContent: pending.icsContent,
            icsFilename: filename,
          };
        } else {
          // ICS: Prepare file for download via ct-file-download component
          const dateStr = now.split("T")[0];
          const childSlug = sanitizeFilename(pending.childName).toLowerCase();
          const setSlug = sanitizeFilename(pending.setName).toLowerCase();
          const filename = `${childSlug}-${setSlug}-schedule-${dateStr}.ics`;

          exportResult = {
            success: true,
            message: `Ready to download ${filename}`,
            timestamp: now,
            exportedCount: pending.eventCount,
            target: "ics",
            icsContent: pending.icsContent,
            icsFilename: filename,
          };
        }

        // Mark classes as exported to calendar (for any successful export)
        if (exportResult.success) {
          const currentClasses = classList.get();
          for (let i = 0; i < currentClasses.length; i++) {
            const cls = currentClasses[i];
            const wasExported = pending.classes.some(
              (exportedCls) => Cell.equals(cls, exportedCls)
            );
            if (wasExported && !cls.statuses?.onCalendar) {
              classList.key(i).key("statuses").key("onCalendar").set(true);
            }
          }
        }

        result.set(exportResult);

        // Auto-dismiss success toast after 5 seconds
        if (exportResult.success) {
          setTimeout(() => {
            const currentResult = result.get();
            if (currentResult?.timestamp === now && currentResult?.success) {
              result.set(null);
            }
          }, 5000);
        }

        pendingExport.set(null);
      } catch (error) {
        result.set({
          success: false,
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
          exportedCount: 0,
        });
      } finally {
        processing.set(false);
        progress.set(null);
      }
    });

    /**
     * Dismisses the export result notification.
     */
    const dismissExportResult = handler<
      unknown,
      { result: Cell<CalendarExportResult> }
    >((_, { result }) => {
      result.set(null);
    });

    // Computed: can export (has pinned classes and semester dates)
    const canExportCalendar = computed(() => {
      const pinned = pinnedClasses as Class[];
      const semester = semesterDates.get();
      return (
        pinned &&
        pinned.length > 0 &&
        semester.startDate &&
        semester.endDate &&
        semester.startDate <= semester.endDate
      );
    });

    // Handlers for semester date inputs
    const setSemesterStart = handler<
      { detail: { value: string } },
      { dates: Cell<SemesterDates> }
    >((event, { dates }) => {
      const current = dates.get();
      dates.set({ ...current, startDate: event.detail.value });
    });

    const setSemesterEnd = handler<
      { detail: { value: string } },
      { dates: Cell<SemesterDates> }
    >((event, { dates }) => {
      const current = dates.get();
      dates.set({ ...current, endDate: event.detail.value });
    });

    // Handler for calendar name input
    const setCalendarName = handler<
      { detail: { value: string } },
      { name: Cell<string> }
    >((event, { name }) => {
      name.set(event.detail.value);
    });

    return {
      [NAME]: "Extracurricular Selector",
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "800px", margin: "0 auto" }}>
          <h1 style={{ marginBottom: "1rem" }}>Extracurricular Selector</h1>

          {/* Child Profile Section */}
          <div style={{ marginBottom: "2rem", padding: "1rem", background: "#e8f5e9", borderRadius: "4px" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Child Profile</h2>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>Name:</label>
                <input
                  type="text"
                  style={{ padding: "0.5rem", width: "200px" }}
                  value={(child as any).name || ""}
                  onChange={setChildName({ childCell: child })}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>Grade:</label>
                <select
                  style={{ padding: "0.5rem" }}
                  value={(child as any).grade || "K"}
                  onChange={setChildGrade({ childCell: child })}
                >
                  <option value="TK">TK</option>
                  <option value="K">K</option>
                  <option value="1">1st</option>
                  <option value="2">2nd</option>
                  <option value="3">3rd</option>
                  <option value="4">4th</option>
                  <option value="5">5th</option>
                  <option value="6">6th</option>
                  <option value="7">7th</option>
                  <option value="8">8th</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>Birth Year:</label>
                <input
                  type="number"
                  style={{ padding: "0.5rem", width: "80px" }}
                  min="2005"
                  max="2025"
                  value={(child as any).birthYear || 2015}
                  onChange={setChildBirthYear({ childCell: child })}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>Birth Month:</label>
                <select
                  style={{ padding: "0.5rem" }}
                  value={(child as any).birthMonth || 1}
                  onChange={setChildBirthMonth({ childCell: child })}
                >
                  <option value="1">January</option>
                  <option value="2">February</option>
                  <option value="3">March</option>
                  <option value="4">April</option>
                  <option value="5">May</option>
                  <option value="6">June</option>
                  <option value="7">July</option>
                  <option value="8">August</option>
                  <option value="9">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>
            </div>
            <p style={{ marginTop: "0.5rem", fontSize: "0.85em", color: "#555" }}>
              Classes will be auto-triaged based on grade and age eligibility
            </p>
          </div>

          {/* Schedule Options Section - Phase 5 */}
          <div style={{ marginBottom: "2rem", padding: "1rem", background: "#e3f2fd", borderRadius: "4px" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Schedule Options</h2>
            <p style={{ fontSize: "0.85em", color: "#555", marginBottom: "0.5rem" }}>
              Create different schedule combinations to compare
            </p>

            {/* Set selector and add new set */}
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "1rem", flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>Active Option:</label>
                <select
                  style={{ padding: "0.5rem", minWidth: "150px" }}
                  value={(activeSetName as any) || ""}
                  onChange={setActiveSet({ activeCell: activeSetName })}
                >
                  {pinnedSetNames.map((name) => (
                    <option value={name}>{displaySetName(name)}</option>
                  ))}
                </select>
              </div>
              <div>
                <ct-message-input
                  placeholder="New option name..."
                  onct-send={(e: { detail: { message: string } }) => {
                    const name = e.detail?.message?.trim();
                    if (name) {
                      const current = pinnedSetNames.get();
                      if (!current.includes(name)) {
                        pinnedSetNames.push(name);
                        activeSetName.set(name);
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Pinned classes in active set */}
            {derive({ pinnedClasses, displayActiveSetName }, ({ pinnedClasses: pinned, displayActiveSetName: displayName }) => {
              const list = pinned as Class[];
              if (!list || list.length === 0) {
                return (
                  <p style={{ color: "#666", fontStyle: "italic" }}>
                    No classes in "{displayName}". Use the 📌 button below to add classes to this option.
                  </p>
                );
              }
              return (
                <div>
                  <h4 style={{ marginBottom: "0.25rem" }}>Classes in "{displayName}":</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {list.map((cls: Class) => (
                      <div
                        style={{
                          padding: "0.5rem 0.75rem",
                          background: "#fff",
                          border: "1px solid #1976d2",
                          borderRadius: "4px",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span>{cls.name}</span>
                        <span style={{ fontSize: "0.8em", color: "#666" }}>@ {cls.location.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Phase 6: Conflict warnings */}
            {derive(pinnedSetConflicts, (conflicts: TimeConflict[]) => {
              if (!conflicts || conflicts.length === 0) return null;
              return (
                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#ffebee", border: "1px solid #ef5350", borderRadius: "4px" }}>
                  <h4 style={{ color: "#c62828", marginBottom: "0.5rem" }}>
                    Schedule Conflicts ({conflicts.length})
                  </h4>
                  {conflicts.map((conflict: TimeConflict) => (
                    <div
                      style={{
                        padding: "0.5rem",
                        background: "#fff",
                        borderRadius: "4px",
                        marginBottom: "0.25rem",
                        fontSize: "0.9em",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>{conflict.class1.name}</span>
                      <span style={{ color: "#666" }}> conflicts with </span>
                      <span style={{ fontWeight: "bold" }}>{conflict.class2.name}</span>
                      <span style={{ color: "#888", marginLeft: "0.5rem" }}>
                        ({conflict.day} {conflict.overlapStart}-{conflict.overlapEnd})
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Weekly Schedule View - uses precomputed scheduleData */}
            {derive(scheduleData, (data: Record<DayOfWeek, ScheduleSlotData[]> | null) => {
              if (!data) return null;

              const totalHeight = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * SCHEDULE_HOUR_HEIGHT;
              const hourLabels: Array<{ hour: number; label: string }> = [];
              for (let h = SCHEDULE_START_HOUR; h <= SCHEDULE_END_HOUR; h++) {
                const label = h > 12 ? `${h - 12}pm` : h === 12 ? "12pm" : `${h}am`;
                hourLabels.push({ hour: h, label });
              }

              return (
                <div style={{ marginTop: "1rem" }}>
                  <h4 style={{ marginBottom: "0.5rem" }}>Weekly Schedule</h4>
                  <div style={{ display: "flex", border: "1px solid #e0e0e0", borderRadius: "4px", overflow: "hidden" }}>
                    {/* Time labels column */}
                    <div style={{ width: "50px", flexShrink: 0, borderRight: "1px solid #e0e0e0", background: "#fafafa" }}>
                      <div style={{ height: "30px", borderBottom: "1px solid #e0e0e0" }} />
                      <div style={{ position: "relative", height: `${totalHeight}px` }}>
                        {hourLabels.map(({ hour, label }) => (
                          <div
                            style={{
                              position: "absolute",
                              top: `${(hour - SCHEDULE_START_HOUR) * SCHEDULE_HOUR_HEIGHT - 8}px`,
                              right: "4px",
                              fontSize: "0.7em",
                              color: "#666",
                            }}
                          >
                            {label}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Day columns - now uses precomputed data, no filtering or indexOf */}
                    {SCHEDULE_DAYS.map((day) => {
                      // Get precomputed slots for this day (O(1) lookup)
                      const daySlots = data[day] || [];

                      return (
                        <div style={{ flex: 1, borderRight: "1px solid #e0e0e0", minWidth: "80px" }}>
                          {/* Day header */}
                          <div
                            style={{
                              height: "30px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderBottom: "1px solid #e0e0e0",
                              background: "#fafafa",
                              fontSize: "0.8em",
                              fontWeight: "bold",
                              textTransform: "capitalize",
                            }}
                          >
                            {day.slice(0, 3)}
                          </div>

                          {/* Time grid */}
                          <div style={{ position: "relative", height: `${totalHeight}px`, background: "#fff" }}>
                            {/* Hour lines */}
                            {hourLabels.slice(0, -1).map(({ hour }) => (
                              <div
                                style={{
                                  position: "absolute",
                                  top: `${(hour - SCHEDULE_START_HOUR) * SCHEDULE_HOUR_HEIGHT}px`,
                                  left: 0,
                                  right: 0,
                                  borderTop: "1px dashed #eee",
                                }}
                              />
                            ))}

                            {/* Classes for this day - using precomputed positions, colors, and overlap columns */}
                            {daySlots.map(({ cls, slot, color, top, height, column, totalColumns }) => {
                              // Calculate horizontal position based on overlap columns
                              const widthPercent = 100 / totalColumns;
                              const leftPercent = column * widthPercent;
                              return (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: `${top}px`,
                                    left: `calc(${leftPercent}% + 2px)`,
                                    width: `calc(${widthPercent}% - 4px)`,
                                    height: `${Math.max(height - 2, 20)}px`,
                                    background: color.bg,
                                    border: `1px solid ${color.border}`,
                                    borderRadius: "3px",
                                    padding: "2px 4px",
                                    fontSize: "0.7em",
                                    overflow: "hidden",
                                    cursor: "default",
                                    boxSizing: "border-box",
                                  }}
                                  title={`${cls.name}\n${slot.startTime}-${slot.endTime}\n@ ${cls.location.name}`}
                                >
                                  <div style={{ fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {cls.name}
                                  </div>
                                  {height > 35 && (
                                    <div style={{ fontSize: "0.9em", color: "#666" }}>
                                      {slot.startTime}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Export to Calendar Section */}
            <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#fff8e1", border: "1px solid #ffc107", borderRadius: "4px" }}>
              <h4 style={{ marginBottom: "0.5rem", color: "#f57f17", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>📅</span> Export to Calendar
              </h4>
              <p style={{ fontSize: "0.85em", color: "#666", marginBottom: "0.75rem" }}>
                Export pinned classes as recurring calendar events. Set semester dates first.
              </p>

              {/* Semester date inputs */}
              <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8em", marginBottom: "0.25rem" }}>Semester Start:</label>
                  <ct-input
                    type="date"
                    style={{ padding: "0.4rem", borderRadius: "4px", border: "1px solid #ccc" }}
                    value={derive(semesterDates, (s: SemesterDates) => s.startDate || "")}
                    onct-change={setSemesterStart({ dates: semesterDates })}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8em", marginBottom: "0.25rem" }}>Semester End:</label>
                  <ct-input
                    type="date"
                    style={{ padding: "0.4rem", borderRadius: "4px", border: "1px solid #ccc" }}
                    value={derive(semesterDates, (s: SemesterDates) => s.endDate || "")}
                    onct-change={setSemesterEnd({ dates: semesterDates })}
                  />
                </div>
              </div>

              {/* Calendar name input */}
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.8em", marginBottom: "0.25rem" }}>
                  Target Calendar Name:
                </label>
                <ct-input
                  type="text"
                  placeholder="e.g., Kids Activities, Family"
                  style={{ padding: "0.4rem", borderRadius: "4px", border: "1px solid #ccc", width: "250px" }}
                  $value={calendarName}
                />
                <p style={{ fontSize: "0.7em", color: "#888", marginTop: "0.25rem" }}>
                  Name of the calendar to add events to (must exist in Apple Calendar)
                </p>
              </div>

              {/* Export button */}
              <ct-button
                variant="primary"
                disabled={derive(canExportCalendar, (can) => !can)}
                style={{
                  opacity: derive(canExportCalendar, (can) => can ? 1 : 0.5),
                }}
                onClick={prepareCalendarExport({
                  pinnedClasses: pinnedClasses as unknown as Cell<Class[]>,
                  semesterDates,
                  child,
                  activeSetName,
                  calendarName,
                  pendingExport: pendingCalendarExport,
                  outbox: calendarOutbox,
                })}
              >
                Export to iCal (.ics)
              </ct-button>

              {/* Validation message */}
              {ifElse(
                derive(canExportCalendar, (can) => !can),
                <p style={{ fontSize: "0.75em", color: "#999", marginTop: "0.5rem" }}>
                  {derive({ pinned: pinnedClasses, semester: semesterDates }, ({ pinned, semester }) => {
                    const p = pinned as unknown as Class[];
                    const s = semester as unknown as SemesterDates;
                    if (!p || p.length === 0) return "Pin some classes to export";
                    if (!s.startDate) return "Set semester start date";
                    if (!s.endDate) return "Set semester end date";
                    if (s.startDate > s.endDate) return "End date must be after start date";
                    return "";
                  })}
                </p>,
                null
              )}
            </div>
          </div>

          {/* Calendar Export Result Toast */}
          {ifElse(
            derive(calendarExportResult, (r: CalendarExportResult) => r !== null),
            <div
              style={{
                position: "fixed",
                bottom: "20px",
                right: "20px",
                padding: "1rem 1.5rem",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 1000,
                background: derive(calendarExportResult, (r: CalendarExportResult) =>
                  r?.success ? "#d1fae5" : "#fee2e2"
                ),
                border: derive(calendarExportResult, (r: CalendarExportResult) =>
                  r?.success ? "1px solid #10b981" : "1px solid #ef4444"
                ),
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{
                  fontWeight: "bold",
                  color: derive(calendarExportResult, (r: CalendarExportResult) =>
                    r?.success ? "#065f46" : "#991b1b"
                  ),
                }}>
                  {derive(calendarExportResult, (r: CalendarExportResult) =>
                    r?.success ? "Export Successful!" : "Export Failed"
                  )}
                </div>
                <div style={{
                  fontSize: "0.85em",
                  color: derive(calendarExportResult, (r: CalendarExportResult) =>
                    r?.success ? "#047857" : "#b91c1c"
                  ),
                }}>
                  {derive(calendarExportResult, (r: CalendarExportResult) => r?.message)}
                </div>
              </div>
              {/* Download button for ICS files */}
              {ifElse(
                derive(calendarExportResult, (r: CalendarExportResult) => !!r?.icsContent),
                <ct-file-download
                  $data={derive(calendarExportResult, (r: CalendarExportResult) => r?.icsContent || "")}
                  $filename={derive(calendarExportResult, (r: CalendarExportResult) => r?.icsFilename || "calendar.ics")}
                  mime-type="text/calendar"
                  variant="primary"
                  size="sm"
                >
                  Download ICS
                </ct-file-download>,
                null
              )}
              <button
                onClick={dismissExportResult({ result: calendarExportResult })}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.2em",
                  cursor: "pointer",
                  color: derive(calendarExportResult, (r: CalendarExportResult) =>
                    r?.success ? "#065f46" : "#991b1b"
                  ),
                }}
              >
                ×
              </button>
            </div>,
            null
          )}

          {/* Calendar Export Confirmation Dialog */}
          {ifElse(
            derive(pendingCalendarExport, (p: PendingCalendarExport) => p !== null),
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  maxWidth: "600px",
                  width: "90%",
                  maxHeight: "90vh",
                  overflow: "auto",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: "20px",
                    borderBottom: "2px solid #f59e0b",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <span style={{ fontSize: "24px" }}>📅</span>
                  <h3 style={{ margin: 0, fontSize: "20px", color: "#b45309" }}>
                    Export to Calendar
                  </h3>
                </div>

                {/* Content */}
                <div style={{ padding: "20px" }}>
                  {/* Summary */}
                  <div
                    style={{
                      background: "#f9fafb",
                      borderRadius: "8px",
                      padding: "16px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px" }}>
                      {derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                        `${p?.childName}'s ${p?.setName} Schedule`
                      )}
                    </div>

                    {/* Event count */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "#4b5563" }}>
                      <span>📝</span>
                      <span>
                        {derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                          `${p?.eventCount} recurring events from ${p?.classes.length} classes`
                        )}
                      </span>
                    </div>

                    {/* Date range */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "#4b5563" }}>
                      <span>📆</span>
                      <span>
                        {derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                          `${p?.semester.startDate} to ${p?.semester.endDate}`
                        )}
                      </span>
                    </div>

                    {/* Target calendar */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", color: "#4b5563" }}>
                      <span>📁</span>
                      <span>
                        Target calendar: <strong>{derive(pendingCalendarExport, (p: PendingCalendarExport) => p?.calendarName || "Calendar")}</strong>
                      </span>
                    </div>

                    {/* Classes list */}
                    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
                      <div style={{ fontWeight: "500", marginBottom: "8px" }}>Classes to export:</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                          (p?.classes || []).map((cls: Class) => (
                            <span
                              style={{
                                background: "white",
                                border: "1px solid #e5e7eb",
                                borderRadius: "16px",
                                padding: "4px 10px",
                                fontSize: "13px",
                              }}
                            >
                              {cls.name}
                              <span style={{ color: "#888", marginLeft: "4px" }}>
                                ({(cls.timeSlots || []).map((s: TimeSlot) => s.day.slice(0, 3)).join(", ")})
                              </span>
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Duplicates warning - only show if there are duplicates */}
                    {ifElse(
                      derive(pendingCalendarExport, (p: PendingCalendarExport) => (p?.duplicateCount || 0) > 0),
                      <div style={{ marginTop: "12px", padding: "8px 12px", background: "#fef3c7", borderRadius: "6px", border: "1px solid #f59e0b" }}>
                        <div style={{ color: "#92400e", fontSize: "13px" }}>
                          ⚠️ {derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                            `${p?.duplicateCount} event(s) already in outbox and will be skipped`
                          )}
                        </div>
                      </div>,
                      null
                    )}

                    {/* Skipped items - only show if there are skipped items */}
                    {ifElse(
                      derive(pendingCalendarExport, (p: PendingCalendarExport) => (p?.skippedItems || []).length > 0),
                      <div style={{ marginTop: "12px", padding: "8px 12px", background: "#fef2f2", borderRadius: "6px", border: "1px solid #fecaca" }}>
                        <div style={{ color: "#991b1b", fontSize: "13px", fontWeight: "500", marginBottom: "4px" }}>
                          ⚠️ Some items were skipped:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "12px", color: "#7f1d1d" }}>
                          {derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                            (p?.skippedItems || []).slice(0, 5).map((item) => (
                              <li>{item.className}: {item.reason}</li>
                            ))
                          )}
                          {ifElse(
                            derive(pendingCalendarExport, (p: PendingCalendarExport) => (p?.skippedItems || []).length > 5),
                            <li style={{ fontStyle: "italic" }}>
                              {derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                                `...and ${(p?.skippedItems || []).length - 5} more`
                              )}
                            </li>,
                            null
                          )}
                        </ul>
                      </div>,
                      null
                    )}
                  </div>

                  {/* Export Target Selection */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontWeight: "500", marginBottom: "8px" }}>Export to:</div>

                    {/* Google Auth UI - shows picker or status when needed */}
                    <div style={{ marginBottom: "8px" }}>
                      {googleAuthManager.fullUI}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {/* Google Calendar option */}
                      <button
                        onClick={selectExportTarget({ pendingExport: pendingCalendarExport, target: "google" })}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px 16px",
                          border: derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                            p?.selectedTarget === "google" ? "2px solid #4285f4" : "1px solid #ddd"
                          ),
                          borderRadius: "8px",
                          background: derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                            p?.selectedTarget === "google" ? "#e8f0fe" : "white"
                          ),
                          cursor: derive(googleAuthManager.isReady, (ready) => ready ? "pointer" : "not-allowed"),
                          textAlign: "left",
                          opacity: derive(googleAuthManager.isReady, (ready) => ready ? 1 : 0.5),
                        }}
                        disabled={derive(googleAuthManager.isReady, (ready) => !ready)}
                      >
                        <span style={{ fontSize: "24px" }}>📅</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: "500" }}>Google Calendar</div>
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            {ifElse(
                              googleAuthManager.isReady,
                              derive(googleAuthManager.currentEmail, (email) =>
                                `Export to ${email || "your Google Calendar"}`
                              ),
                              derive(googleAuthManager.currentState, (state) =>
                                state === "loading" ? "Loading..." :
                                state === "not-found" ? "Create a Google Auth charm first" :
                                state === "selecting" ? "Select an account above" :
                                "Sign in with Google to enable"
                              )
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Apple Calendar option */}
                      <button
                        onClick={selectExportTarget({ pendingExport: pendingCalendarExport, target: "apple" })}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px 16px",
                          border: derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                            p?.selectedTarget === "apple" ? "2px solid #4285f4" : "1px solid #ddd"
                          ),
                          borderRadius: "8px",
                          background: derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                            p?.selectedTarget === "apple" ? "#e8f0fe" : "white"
                          ),
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ fontSize: "24px" }}>🍎</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: "500" }}>Apple Calendar</div>
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            Add to outbox for apple-sync CLI
                          </div>
                        </div>
                      </button>

                      {/* ICS Download option */}
                      <button
                        onClick={selectExportTarget({ pendingExport: pendingCalendarExport, target: "ics" })}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px 16px",
                          border: derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                            p?.selectedTarget === "ics" ? "2px solid #4285f4" : "1px solid #ddd"
                          ),
                          borderRadius: "8px",
                          background: derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                            p?.selectedTarget === "ics" ? "#e8f0fe" : "white"
                          ),
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ fontSize: "24px" }}>📥</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: "500" }}>Download .ics</div>
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            Download file to import into any calendar app
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Warning - varies by target */}
                  {ifElse(
                    derive(pendingCalendarExport, (p: PendingCalendarExport) => p?.selectedTarget !== null),
                    <div
                      style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border: "1px solid #f59e0b",
                        background: "#fef3c7",
                      }}
                    >
                      <div style={{ fontWeight: "600", marginBottom: "4px", color: "#92400e" }}>
                        {derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                          `This will add ${p?.eventCount || 0} events to your calendar`
                        )}
                      </div>
                      <div style={{ fontSize: "14px", color: "#78350f" }}>
                        {derive(pendingCalendarExport, (p: PendingCalendarExport) => {
                          if (p?.selectedTarget === "google") {
                            return "Events will be created directly in your Google Calendar. Weekly recurring events will be created until the semester end date.";
                          } else if (p?.selectedTarget === "apple") {
                            return "Events will be added to the outbox for apple-sync to process. An ICS file will also be downloaded as a backup.";
                          } else {
                            return "Download the .ics file and import it into your preferred calendar application.";
                          }
                        })}
                      </div>
                      {ifElse(
                        derive(pendingCalendarExport, (p: PendingCalendarExport) => p?.selectedTarget === "apple"),
                        <div style={{ fontSize: "12px", color: "#a16207", marginTop: "8px", fontStyle: "italic" }}>
                          Run <code style={{ background: "#fff3cd", padding: "1px 4px", borderRadius: "2px" }}>apple-sync calendar-write</code> to sync events to Apple Calendar.
                        </div>,
                        null
                      )}
                    </div>,
                    null
                  )}

                  {/* Progress bar for Google Calendar export */}
                  {ifElse(
                    derive(calendarExportProgress, (p: CalendarExportProgress) => p !== null),
                    <div style={{ marginTop: "16px" }}>
                      <div style={{
                        height: "8px",
                        backgroundColor: "#e5e7eb",
                        borderRadius: "4px",
                        overflow: "hidden",
                        marginBottom: "8px",
                      }}>
                        <div style={{
                          height: "100%",
                          backgroundColor: "#4285f4",
                          width: derive(calendarExportProgress, (p: CalendarExportProgress) => `${p?.percentComplete || 0}%`),
                          transition: "width 0.3s",
                        }} />
                      </div>
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {derive(calendarExportProgress, (p: CalendarExportProgress) =>
                          p?.phase === "preparing" ? "Preparing..." :
                          p?.phase === "exporting" ? `Exporting ${p.processed}/${p.total}${p.currentEvent ? `: ${p.currentEvent}` : ""}` :
                          p?.phase === "done" ? "Complete!" :
                          p?.phase === "error" ? `Error: ${p.error}` :
                          "Processing..."
                        )}
                      </div>
                    </div>,
                    null
                  )}
                </div>

                {/* Footer */}
                <div
                  style={{
                    padding: "16px 20px",
                    borderTop: "1px solid #e5e7eb",
                    display: "flex",
                    gap: "12px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={cancelCalendarExport({ pendingExport: pendingCalendarExport })}
                    disabled={calendarExportProcessing}
                    style={{
                      padding: "10px 20px",
                      background: "white",
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: "500",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmCalendarExport({
                      pendingExport: pendingCalendarExport,
                      processing: calendarExportProcessing,
                      progress: calendarExportProgress,
                      result: calendarExportResult,
                      classList: classes,
                      outbox: calendarOutbox,
                      auth: googleAuthManager.auth,
                    })}
                    disabled={exportButtonDisabled}
                    style={{
                      padding: "10px 20px",
                      background: derive(exportButtonDisabled, (disabled) => disabled ? "#d1d5db" : "#f59e0b"),
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: "500",
                      cursor: derive(exportButtonDisabled, (disabled) => disabled ? "not-allowed" : "pointer"),
                      opacity: derive(exportButtonDisabled, (disabled) => disabled ? 0.7 : 1),
                    }}
                  >
                    {ifElse(
                      calendarExportProcessing,
                      "Exporting...",
                      derive(pendingCalendarExport, (p: PendingCalendarExport) =>
                        p?.selectedTarget ? "Export to Calendar" : "Select a destination"
                      )
                    )}
                  </button>
                </div>
              </div>
            </div>,
            null
          )}

          {/* Classes Section */}
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Classes</h2>
            {/* List classes - SINGLE FLAT DERIVE (no nesting to preserve reactivity) */}
            <div style={{ marginBottom: "1rem" }}>
              {classes.map((cls, idx) => {
                // ALL reactive values in ONE derive call - no nested derive/computed allowed!
                return derive({
                  name: cls.name,
                  description: cls.description,
                  location: cls.location,
                  timeSlots: cls.timeSlots,
                  cost: cls.cost,
                  gradeMin: cls.gradeMin,
                  gradeMax: cls.gradeMax,
                  pinnedInSets: cls.pinnedInSets,
                  statuses: cls.statuses,
                  editIdx: editingClassIndex,
                  activeSet: activeSetName,
                  locs: locations,
                }, (props) => {
                  // Destructure with proper types - derive unwraps Cell values for item properties
                  // Pattern-level Cells (editIdx, activeSet, locs) need .get()
                  const name = props.name as string;
                  const description = props.description as string;
                  const location = props.location as Location;
                  const timeSlots = props.timeSlots as TimeSlot[];
                  const cost = props.cost as number;
                  const gradeMin = props.gradeMin as string;
                  const gradeMax = props.gradeMax as string;
                  const pinnedInSets = props.pinnedInSets as string[];
                  const statuses = props.statuses as StatusFlags;
                  // Pattern-level Cells remain as Cells - use .get()
                  const editIdx = (props.editIdx as Cell<number>).get();
                  const activeSet = (props.activeSet as Cell<string>).get();
                  const locs = (props.locs as Cell<Location[]>).get();

                  const locColor = getLocationColor(location?.name || "");
                  const isEditing = editIdx === idx;
                  const pinArray: string[] = Array.isArray(pinnedInSets) ? pinnedInSets : [];
                  const isPinned = pinArray.includes(activeSet);
                  const slots = timeSlots || [];
                  const firstSlot = slots[0];
                  const dayTimeDisplay = firstSlot
                    ? `${firstSlot.day?.slice(0, 3) || "?"} ${firstSlot.startTime || "?"}-${firstSlot.endTime || "?"}`
                    : "(no time set)";

                  return (
                    <div
                      style={{
                        padding: "0.75rem",
                        background: isPinned ? "#e3f2fd" : "#f9f9f9",
                        border: `1px solid ${isPinned ? "#1976d2" : "#e0e0e0"}`,
                        borderRadius: "4px",
                        marginBottom: "0.5rem",
                        borderLeft: `4px solid ${locColor.border}`,
                      }}
                    >
                      {/* Main row: pin, name, location, day/time, buttons */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
                          {/* Pin button */}
                          <ct-button
                            variant="ghost"
                            style={{ padding: "2px 6px", fontSize: "1em", minWidth: "auto" }}
                            onClick={togglePinClass({ classList: classes, activeSet: activeSetName, idx })}
                            title={isPinned ? "Unpin from set" : "Pin to set"}
                          >
                            {isPinned ? "📍" : "📌"}
                          </ct-button>
                          <span style={{ fontWeight: "bold" }}>{name}</span>
                          <span style={{ color: "#666", fontSize: "0.9em" }}>
                            @ {location?.name || "Unknown"}
                          </span>
                          <span style={{ color: "#888", fontSize: "0.85em" }}>
                            {dayTimeDisplay}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "0.25rem" }}>
                          <ct-button
                            variant="ghost"
                            style={{ padding: "2px 6px", fontSize: "0.85em" }}
                            onClick={() => editingClassIndex.set(isEditing ? -1 : idx)}
                          >
                            {isEditing ? "Done" : "Edit"}
                          </ct-button>
                          <ct-button
                            variant="ghost"
                            style={{ padding: "2px 6px", fontSize: "0.85em", color: "#c62828" }}
                            onClick={() => {
                              const current = classes.get();
                              const index = current.findIndex((el) => Cell.equals(cls, el));
                              if (index >= 0) {
                                classes.set(current.toSpliced(index, 1));
                              }
                            }}
                          >
                            ✕
                          </ct-button>
                        </div>
                      </div>

                      {/* Status checkboxes row */}
                      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                        {(["registered", "confirmed", "waitlisted", "paid", "onCalendar"] as const).map((key) => (
                          <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.8em", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={statuses?.[key] || false}
                              onChange={() => toggleStatus(classes, cls, key)}
                            />
                            {key === "onCalendar" ? "On Cal" : key.charAt(0).toUpperCase() + key.slice(1)}
                          </label>
                        ))}
                      </div>

                      {/* Edit panel - shown when editing */}
                      {isEditing && (
                        <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#fff", border: "1px solid #e0e0e0", borderRadius: "4px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8em", marginBottom: "0.25rem" }}>Name:</label>
                              <input
                                type="text"
                                value={name || ""}
                                style={{ width: "100%", padding: "0.25rem" }}
                                onChange={updateClassField({ classList: classes, idx, field: "name" })}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8em", marginBottom: "0.25rem" }}>Location:</label>
                              <select
                                value={locs.findIndex((l: Location) => l.name === location?.name)}
                                style={{ width: "100%", padding: "0.25rem" }}
                                onChange={updateClassLocation({ classList: classes, locs: locations, classIdx: idx })}
                              >
                                {locs.map((loc: Location, locIdx: number) => (
                                  <option value={locIdx}>{loc.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div style={{ marginBottom: "0.5rem" }}>
                            <label style={{ display: "block", fontSize: "0.8em", marginBottom: "0.25rem" }}>Description:</label>
                            <textarea
                              value={description || ""}
                              style={{ width: "100%", padding: "0.25rem", minHeight: "60px" }}
                              onChange={updateClassField({ classList: classes, idx, field: "description" })}
                            />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8em", marginBottom: "0.25rem" }}>Cost ($):</label>
                              <input
                                type="number"
                                value={cost || 0}
                                style={{ width: "100%", padding: "0.25rem" }}
                                onChange={updateClassCost({ classList: classes, idx })}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8em", marginBottom: "0.25rem" }}>Grade Min:</label>
                              <input
                                type="text"
                                value={gradeMin || ""}
                                style={{ width: "100%", padding: "0.25rem" }}
                                onChange={updateClassField({ classList: classes, idx, field: "gradeMin" })}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "0.8em", marginBottom: "0.25rem" }}>Grade Max:</label>
                              <input
                                type="text"
                                value={gradeMax || ""}
                                style={{ width: "100%", padding: "0.25rem" }}
                                onChange={updateClassField({ classList: classes, idx, field: "gradeMax" })}
                              />
                            </div>
                          </div>

                          {/* Time slots */}
                          <div>
                            <label style={{ display: "block", fontSize: "0.8em", marginBottom: "0.25rem" }}>Time Slots:</label>
                            {slots.map((slot: TimeSlot, slotIdx: number) => (
                              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.25rem" }}>
                                <select
                                  value={slot.day || "monday"}
                                  style={{ padding: "0.25rem" }}
                                  onChange={updateClassTimeSlot({ classList: classes, classIdx: idx, slotIdx, field: "day" })}
                                >
                                  {SCHEDULE_DAYS.map((d) => (
                                    <option value={d}>{d.slice(0, 3)}</option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={slot.startTime || ""}
                                  placeholder="15:00"
                                  style={{ width: "60px", padding: "0.25rem" }}
                                  onChange={updateClassTimeSlot({ classList: classes, classIdx: idx, slotIdx, field: "startTime" })}
                                />
                                <span>-</span>
                                <input
                                  type="text"
                                  value={slot.endTime || ""}
                                  placeholder="16:00"
                                  style={{ width: "60px", padding: "0.25rem" }}
                                  onChange={updateClassTimeSlot({ classList: classes, classIdx: idx, slotIdx, field: "endTime" })}
                                />
                                <ct-button
                                  variant="ghost"
                                  style={{ padding: "2px 6px", fontSize: "0.8em" }}
                                  onClick={removeClassTimeSlot({ classList: classes, classIdx: idx, slotIdx })}
                                >
                                  ✕
                                </ct-button>
                              </div>
                            ))}
                            <ct-button
                              variant="ghost"
                              style={{ padding: "2px 6px", fontSize: "0.8em", marginTop: "0.25rem" }}
                              onClick={addClassTimeSlot({ classList: classes, idx })}
                            >
                              + Add Time Slot
                            </ct-button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })}
            </div>

            {/* Add class form */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              <h3 style={{ marginBottom: "0.5rem" }}>Add Class</h3>
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>
                  Location:
                </label>
                {/* Native select with value binding and handler for state sync */}
                <select
                  style={{ width: "100%", padding: "0.5rem" }}
                  value={selectedLocationIndex}
                  onChange={setLocationIndex({ idx: selectedLocationIndex })}
                >
                  <option value="-1">-- Select a location --</option>
                  {locations.map((loc, idx) => (
                    <option value={idx}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <ct-message-input
                placeholder="Class name (e.g., Robotics, Dance)"
                onct-send={(e: { detail?: { message?: string } }) => {
                  const name = e.detail?.message?.trim();
                  const locIdx = selectedLocationIndex.get();
                  const locs = locations.get();
                  if (name && locIdx >= 0 && locIdx < locs.length) {
                    classes.push({
                      name,
                      description: "",
                      location: locs[locIdx],
                      timeSlots: [],
                      cost: 0,
                      gradeMin: "",
                      gradeMax: "",
                      pinnedInSets: [],
                      statuses: {
                        registered: false,
                        confirmed: false,
                        waitlisted: false,
                        paid: false,
                        onCalendar: false,
                      },
                    });
                  }
                }}
              />
            </div>
          </div>

          {/* Import Section - Phase 3 */}
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Import Classes</h2>
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              {/* Location selector for import */}
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>
                  Import to Location:
                </label>
                <select
                  style={{ width: "100%", padding: "0.5rem" }}
                  onChange={setLocationIndex({ idx: importLocationIndex })}
                >
                  <option value="-1">-- Select a location --</option>
                  {locations.map((loc, idx) => (
                    <option value={idx}>{loc.name}</option>
                  ))}
                </select>
              </div>

              {/* Phase 5.5: Unified Upload Section */}
              <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <ct-file-input
                    accept="image/*,.txt,.md,.html,.htm"
                    buttonText="Upload Schedule"
                    maxSizeBytes={3932160}
                    onct-change={handleFileUpload({
                      uploadedFile,
                      processingStatus: uploadProcessingStatus,
                      extractedText: uploadExtractedText,
                      extractionError: uploadExtractionError,
                    })}
                  />
                  <span style={{ fontSize: "0.85em", color: "#64748b" }}>
                    Photo (for OCR) or text file
                  </span>
                </div>

                {/* Error state - only show when error is truthy */}
                {derive(uploadExtractionError, (e) => {
                  if (!e) return null;
                  return (
                    <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#fef2f2", borderRadius: "4px", color: "#dc2626", fontSize: "0.85em" }}>
                      {e}
                    </div>
                  );
                })}

                {/* Processing state (image OCR) */}
                {ifElse(
                  ocrPending,
                  <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#dbeafe", borderRadius: "4px", color: "#1e40af", fontSize: "0.85em" }}>
                    Extracting text from image...
                  </div>,
                  null
                )}
              </div>

              {/* Preview Step - shown when extraction complete */}
              {ifElse(
                showPreview,
                <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "4px" }}>
                  <div style={{ marginBottom: "0.5rem", color: "#166534", fontWeight: "bold", fontSize: "0.9em" }}>
                    Text Extracted - Review & Edit
                  </div>
                  <ct-textarea
                    style={{ width: "100%", minHeight: "200px", fontFamily: "monospace", fontSize: "0.85em" }}
                    placeholder="Extracted text will appear here..."
                    $value={previewText}
                  />
                  <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                    <ct-button
                      variant="primary"
                      onClick={applyExtractedText({
                        extractedText: uploadExtractedText,
                        importText,
                        uploadedFile,
                        processingStatus: uploadProcessingStatus,
                        ocrText: (ocrResult as any)?.extractedText || null,
                      })}
                    >
                      Use This Text
                    </ct-button>
                    <ct-button
                      variant="secondary"
                      onClick={cancelUpload({
                        uploadedFile,
                        extractedText: uploadExtractedText,
                        processingStatus: uploadProcessingStatus,
                        extractionError: uploadExtractionError,
                      })}
                    >
                      Cancel
                    </ct-button>
                  </div>
                </div>,
                null
              )}

              {/* Text input for schedule */}
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>
                  Paste schedule text:
                </label>
                <ct-textarea
                  style={{ width: "100%", minHeight: "150px" }}
                  placeholder="Paste schedule HTML or text here..."
                  $value={importText}
                />
              </div>

              {/* Extract button */}
              <ct-button
                style={{ padding: "0.5rem 1rem", marginBottom: "1rem" }}
                onClick={() => {
                  const text = importText.get();
                  if (text && text.length >= 50) {
                    extractionTriggerText.set(text);
                  }
                }}
              >
                Extract Classes
              </ct-button>

              {/* Extraction status */}
              {ifElse(
                extractionPending,
                <p style={{ color: "#666", fontStyle: "italic" }}>Extracting classes...</p>,
                null
              )}

              {/* WORKAROUND: Using pre-computed s.triageBgColor because
                  s.triageStatus === "auto_kept" doesn't work inside Cell.map() */}
              {stagedClasses.map((s, idx) => {
                // s.triageBgColor, s.triageBorderColor, s.triageEmoji are pre-computed strings
                return (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem",
                      background: s.triageBgColor,
                      borderLeft: `3px solid ${s.triageBorderColor}`,
                      borderRadius: "4px",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {/* WORKAROUND: Use onClick handler instead of $checked - see ISSUE file */}
                    <ct-checkbox
                      checked={s.selected}
                      onClick={toggleStagedSelection({ staged: stagedClasses, idx })}
                    />
                    <span style={{ fontWeight: "bold", minWidth: "20px" }}>
                      {s.triageEmoji}
                    </span>
                    <span style={{ fontWeight: "bold" }}>{s.name}</span>
                    <span style={{ color: "#666", fontSize: "0.85em" }}>
                      {s.dayOfWeek} {s.startTime}-{s.endTime}
                    </span>
                    {ifElse(
                      s.gradeMin && s.gradeMax,
                      <span style={{ color: "#888", fontSize: "0.8em" }}>
                        Gr {s.gradeMin}-{s.gradeMax}
                      </span>,
                      null
                    )}
                    <span style={{ marginLeft: "auto", fontSize: "0.75em", color: "#666", maxWidth: "200px" }}>
                      {s.triageReason}
                    </span>
                  </div>
                );
              })}

              {/* Header with triage counts - using computed values */}
              {ifElse(
                hasStaged,
                <div style={{ marginTop: "1rem", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
                  <h4 style={{ marginBottom: "0.5rem" }}>Extracted Classes - Triage Results</h4>
                  <p style={{ fontSize: "0.85em", color: "#666", marginBottom: "0.5rem" }}>
                    ✓ Eligible: {triageCounts.kept} | ? Review: {triageCounts.needsReview} | ✗ Ineligible: {triageCounts.discarded}
                  </p>
                </div>,
                null
              )}

              {/* Import button - using pre-computed values */}
              {ifElse(
                hasStaged,
                <ct-button
                  variant="primary"
                  style={{ marginTop: "0.5rem" }}
                  disabled={importButtonDisabled}
                  onClick={doImportAll({
                    locIdx: importLocationIndex,
                    locs: locations,
                    classList: classes,
                    staged: stagedClasses,
                    trigger: extractionTriggerText,
                    text: importText,
                    lastText: lastProcessedExtractionText,
                  })}
                >
                  {importButtonText}
                </ct-button>,
                null
              )}
            </div>
          </div>

          {/* Locations Section - at bottom since rarely edited */}
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Locations</h2>

            {/* List locations with color indicators */}
            <div style={{ marginBottom: "1rem" }}>
              {locations.map((loc) => {
                // Use derive to unwrap reactive location properties
                return derive({ name: loc.name, type: loc.type, address: loc.address }, ({ name, type, address }) => {
                  const locColor = getLocationColor(name || "");
                  return (
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                        padding: "0.5rem",
                        background: "#f5f5f5",
                        borderRadius: "4px",
                        marginBottom: "0.5rem",
                        borderLeft: `4px solid ${locColor.border}`,
                      }}
                    >
                      <span
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "2px",
                          background: locColor.bg,
                          border: `1px solid ${locColor.border}`,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: "bold" }}>{name}</span>
                      <span style={{ color: "#666", fontSize: "0.9em" }}>
                        ({type})
                      </span>
                      {address && (
                        <span style={{ color: "#888", fontSize: "0.8em" }}>
                          - {address}
                        </span>
                      )}
                      <ct-button
                        style={{ marginLeft: "auto" }}
                        onClick={() => {
                          const current = locations.get();
                          const index = current.findIndex((el) =>
                            Cell.equals(loc, el)
                          );
                          if (index >= 0) {
                            locations.set(current.toSpliced(index, 1));
                          }
                        }}
                      >
                        Remove
                      </ct-button>
                    </div>
                  );
                });
              })}
            </div>

            {/* Add location */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              <h3 style={{ marginBottom: "0.5rem" }}>Add Location</h3>
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{ fontSize: "0.9em", marginRight: "0.5rem" }}>Type:</label>
                <ct-select
                  $value={newLocationType}
                  items={[
                    { label: "Afterschool (On-site)", value: "afterschool-onsite" },
                    { label: "Afterschool (Off-site)", value: "afterschool-offsite" },
                    { label: "External", value: "external" },
                  ]}
                  style={{ padding: "0.25rem" }}
                />
              </div>
              <ct-message-input
                placeholder="Location name (e.g., TBS, BAM)"
                button-text="Add"
                onct-send={(e: { detail: { message: string } }) => {
                  const name = e.detail?.message?.trim();
                  if (name) {
                    locations.push({
                      name,
                      type: newLocationType.get(),
                      address: "",
                    });
                  }
                }}
              />
            </div>
          </div>
        </div>
      ),
      locations,
      classes,
      child,
      pinnedSetNames,
      activeSetName,
      // stagedClasses is a pattern INPUT (not local cell) for idiomatic $checked binding
      // Local cells don't support cell-like property access in .map(); pattern inputs do
      stagedClasses,
      // Calendar export fields
      semesterDates,
      calendarName,
      calendarOutbox,
    };
  }
);
